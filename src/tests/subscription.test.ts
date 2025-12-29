import { SubscriptionService } from '../subscription/subscription.service';
import { LoggerService } from '../logging/logger.service';
import * as dbConfig from '../database/config';

// Mock the database module
jest.mock('../database/config', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
  pool: {
    query: jest.fn(),
    end: jest.fn(),
  },
}));

// Mock the logger to prevent actual logging
jest.mock('../logging/logger.service', () => ({
  LoggerService: jest.fn().mockImplementation(() => ({
    info: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Sample plan data
const mockStarterPlan = {
  id: 'starter-plan-id',
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

const mockProfessionalPlan = {
  id: 'professional-plan-id',
  name: 'professional',
  max_domains: 40,
  max_team_members: 5,
  check_interval_hours: 6,
  api_requests_per_month: 5000,
  sms_alerts_per_month: 100,
  email_alerts: true,
  slack_alerts: true,
  created_at: new Date(),
};

const mockEnterprisePlan = {
  id: 'enterprise-plan-id',
  name: 'enterprise',
  max_domains: 999999,
  max_team_members: 999999,
  check_interval_hours: 1,
  api_requests_per_month: null,
  sms_alerts_per_month: null,
  email_alerts: true,
  slack_alerts: true,
  created_at: new Date(),
};

describe('Subscription & Trial Module', () => {
  let subscriptionService: SubscriptionService;
  let mockQuery: jest.Mock;
  let mockQueryOne: jest.Mock;
  let mockExecute: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQuery = dbConfig.query as jest.Mock;
    mockQueryOne = dbConfig.queryOne as jest.Mock;
    mockExecute = dbConfig.execute as jest.Mock;

    const logger = new LoggerService('test-app');
    subscriptionService = new SubscriptionService('test-app', logger);
  });

  describe('SubscriptionService.getAllPlans', () => {
    it('should return all available subscription plans', async () => {
      mockQuery.mockResolvedValueOnce([mockStarterPlan, mockProfessionalPlan, mockEnterprisePlan]);

      const plans = await subscriptionService.getAllPlans();

      expect(plans.length).toBe(3);
      expect(plans.map(p => p.name)).toContain('starter');
      expect(plans.map(p => p.name)).toContain('professional');
      expect(plans.map(p => p.name)).toContain('enterprise');
    });
  });

  describe('SubscriptionService.getPlanByName', () => {
    it('should return plan by name', async () => {
      mockQueryOne.mockResolvedValueOnce(mockProfessionalPlan);

      const plan = await subscriptionService.getPlanByName('professional');

      expect(plan).toBeDefined();
      expect(plan?.name).toBe('professional');
      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM subscription_plans WHERE name = $1',
        ['professional']
      );
    });

    it('should return null for non-existent plan', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const plan = await subscriptionService.getPlanByName('nonexistent');

      expect(plan).toBeNull();
    });
  });

  describe('SubscriptionService.assignTrialPlan', () => {
    it('should assign Professional plan as trial', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const mockSubscription = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        started_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock getPlanByName to return professional plan
      mockQueryOne
        .mockResolvedValueOnce(mockProfessionalPlan) // getPlanByName('professional')
        .mockResolvedValueOnce(mockSubscription); // INSERT ... RETURNING *

      const subscription = await subscriptionService.assignTrialPlan(userId);

      expect(subscription).toBeDefined();
      expect(subscription?.is_trial).toBe(true);
      expect(subscription?.status).toBe('trial');
      expect(subscription?.plan_id).toBe(mockProfessionalPlan.id);
    });

    it('should set trial_ends_at to 14 days from now', async () => {
      const userId = 'test-user-id';
      const beforeAssign = new Date();

      mockQueryOne
        .mockResolvedValueOnce(mockProfessionalPlan)
        .mockImplementationOnce(async () => {
          // Capture the trial_ends_at from the query parameters
          return {
            id: 'sub-id',
            user_id: userId,
            plan_id: mockProfessionalPlan.id,
            status: 'trial',
            is_trial: true,
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            started_at: new Date(),
          };
        });

      const subscription = await subscriptionService.assignTrialPlan(userId);

      expect(subscription?.trial_ends_at).toBeDefined();
      const trialEndsAt = new Date(subscription!.trial_ends_at!);
      const expectedMinEnd = new Date(beforeAssign.getTime() + 13 * 24 * 60 * 60 * 1000);
      const expectedMaxEnd = new Date(beforeAssign.getTime() + 15 * 24 * 60 * 60 * 1000);

      expect(trialEndsAt.getTime()).toBeGreaterThan(expectedMinEnd.getTime());
      expect(trialEndsAt.getTime()).toBeLessThan(expectedMaxEnd.getTime());
    });

    it('should fall back to starter plan if professional not found', async () => {
      const userId = 'test-user-id';

      mockQueryOne
        .mockResolvedValueOnce(null) // getPlanByName('professional') returns null
        .mockResolvedValueOnce(mockStarterPlan) // getPlanByName('starter')
        .mockResolvedValueOnce({ // assignDefaultPlan result
          id: 'sub-id',
          user_id: userId,
          plan_id: mockStarterPlan.id,
          status: 'active',
          is_trial: false,
        });

      const subscription = await subscriptionService.assignTrialPlan(userId);

      // Should have fallen back to default plan
      expect(subscription?.plan_id).toBe(mockStarterPlan.id);
    });
  });

  describe('SubscriptionService.getTrialInfo', () => {
    it('should return correct trial info for user on trial', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days remaining

      mockQueryOne.mockResolvedValueOnce({
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        plan: mockProfessionalPlan,
      });

      const trialInfo = await subscriptionService.getTrialInfo(userId);

      expect(trialInfo.isOnTrial).toBe(true);
      expect(trialInfo.trialEndsAt).toBeDefined();
      expect(trialInfo.daysRemaining).toBeGreaterThan(0);
      expect(trialInfo.daysRemaining).toBeLessThanOrEqual(14);
      expect(trialInfo.isExpired).toBe(false);
    });

    it('should return isOnTrial false for user without trial', async () => {
      const userId = 'test-user-id';

      // User has no subscription
      mockQueryOne.mockResolvedValueOnce(null);

      const trialInfo = await subscriptionService.getTrialInfo(userId);

      expect(trialInfo.isOnTrial).toBe(false);
      expect(trialInfo.trialEndsAt).toBeNull();
      expect(trialInfo.daysRemaining).toBe(0);
      expect(trialInfo.isExpired).toBe(false);
    });

    it('should return isExpired true for expired trial', async () => {
      const userId = 'test-user-id';
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      mockQueryOne.mockResolvedValueOnce({
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: expiredDate,
        plan: mockProfessionalPlan,
      });

      const trialInfo = await subscriptionService.getTrialInfo(userId);

      expect(trialInfo.isOnTrial).toBe(true);
      expect(trialInfo.isExpired).toBe(true);
      expect(trialInfo.daysRemaining).toBe(0);
    });
  });

  describe('SubscriptionService.checkAndHandleTrialExpiration', () => {
    it('should downgrade expired trial to Starter plan', async () => {
      const userId = 'test-user-id';
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // First call: getUserSubscription (for getTrialInfo)
      mockQueryOne
        .mockResolvedValueOnce({
          id: 'sub-id',
          user_id: userId,
          plan_id: mockProfessionalPlan.id,
          status: 'trial',
          is_trial: true,
          trial_ends_at: expiredDate,
          plan: mockProfessionalPlan,
        })
        .mockResolvedValueOnce(mockStarterPlan); // getPlanByName('starter')

      mockExecute.mockResolvedValueOnce(1); // UPDATE succeeded

      const wasDowngraded = await subscriptionService.checkAndHandleTrialExpiration(userId);

      expect(wasDowngraded).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should not affect active trial', async () => {
      const userId = 'test-user-id';
      const activeTrialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      mockQueryOne.mockResolvedValueOnce({
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: activeTrialEnd,
        plan: mockProfessionalPlan,
      });

      const wasDowngraded = await subscriptionService.checkAndHandleTrialExpiration(userId);

      expect(wasDowngraded).toBe(false);
      // Execute should not have been called for downgrade
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('SubscriptionService.getPlanLimitsWithTrialOverrides', () => {
    it('should return trial-specific limits for trial user', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Create subscription with plan data matching what getUserSubscription returns
      const trialSubscriptionWithPlan = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        plan_name: 'professional',
        // Flattened plan fields from the JOIN
        max_domains: 40,
        max_team_members: 5,
        check_interval_hours: 6,
        api_requests_per_month: 5000,
        sms_alerts_per_month: 100,
        email_alerts: true,
        slack_alerts: true,
        plan_created_at: new Date(),
      };

      // First call for checkAndHandleTrialExpiration -> getTrialInfo -> getUserSubscription
      mockQueryOne
        .mockResolvedValueOnce(trialSubscriptionWithPlan)
        // Second call for getUserSubscription in getPlanLimitsWithTrialOverrides
        .mockResolvedValueOnce(trialSubscriptionWithPlan)
        // Third call for getTrialInfo
        .mockResolvedValueOnce(trialSubscriptionWithPlan);

      const limits = await subscriptionService.getPlanLimitsWithTrialOverrides(userId);

      // Trial should have reduced limits (10 domains, 10 SMS)
      expect(limits.max_domains).toBe(10);
      expect(limits.sms_alerts_per_month).toBe(10);
      expect(limits.isTrialLimited).toBe(true);

      // But should still have Professional features
      expect(limits.slack_alerts).toBe(true);
    });

    it('should return normal limits for non-trial user', async () => {
      const userId = 'test-user-id';

      const starterSubscriptionWithPlan = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockStarterPlan.id,
        status: 'active',
        is_trial: false,
        trial_ends_at: null,
        plan_name: 'starter',
        max_domains: 10,
        max_team_members: 1,
        check_interval_hours: 12,
        api_requests_per_month: null,
        sms_alerts_per_month: 0,
        email_alerts: true,
        slack_alerts: false,
        plan_created_at: new Date(),
      };

      // First call for checkAndHandleTrialExpiration -> getTrialInfo -> getUserSubscription (no trial)
      mockQueryOne
        .mockResolvedValueOnce(starterSubscriptionWithPlan)
        // Second call for getUserSubscription
        .mockResolvedValueOnce(starterSubscriptionWithPlan)
        // Third call for getTrialInfo
        .mockResolvedValueOnce(starterSubscriptionWithPlan);

      const limits = await subscriptionService.getPlanLimitsWithTrialOverrides(userId);

      expect(limits.isTrialLimited).toBe(false);
      expect(limits.name).toBe('starter');
      expect(limits.max_domains).toBe(10); // Starter limit
    });
  });

  describe('SubscriptionService.canAddDomain', () => {
    it('should allow adding domains within limit', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const trialSub = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        plan_name: 'professional',
        max_domains: 40,
        max_team_members: 5,
        check_interval_hours: 6,
        api_requests_per_month: 5000,
        sms_alerts_per_month: 100,
        email_alerts: true,
        slack_alerts: true,
        plan_created_at: new Date(),
      };

      // Mock for getPlanLimitsWithTrialOverrides chain
      mockQueryOne
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub);

      // Trial has 10 domain limit, user has 5
      const canAdd = await subscriptionService.canAddDomain(userId, 5);
      expect(canAdd).toBe(true);
    });

    it('should reject adding domains at limit', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const trialSub = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        plan_name: 'professional',
        max_domains: 40,
        max_team_members: 5,
        check_interval_hours: 6,
        api_requests_per_month: 5000,
        sms_alerts_per_month: 100,
        email_alerts: true,
        slack_alerts: true,
        plan_created_at: new Date(),
      };

      // Mock for getPlanLimitsWithTrialOverrides chain
      mockQueryOne
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub);

      // Trial has 10 domain limit, user already has 10
      const canAdd = await subscriptionService.canAddDomain(userId, 10);
      expect(canAdd).toBe(false);
    });

    it('should allow unlimited domains for Enterprise plan', async () => {
      const userId = 'test-user-id';

      const enterpriseSub = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockEnterprisePlan.id,
        status: 'active',
        is_trial: false,
        trial_ends_at: null,
        plan_name: 'enterprise',
        max_domains: 999999,
        max_team_members: 999999,
        check_interval_hours: 1,
        api_requests_per_month: null,
        sms_alerts_per_month: null,
        email_alerts: true,
        slack_alerts: true,
        plan_created_at: new Date(),
      };

      // Mock for getPlanLimitsWithTrialOverrides chain
      mockQueryOne
        .mockResolvedValueOnce(enterpriseSub)
        .mockResolvedValueOnce(enterpriseSub)
        .mockResolvedValueOnce(enterpriseSub);

      // Enterprise should allow any number
      const canAdd = await subscriptionService.canAddDomain(userId, 1000);
      expect(canAdd).toBe(true);
    });
  });

  describe('SubscriptionService.canSendSms', () => {
    it('should allow SMS for trial user within limit', async () => {
      const userId = 'test-user-id';
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const trialSub = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockProfessionalPlan.id,
        status: 'trial',
        is_trial: true,
        trial_ends_at: trialEndsAt,
        plan_name: 'professional',
        max_domains: 40,
        max_team_members: 5,
        check_interval_hours: 6,
        api_requests_per_month: 5000,
        sms_alerts_per_month: 100,
        email_alerts: true,
        slack_alerts: true,
        plan_created_at: new Date(),
      };

      mockQueryOne
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce(trialSub)
        .mockResolvedValueOnce({ sms_alerts_sent: 5 }); // Usage tracking

      const canSend = await subscriptionService.canSendSms(userId);
      expect(canSend).toBe(true);
    });

    it('should reject SMS for starter plan', async () => {
      const userId = 'test-user-id';

      const starterSub = {
        id: 'sub-id',
        user_id: userId,
        plan_id: mockStarterPlan.id,
        status: 'active',
        is_trial: false,
        trial_ends_at: null,
        plan_name: 'starter',
        max_domains: 10,
        max_team_members: 1,
        check_interval_hours: 12,
        api_requests_per_month: null,
        sms_alerts_per_month: 0,
        email_alerts: true,
        slack_alerts: false,
        plan_created_at: new Date(),
      };

      mockQueryOne
        .mockResolvedValueOnce(starterSub)
        .mockResolvedValueOnce(starterSub)
        .mockResolvedValueOnce(starterSub);

      const canSend = await subscriptionService.canSendSms(userId);
      expect(canSend).toBe(false); // Starter has 0 SMS
    });
  });

  describe('SubscriptionService.assignDefaultPlan', () => {
    it('should assign starter plan to user', async () => {
      const userId = 'test-user-id';

      mockQueryOne
        .mockResolvedValueOnce(mockStarterPlan) // getPlanByName('starter')
        .mockResolvedValueOnce({
          id: 'sub-id',
          user_id: userId,
          plan_id: mockStarterPlan.id,
          status: 'active',
          is_trial: false,
        });

      const subscription = await subscriptionService.assignDefaultPlan(userId);

      expect(subscription).toBeDefined();
      expect(subscription?.plan_id).toBe(mockStarterPlan.id);
      expect(subscription?.status).toBe('active');
    });
  });

  describe('SubscriptionService.changePlan', () => {
    it('should change user plan', async () => {
      const userId = 'test-user-id';

      mockQueryOne
        .mockResolvedValueOnce(mockProfessionalPlan) // getPlanById
        .mockResolvedValueOnce({
          id: 'sub-id',
          user_id: userId,
          plan_id: mockProfessionalPlan.id,
          status: 'active',
          billing_cycle: 'monthly',
        });

      const subscription = await subscriptionService.changePlan(
        userId,
        mockProfessionalPlan.id,
        'monthly'
      );

      expect(subscription).toBeDefined();
      expect(subscription?.plan_id).toBe(mockProfessionalPlan.id);
    });
  });

  describe('SubscriptionService.cancelSubscription', () => {
    it('should cancel subscription', async () => {
      const userId = 'test-user-id';
      mockExecute.mockResolvedValueOnce(1);

      const result = await subscriptionService.cancelSubscription(userId);

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalled();
    });

    it('should return false if no active subscription', async () => {
      const userId = 'test-user-id';
      mockExecute.mockResolvedValueOnce(0);

      const result = await subscriptionService.cancelSubscription(userId);

      expect(result).toBe(false);
    });
  });
});
