import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';

// Use execFile instead of exec - prevents shell injection attacks
const execFileAsync = promisify(execFile);

// SECURITY: Whitelist of allowed repository names (prevents injection via repo name)
const ALLOWED_REPOSITORIES = new Set([
  'shared-modules',
  'app-domain-ssl-monitor'
]);

// SECURITY: Whitelist of allowed deploy script paths (absolute paths only)
const ALLOWED_DEPLOY_SCRIPTS = new Set([
  '/home/www/apps/shared-modules/deploy.sh',
  '/home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh',
  // Add other trusted paths here
]);

interface WebhookPayload {
  ref?: string;
  repository?: {
    name: string;
    full_name: string;
  };
}

interface WebhookRequest extends FastifyRequest {
  body: WebhookPayload;
}

interface RepositoryConfig {
  deployScript: string;
  deployBranch: string;
  projectPath: string;
}

// SECURITY: Validate deploy script path against whitelist
function isDeployScriptAllowed(scriptPath: string): boolean {
  if (!scriptPath || typeof scriptPath !== 'string') {
    return false;
  }

  // Must be absolute path
  if (!isAbsolute(scriptPath)) {
    return false;
  }

  // Resolve to prevent path traversal (../)
  const resolvedPath = resolve(scriptPath);

  // Must be in whitelist
  if (!ALLOWED_DEPLOY_SCRIPTS.has(resolvedPath)) {
    return false;
  }

  // Must exist on filesystem
  if (!existsSync(resolvedPath)) {
    return false;
  }

  return true;
}

// SECURITY: Constant-time signature comparison to prevent timing attacks
function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }

  const hmac = createHmac('sha256', secret);
  const expectedSignature = 'sha256=' + hmac.update(payload).digest('hex');

  // Both must be same length for timingSafeEqual
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
  } catch {
    return false;
  }
}

// Repository deployment configuration
// SECURITY: Hardcoded configs only - no dynamic loading from env for script paths
const getRepositoryConfig = (repoName: string): RepositoryConfig | null => {
  // SECURITY: Only allow whitelisted repository names
  if (!ALLOWED_REPOSITORIES.has(repoName)) {
    return null;
  }

  // SECURITY: Hardcoded configurations - deploy script paths are NOT configurable via env
  // This prevents attackers from injecting malicious scripts via environment manipulation
  const configs: Record<string, RepositoryConfig> = {
    'shared-modules': {
      deployScript: '/home/www/apps/shared-modules/deploy.sh',
      deployBranch: process.env.SHARED_MODULES_DEPLOY_BRANCH || 'main',
      projectPath: '/home/www/apps/shared-modules'
    },
    'app-domain-ssl-monitor': {
      deployScript: '/home/www/apps/app-domain-ssl-monitor/frontend/deploy.sh',
      deployBranch: process.env.FRONTEND_DEPLOY_BRANCH || 'main',
      projectPath: '/home/www/apps/app-domain-ssl-monitor/frontend'
    }
  };

  const config = configs[repoName];

  // SECURITY: Validate the deploy script is allowed before returning
  if (config && !isDeployScriptAllowed(config.deployScript)) {
    console.error(`[SECURITY] Deploy script not allowed or not found: ${config.deployScript}`);
    return null;
  }

  return config || null;
};

export async function webhookRoutes(fastify: FastifyInstance) {
  // GitHub webhook endpoint
  fastify.post('/webhook/deploy', async (request: WebhookRequest, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-hub-signature-256'] as string;
      const payload = JSON.stringify(request.body);
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      // SECURITY: Webhook secret is MANDATORY - fail if not configured
      if (!webhookSecret) {
        fastify.log.error('[SECURITY] GITHUB_WEBHOOK_SECRET not configured - rejecting all webhooks');
        return reply.code(503).send({ error: 'Webhook not configured' });
      }

      // SECURITY: Signature is MANDATORY
      if (!signature) {
        fastify.log.error('[SECURITY] Missing webhook signature');
        return reply.code(401).send({ error: 'Missing signature' });
      }

      // SECURITY: Verify signature using constant-time comparison
      if (!verifySignature(payload, signature, webhookSecret)) {
        fastify.log.error('[SECURITY] Invalid webhook signature - possible attack attempt');
        return reply.code(401).send({ error: 'Invalid signature' });
      }

      // Get repository name from the payload
      const repoName = request.body.repository?.name;
      if (!repoName || typeof repoName !== 'string') {
        return reply.code(400).send({ error: 'Repository name not found in payload' });
      }

      // SECURITY: Validate repository name against whitelist
      if (!ALLOWED_REPOSITORIES.has(repoName)) {
        fastify.log.warn(`[SECURITY] Rejected webhook for non-whitelisted repository: ${repoName}`);
        return reply.code(403).send({ error: 'Repository not allowed' });
      }

      // Get repository configuration
      const repoConfig = getRepositoryConfig(repoName);
      if (!repoConfig) {
        fastify.log.warn(`No configuration found for repository: ${repoName}`);
        return reply.send({
          message: `Repository ${repoName} is not configured for automatic deployment`
        });
      }

      // Get the branch from the payload
      const branch = request.body.ref?.replace('refs/heads/', '');
      const targetBranch = repoConfig.deployBranch;

      fastify.log.info(`Webhook received for repository: ${repoName}, branch: ${branch}`);

      // Only deploy if it's the target branch
      if (branch !== targetBranch) {
        return reply.send({
          message: `Ignoring push to ${branch}. Only deploying ${targetBranch} for ${repoName}.`
        });
      }

      fastify.log.info(`Starting deployment for ${repoName} from branch ${branch}...`);

      // SECURITY: Use execFile instead of exec - prevents shell injection
      // execFile does NOT spawn a shell, so command injection is not possible
      // The script path is already validated against whitelist in getRepositoryConfig
      execFileAsync('/bin/bash', [repoConfig.deployScript], {
        cwd: repoConfig.projectPath,
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
      })
        .then(({ stdout, stderr }) => {
          fastify.log.info(`Deployment completed successfully for ${repoName}`);
          if (stdout) fastify.log.info('STDOUT:', stdout.substring(0, 1000)); // Limit log size
          if (stderr) fastify.log.warn('STDERR:', stderr.substring(0, 1000));
        })
        .catch((error) => {
          fastify.log.error(`Deployment failed for ${repoName}:`, error.message);
        });

      // Respond immediately to GitHub
      return reply.send({
        message: `Deployment started for ${repoName} (${branch})`,
        repository: repoName,
        branch: branch,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      fastify.log.error('Webhook error:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Health check for webhook
  fastify.get('/webhook/health', async () => {
    const repositories = ['shared-modules', 'app-domain-ssl-monitor'];
    const configuredRepos = repositories
      .map(repo => {
        const config = getRepositoryConfig(repo);
        return config ? { name: repo, branch: config.deployBranch, configured: true } : null;
      })
      .filter(Boolean);

    return {
      status: 'ok',
      repositories: configuredRepos,
      timestamp: new Date().toISOString()
    };
  });
}
