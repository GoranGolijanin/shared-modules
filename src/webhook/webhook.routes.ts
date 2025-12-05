import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// Repository deployment configuration
// Can be configured via environment variables
const getRepositoryConfig = (repoName: string): RepositoryConfig | null => {
  // Load repository configurations from environment variables
  const configs = process.env.REPO_CONFIGS ? JSON.parse(process.env.REPO_CONFIGS) : {};

  // Return specific config if exists
  if (configs[repoName]) {
    return configs[repoName];
  }

  // Default fallback configurations based on known repository names
  const defaultConfigs: Record<string, RepositoryConfig> = {
    'shared-modules': {
      deployScript: process.env.SHARED_MODULES_DEPLOY_SCRIPT || '/path/to/shared-modules/deploy.sh',
      deployBranch: process.env.SHARED_MODULES_DEPLOY_BRANCH || 'main',
      projectPath: process.env.SHARED_MODULES_PATH || '/path/to/shared-modules'
    },
    'app-domain-ssl-monitor': {
      deployScript: process.env.FRONTEND_DEPLOY_SCRIPT || '/path/to/app-domain-ssl-monitor/frontend/deploy.sh',
      deployBranch: process.env.FRONTEND_DEPLOY_BRANCH || 'main',
      projectPath: process.env.FRONTEND_PATH || '/path/to/app-domain-ssl-monitor/frontend'
    }
  };

  return defaultConfigs[repoName] || null;
};

export async function webhookRoutes(fastify: FastifyInstance) {
  // GitHub webhook endpoint
  fastify.post('/webhook/deploy', async (request: WebhookRequest, reply: FastifyReply) => {
    try {
      const signature = request.headers['x-hub-signature-256'] as string;
      const payload = JSON.stringify(request.body);
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      // Verify webhook signature for security
      if (webhookSecret && signature) {
        const hmac = createHmac('sha256', webhookSecret);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');

        if (signature !== digest) {
          fastify.log.error('Invalid webhook signature');
          return reply.code(401).send({ error: 'Invalid signature' });
        }
      } else if (!webhookSecret) {
        fastify.log.warn('GITHUB_WEBHOOK_SECRET not set - webhook signature verification disabled');
      }

      // Get repository name from the payload
      const repoName = request.body.repository?.name;
      if (!repoName) {
        return reply.code(400).send({ error: 'Repository name not found in payload' });
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

      // Run deployment in the background to avoid timeout
      execAsync(repoConfig.deployScript)
        .then(({ stdout, stderr }) => {
          fastify.log.info(`Deployment completed successfully for ${repoName}`);
          fastify.log.info('STDOUT:', stdout);
          if (stderr) fastify.log.warn('STDERR:', stderr);
        })
        .catch((error) => {
          fastify.log.error(`Deployment failed for ${repoName}:`, error);
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
