import { query, queryOne, execute } from '../database/config.js';
import { LoggerService } from '../logging/logger.service.js';
import type {
  SubscriptionPlan,
  UserSubscription,
  UserSubscriptionWithPlan,
  UsageLimits,
  UsageTracking,
  TeamMember,
  SubscriptionStatus,
} from '../types/index.js';

export class SubscriptionService {
  private logger: LoggerService;
  private appName: string;

  constructor(appName: string, logger: LoggerService) {
    this.appName = appName;
    this.logger = logger;
  }

  /**
   * Get all available subscription plans
   */
  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return query<SubscriptionPlan>('SELECT * FROM subscription_plans ORDER BY max_domains ASC');
  }

  /**
   * Get a subscription plan by name
   */
  async getPlanByName(name: string): Promise<SubscriptionPlan | null> {
    return queryOne<SubscriptionPlan>(
      'SELECT * FROM subscription_plans WHERE name = $1',
      [name.toLowerCase()]
    );
  }

  /**
   * Get a subscription plan by ID
   */
  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    return queryOne<SubscriptionPlan>(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [planId]
    );
  }

  /**
   * Get user's current subscription with plan details
   */
  async getUserSubscription(userId: string): Promise<UserSubscriptionWithPlan | null> {
    const result = await queryOne<UserSubscription & SubscriptionPlan & { plan_name: string }>(
      `SELECT
        us.*,
        sp.name as plan_name,
        sp.max_domains,
        sp.max_team_members,
        sp.check_interval_hours,
        sp.api_requests_per_month,
        sp.sms_alerts_per_month,
        sp.email_alerts,
        sp.slack_alerts,
        sp.created_at as plan_created_at
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = $1 AND us.status = 'active'`,
      [userId]
    );

    if (!result) return null;

    return {
      id: result.id,
      user_id: result.user_id,
      plan_id: result.plan_id,
      status: result.status,
      started_at: result.started_at,
      expires_at: result.expires_at,
      billing_cycle: result.billing_cycle,
      stripe_subscription_id: result.stripe_subscription_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
      plan: {
        id: result.plan_id,
        name: result.plan_name,
        max_domains: result.max_domains,
        max_team_members: result.max_team_members,
        check_interval_hours: result.check_interval_hours,
        api_requests_per_month: result.api_requests_per_month,
        sms_alerts_per_month: result.sms_alerts_per_month,
        email_alerts: result.email_alerts,
        slack_alerts: result.slack_alerts,
        created_at: result.plan_created_at,
      },
    };
  }

  /**
   * Assign the default (Starter) plan to a new user
   */
  async assignDefaultPlan(userId: string): Promise<UserSubscription | null> {
    const starterPlan = await this.getPlanByName('starter');

    if (!starterPlan) {
      await this.logger.error({
        action: 'assign_default_plan',
        message: 'Starter plan not found in database',
        user_id: userId,
      });
      return null;
    }

    const subscription = await queryOne<UserSubscription>(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, started_at)
       VALUES ($1, $2, 'active', CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = 'active',
         started_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, starterPlan.id]
    );

    await this.logger.info({
      action: 'assign_default_plan',
      message: `Assigned starter plan to user`,
      user_id: userId,
      metadata: { plan_id: starterPlan.id },
    });

    return subscription;
  }

  /**
   * Upgrade or change user's subscription plan
   */
  async changePlan(
    userId: string,
    newPlanId: string,
    billingCycle?: 'monthly' | 'annual',
    stripeSubscriptionId?: string
  ): Promise<UserSubscription | null> {
    const plan = await this.getPlanById(newPlanId);
    if (!plan) {
      await this.logger.error({
        action: 'change_plan',
        message: 'Plan not found',
        user_id: userId,
        metadata: { plan_id: newPlanId },
      });
      return null;
    }

    const subscription = await queryOne<UserSubscription>(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, billing_cycle, stripe_subscription_id, started_at)
       VALUES ($1, $2, 'active', $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = 'active',
         billing_cycle = EXCLUDED.billing_cycle,
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         started_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, newPlanId, billingCycle || null, stripeSubscriptionId || null]
    );

    await this.logger.info({
      action: 'change_plan',
      message: `User changed to ${plan.name} plan`,
      user_id: userId,
      metadata: { plan_id: newPlanId, plan_name: plan.name, billing_cycle: billingCycle },
    });

    return subscription;
  }

  /**
   * Cancel user's subscription
   */
  async cancelSubscription(userId: string): Promise<boolean> {
    const result = await execute(
      `UPDATE user_subscriptions
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );

    if (result > 0) {
      await this.logger.info({
        action: 'cancel_subscription',
        message: 'Subscription cancelled',
        user_id: userId,
      });
    }

    return result > 0;
  }

  /**
   * Get user's plan limits (returns default starter limits if no subscription)
   */
  async getPlanLimits(userId: string): Promise<SubscriptionPlan> {
    const subscription = await this.getUserSubscription(userId);

    if (subscription) {
      return subscription.plan;
    }

    // Return default starter plan limits if no subscription exists
    const starterPlan = await this.getPlanByName('starter');
    if (starterPlan) {
      return starterPlan;
    }

    // Ultimate fallback - hardcoded starter defaults
    return {
      id: 'default',
      name: 'starter',
      max_domains: 10,
      max_team_members: 1,
      check_interval_hours: 12,
      api_requests_per_month: null,
      sms_alerts_per_month: 0,
      email_alerts: true,
      slack_alerts: false,
      created_at: new Date(),
    };
  }

  /**
   * Get comprehensive usage limits for a user
   * This combines plan limits with current usage for easy comparison
   */
  async getUsageLimits(userId: string, domainCount: number, teamMemberCount: number): Promise<UsageLimits> {
    const plan = await this.getPlanLimits(userId);
    const currentMonth = this.getCurrentMonthYear();

    // Get current month's usage
    const usage = await queryOne<UsageTracking>(
      'SELECT * FROM usage_tracking WHERE user_id = $1 AND month_year = $2',
      [userId, currentMonth]
    );

    const apiRequests = usage?.api_requests || 0;
    const smsAlerts = usage?.sms_alerts_sent || 0;

    // Enterprise plan has unlimited everything (represented by very high numbers)
    const isEnterprise = plan.name.toLowerCase() === 'enterprise';

    return {
      plan: plan.name,
      domains: {
        used: domainCount,
        limit: isEnterprise ? 999999 : plan.max_domains,
        unlimited: isEnterprise,
      },
      teamMembers: {
        used: teamMemberCount,
        limit: isEnterprise ? 999999 : plan.max_team_members,
        unlimited: isEnterprise,
      },
      apiRequests: {
        used: apiRequests,
        limit: plan.api_requests_per_month,
        unlimited: plan.api_requests_per_month === null || isEnterprise,
      },
      smsAlerts: {
        used: smsAlerts,
        limit: plan.sms_alerts_per_month,
        unlimited: plan.sms_alerts_per_month === null || isEnterprise,
      },
      features: {
        emailAlerts: plan.email_alerts,
        smsAlerts: (plan.sms_alerts_per_month !== null && plan.sms_alerts_per_month > 0) || isEnterprise,
        slackAlerts: plan.slack_alerts || isEnterprise,
      },
      checkIntervalHours: plan.check_interval_hours,
    };
  }

  /**
   * Check if user can add more domains
   */
  async canAddDomain(userId: string, currentDomainCount: number): Promise<boolean> {
    const plan = await this.getPlanLimits(userId);

    // Enterprise is unlimited
    if (plan.name.toLowerCase() === 'enterprise') {
      return true;
    }

    return currentDomainCount < plan.max_domains;
  }

  /**
   * Check if user can add more team members
   */
  async canAddTeamMember(userId: string, currentTeamCount: number): Promise<boolean> {
    const plan = await this.getPlanLimits(userId);

    if (plan.name.toLowerCase() === 'enterprise') {
      return true;
    }

    return currentTeamCount < plan.max_team_members;
  }

  /**
   * Check if user can send SMS alerts
   */
  async canSendSms(userId: string): Promise<boolean> {
    const plan = await this.getPlanLimits(userId);

    // Enterprise can always send
    if (plan.name.toLowerCase() === 'enterprise') {
      return true;
    }

    // Check if plan allows SMS
    if (plan.sms_alerts_per_month === null || plan.sms_alerts_per_month === 0) {
      return false;
    }

    // Check current month usage
    const currentMonth = this.getCurrentMonthYear();
    const usage = await queryOne<UsageTracking>(
      'SELECT sms_alerts_sent FROM usage_tracking WHERE user_id = $1 AND month_year = $2',
      [userId, currentMonth]
    );

    const sentCount = usage?.sms_alerts_sent || 0;
    return sentCount < plan.sms_alerts_per_month;
  }

  /**
   * Check if user can make API requests
   */
  async canMakeApiRequest(userId: string): Promise<boolean> {
    const plan = await this.getPlanLimits(userId);

    // No limit or enterprise
    if (plan.api_requests_per_month === null || plan.name.toLowerCase() === 'enterprise') {
      return true;
    }

    const currentMonth = this.getCurrentMonthYear();
    const usage = await queryOne<UsageTracking>(
      'SELECT api_requests FROM usage_tracking WHERE user_id = $1 AND month_year = $2',
      [userId, currentMonth]
    );

    const requestCount = usage?.api_requests || 0;
    return requestCount < plan.api_requests_per_month;
  }

  /**
   * Check if user has access to Slack alerts feature
   */
  async canUseSlackAlerts(userId: string): Promise<boolean> {
    const plan = await this.getPlanLimits(userId);
    return plan.slack_alerts || plan.name.toLowerCase() === 'enterprise';
  }

  /**
   * Get the check interval in hours for a user's plan
   */
  async getCheckInterval(userId: string): Promise<number> {
    const plan = await this.getPlanLimits(userId);
    return plan.check_interval_hours;
  }

  private getCurrentMonthYear(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
