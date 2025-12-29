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
  TrialInfo,
} from '../types/index.js';

// Trial configuration
const TRIAL_DURATION_DAYS = 14;
const TRIAL_MAX_DOMAINS = 10;
const TRIAL_MAX_SMS = 10;

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
    const result = await queryOne<UserSubscription & SubscriptionPlan & { plan_name: string; plan_created_at: Date }>(
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
      WHERE us.user_id = $1 AND us.status IN ('active', 'trial')`,
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
      is_trial: result.is_trial || false,
      trial_ends_at: result.trial_ends_at,
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
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);

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
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);

    if (plan.name.toLowerCase() === 'enterprise') {
      return true;
    }

    return currentTeamCount < plan.max_team_members;
  }

  /**
   * Check if user can send SMS alerts
   */
  async canSendSms(userId: string): Promise<boolean> {
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);

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
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);

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
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);
    return plan.slack_alerts || plan.name.toLowerCase() === 'enterprise';
  }

  /**
   * Get the check interval in hours for a user's plan
   */
  async getCheckInterval(userId: string): Promise<number> {
    const plan = await this.getPlanLimitsWithTrialOverrides(userId);
    return plan.check_interval_hours;
  }

  // ============================================
  // Trial Management Methods
  // ============================================

  /**
   * Assign a 14-day trial with Professional features to a new user
   */
  async assignTrialPlan(userId: string): Promise<UserSubscription | null> {
    const professionalPlan = await this.getPlanByName('professional');

    if (!professionalPlan) {
      await this.logger.error({
        action: 'assign_trial_plan',
        message: 'Professional plan not found in database',
        user_id: userId,
      });
      // Fallback to starter if professional not found
      return this.assignDefaultPlan(userId);
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    const subscription = await queryOne<UserSubscription>(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, started_at, is_trial, trial_ends_at)
       VALUES ($1, $2, 'trial', CURRENT_TIMESTAMP, true, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = 'trial',
         started_at = CURRENT_TIMESTAMP,
         is_trial = true,
         trial_ends_at = EXCLUDED.trial_ends_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, professionalPlan.id, trialEndsAt]
    );

    await this.logger.info({
      action: 'assign_trial_plan',
      message: `Assigned 14-day trial to user`,
      user_id: userId,
      metadata: { plan_id: professionalPlan.id, trial_ends_at: trialEndsAt },
    });

    return subscription;
  }

  /**
   * Get trial information for a user
   */
  async getTrialInfo(userId: string): Promise<TrialInfo> {
    const subscription = await this.getUserSubscription(userId);

    if (!subscription || !subscription.is_trial || !subscription.trial_ends_at) {
      return {
        isOnTrial: false,
        trialEndsAt: null,
        daysRemaining: 0,
        isExpired: false,
      };
    }

    const now = new Date();
    const trialEndsAt = new Date(subscription.trial_ends_at);
    const isExpired = now > trialEndsAt;
    const daysRemaining = isExpired
      ? 0
      : Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      isOnTrial: true,
      trialEndsAt,
      daysRemaining,
      isExpired,
    };
  }

  /**
   * Check if a trial is expired and handle downgrade to Starter
   * Returns true if the trial was expired and downgraded
   */
  async checkAndHandleTrialExpiration(userId: string): Promise<boolean> {
    const trialInfo = await this.getTrialInfo(userId);

    if (!trialInfo.isOnTrial || !trialInfo.isExpired) {
      return false;
    }

    // Downgrade to starter plan
    const starterPlan = await this.getPlanByName('starter');
    if (!starterPlan) {
      await this.logger.error({
        action: 'trial_expiration',
        message: 'Cannot downgrade - Starter plan not found',
        user_id: userId,
      });
      return false;
    }

    await execute(
      `UPDATE user_subscriptions
       SET plan_id = $1, status = 'active', is_trial = false, trial_ends_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [starterPlan.id, userId]
    );

    await this.logger.info({
      action: 'trial_expired',
      message: 'Trial expired - downgraded to Starter plan',
      user_id: userId,
      metadata: { new_plan_id: starterPlan.id },
    });

    return true;
  }

  /**
   * Get plan limits with trial-specific overrides
   * Trial users get Professional features but with reduced limits (10 domains, 10 SMS)
   */
  async getPlanLimitsWithTrialOverrides(userId: string): Promise<SubscriptionPlan & { isTrialLimited: boolean }> {
    // First check and handle any expired trials
    await this.checkAndHandleTrialExpiration(userId);

    const subscription = await this.getUserSubscription(userId);
    const trialInfo = await this.getTrialInfo(userId);

    let plan = subscription?.plan || await this.getPlanByName('starter') || {
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

    // Apply trial-specific limits
    if (trialInfo.isOnTrial && !trialInfo.isExpired) {
      return {
        ...plan,
        max_domains: TRIAL_MAX_DOMAINS,
        sms_alerts_per_month: TRIAL_MAX_SMS,
        isTrialLimited: true,
      };
    }

    return {
      ...plan,
      isTrialLimited: false,
    };
  }

  private getCurrentMonthYear(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
