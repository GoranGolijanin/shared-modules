import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { SubscriptionService } from '../subscription/subscription.service.js';
import { LoggerService } from '../logging/logger.service.js';

// Extend FastifyInstance with subscription status check
declare module 'fastify' {
  interface FastifyInstance {
    checkSubscriptionActive: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface SubscriptionStatusPluginOptions {
  appName: string;
  upgradeUrl?: string;
}

/**
 * Subscription Status Plugin for Fastify
 *
 * Provides a preHandler that checks if the user's subscription is active.
 * Returns 403 with SUBSCRIPTION_EXPIRED error if the account is inactive
 * (expired trial, cancelled subscription, etc.).
 *
 * Usage: { preHandler: [fastify.authenticate, fastify.checkSubscriptionActive] }
 */
async function subscriptionStatusPluginFn(
  fastify: FastifyInstance,
  options: SubscriptionStatusPluginOptions
) {
  const logger = new LoggerService(options.appName);
  const subscriptionService = new SubscriptionService(options.appName, logger);
  const upgradeUrl = options.upgradeUrl || '/upgrade';

  fastify.decorate('checkSubscriptionActive', async function (request: FastifyRequest, reply: FastifyReply) {
    // Support both JWT auth (request.user) and API key auth (request.apiKeyContext)
    const userId = request.user?.userId || (request as Record<string, any>).apiKeyContext?.userId;
    if (!userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    try {
      const isActive = await subscriptionService.isAccountActive(userId);

      if (!isActive) {
        await logger.warn({
          action: 'subscription_expired_access',
          message: 'Expired subscription attempted to access protected resource',
          user_id: userId,
          user_email: request.user?.email,
        });

        return reply.status(403).send({
          success: false,
          error: 'SUBSCRIPTION_EXPIRED',
          message: 'Your subscription has expired. Please upgrade to continue.',
          upgradeUrl,
        });
      }
    } catch (error) {
      // Fail open: allow the request if subscription check fails (e.g. DB issue)
      // Backend route-level logic will still enforce any other constraints
      await logger.error({
        action: 'subscription_check_failed',
        message: 'Failed to check subscription status, allowing request',
        user_id: userId,
        error_code: 'SUBSCRIPTION_CHECK_ERROR',
        error_stack: error instanceof Error ? error.stack : String(error),
      });
    }
  });
}

export const subscriptionStatusPlugin = fp(subscriptionStatusPluginFn, {
  name: 'subscription-status-plugin',
  fastify: '5.x',
  dependencies: ['auth-plugin'],
});

export default subscriptionStatusPlugin;
