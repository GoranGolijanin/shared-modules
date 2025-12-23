import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SubscriptionService } from '../subscription/subscription.service.js';
import { UsageService } from '../usage/usage.service.js';
import { LoggerService } from '../logging/logger.service.js';
import { PlanLimitErrorCode } from '../types/index.js';

// Extend FastifyRequest to include user from JWT
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
    };
  }

  interface FastifyInstance {
    checkDomainLimit: (currentCount: number) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkTeamLimit: (currentCount: number) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkSmsLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkApiLimit: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    checkSlackAccess: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    trackApiRequest: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface PlanLimitsPluginOptions {
  appName: string;
  upgradeUrl?: string;
}

/**
 * Creates a standardized plan limit error response
 */
function createLimitError(
  code: PlanLimitErrorCode,
  message: string,
  current?: number,
  limit?: number,
  upgradeUrl: string = '/pricing'
) {
  return {
    success: false,
    error: code,
    message,
    current,
    limit,
    upgradeUrl,
  };
}

/**
 * Plan Limits Plugin for Fastify
 *
 * Provides middleware functions for checking various plan limits:
 * - checkDomainLimit: Verify user can add more domains
 * - checkTeamLimit: Verify user can add more team members
 * - checkSmsLimit: Verify user has SMS quota remaining
 * - checkApiLimit: Verify user has API request quota remaining
 * - checkSlackAccess: Verify user has access to Slack alerts feature
 * - trackApiRequest: Increment API request counter
 */
export async function planLimitsPlugin(
  fastify: FastifyInstance,
  options: PlanLimitsPluginOptions
) {
  const logger = new LoggerService(options.appName);
  const subscriptionService = new SubscriptionService(options.appName, logger);
  const usageService = new UsageService(options.appName, logger);
  const upgradeUrl = options.upgradeUrl || '/pricing';

  /**
   * Check if user can add more domains
   * Usage: { preHandler: [fastify.authenticate, fastify.checkDomainLimit(currentDomainCount)] }
   */
  fastify.decorate('checkDomainLimit', function (currentCount: number) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user?.userId) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' });
      }

      const canAdd = await subscriptionService.canAddDomain(request.user.userId, currentCount);

      if (!canAdd) {
        const plan = await subscriptionService.getPlanLimits(request.user.userId);

        await logger.warn({
          action: 'domain_limit_check',
          message: `Domain limit reached (${currentCount}/${plan.max_domains})`,
          user_id: request.user.userId,
          user_email: request.user.email,
        });

        return reply.status(403).send(
          createLimitError(
            PlanLimitErrorCode.DOMAIN_LIMIT_REACHED,
            `You have reached the maximum of ${plan.max_domains} domains for your ${plan.name} plan.`,
            currentCount,
            plan.max_domains,
            upgradeUrl
          )
        );
      }
    };
  });

  /**
   * Check if user can add more team members
   * Usage: { preHandler: [fastify.authenticate, fastify.checkTeamLimit(currentTeamCount)] }
   */
  fastify.decorate('checkTeamLimit', function (currentCount: number) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user?.userId) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' });
      }

      const canAdd = await subscriptionService.canAddTeamMember(request.user.userId, currentCount);

      if (!canAdd) {
        const plan = await subscriptionService.getPlanLimits(request.user.userId);

        await logger.warn({
          action: 'team_limit_check',
          message: `Team member limit reached (${currentCount}/${plan.max_team_members})`,
          user_id: request.user.userId,
          user_email: request.user.email,
        });

        return reply.status(403).send(
          createLimitError(
            PlanLimitErrorCode.TEAM_LIMIT_REACHED,
            `You have reached the maximum of ${plan.max_team_members} team members for your ${plan.name} plan.`,
            currentCount,
            plan.max_team_members,
            upgradeUrl
          )
        );
      }
    };
  });

  /**
   * Check if user can send SMS alerts
   * Usage: { preHandler: [fastify.authenticate, fastify.checkSmsLimit] }
   */
  fastify.decorate('checkSmsLimit', async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const canSend = await subscriptionService.canSendSms(request.user.userId);

    if (!canSend) {
      const plan = await subscriptionService.getPlanLimits(request.user.userId);
      const currentCount = await usageService.getSmsAlertCount(request.user.userId);

      // Check if SMS is not available for this plan at all
      if (plan.sms_alerts_per_month === 0 || plan.sms_alerts_per_month === null) {
        await logger.warn({
          action: 'sms_feature_check',
          message: 'SMS alerts not available for plan',
          user_id: request.user.userId,
          user_email: request.user.email,
        });

        return reply.status(403).send(
          createLimitError(
            PlanLimitErrorCode.FEATURE_NOT_AVAILABLE,
            `SMS alerts are not available on your ${plan.name} plan. Upgrade to Professional or Enterprise to access SMS alerts.`,
            0,
            0,
            upgradeUrl
          )
        );
      }

      await logger.warn({
        action: 'sms_limit_check',
        message: `SMS limit reached (${currentCount}/${plan.sms_alerts_per_month})`,
        user_id: request.user.userId,
        user_email: request.user.email,
      });

      return reply.status(403).send(
        createLimitError(
          PlanLimitErrorCode.SMS_LIMIT_REACHED,
          `You have used all ${plan.sms_alerts_per_month} SMS alerts for this month on your ${plan.name} plan.`,
          currentCount,
          plan.sms_alerts_per_month,
          upgradeUrl
        )
      );
    }
  });

  /**
   * Check if user can make API requests
   * Usage: { preHandler: [fastify.authenticate, fastify.checkApiLimit] }
   */
  fastify.decorate('checkApiLimit', async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const canRequest = await subscriptionService.canMakeApiRequest(request.user.userId);

    if (!canRequest) {
      const plan = await subscriptionService.getPlanLimits(request.user.userId);
      const currentCount = await usageService.getApiRequestCount(request.user.userId);

      await logger.warn({
        action: 'api_limit_check',
        message: `API limit reached (${currentCount}/${plan.api_requests_per_month})`,
        user_id: request.user.userId,
        user_email: request.user.email,
      });

      return reply.status(429).send(
        createLimitError(
          PlanLimitErrorCode.API_LIMIT_REACHED,
          `You have used all ${plan.api_requests_per_month} API requests for this month on your ${plan.name} plan.`,
          currentCount,
          plan.api_requests_per_month || undefined,
          upgradeUrl
        )
      );
    }
  });

  /**
   * Check if user has access to Slack alerts feature
   * Usage: { preHandler: [fastify.authenticate, fastify.checkSlackAccess] }
   */
  fastify.decorate('checkSlackAccess', async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }

    const canUse = await subscriptionService.canUseSlackAlerts(request.user.userId);

    if (!canUse) {
      const plan = await subscriptionService.getPlanLimits(request.user.userId);

      await logger.warn({
        action: 'slack_feature_check',
        message: 'Slack alerts not available for plan',
        user_id: request.user.userId,
        user_email: request.user.email,
      });

      return reply.status(403).send(
        createLimitError(
          PlanLimitErrorCode.FEATURE_NOT_AVAILABLE,
          `Slack alerts are not available on your ${plan.name} plan. Upgrade to Professional or Enterprise to access Slack integration.`,
          undefined,
          undefined,
          upgradeUrl
        )
      );
    }
  });

  /**
   * Track API request (increment counter)
   * Use as an onResponse hook to count successful requests
   * Usage: { onResponse: fastify.trackApiRequest }
   */
  fastify.decorate('trackApiRequest', async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user?.userId) {
      return; // Don't track unauthenticated requests
    }

    // Only track successful responses (2xx status codes)
    const statusCode = reply.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      await usageService.incrementApiRequests(request.user.userId);
    }
  });
}

export default planLimitsPlugin;
