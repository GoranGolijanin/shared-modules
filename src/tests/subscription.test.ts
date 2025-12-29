import { FastifyInstance } from 'fastify';
import { createTestServer, cleanupTestData, closeDatabase, generateTestEmail } from './test-utils';
import { queryOne, execute } from '../database/config';
import { SubscriptionService } from '../subscription/subscription.service';
import { LoggerService } from '../logging/logger.service';
import crypto from 'crypto';

// Mock the Brevo email module to prevent sending real emails during tests
jest.mock('../email/brevo', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

describe('Subscription & Trial Module', () => {
  let app: FastifyInstance;
  let subscriptionService: SubscriptionService;
  let testEmail: string;

  beforeAll(async () => {
    app = await createTestServer();
    await app.ready();

    const logger = new LoggerService('test-app');
    subscriptionService = new SubscriptionService('test-app', logger);
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await closeDatabase();
  });

  beforeEach(() => {
    testEmail = generateTestEmail();
  });

  describe('Trial Assignment on Email Verification', () => {
    it('should assign 14-day trial when email is verified', async () => {
      // Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      expect(registerResponse.statusCode).toBe(201);
      const registerBody = JSON.parse(registerResponse.body);
      const userId = registerBody.userId;

      // Get the verification token and verify email
      const testVerificationToken = 'test-verification-token-' + Date.now();
      const hashedToken = crypto.createHash('sha256').update(testVerificationToken).digest('hex');
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await execute(
        'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE email = $3',
        [hashedToken, verificationExpires, testEmail.toLowerCase()]
      );

      // Verify email
      const verifyResponse = await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: {
          token: testVerificationToken,
        },
      });

      expect(verifyResponse.statusCode).toBe(200);
      const verifyBody = JSON.parse(verifyResponse.body);
      expect(verifyBody.success).toBe(true);

      // Check that trial was assigned
      const subscription = await queryOne<{
        status: string;
        is_trial: boolean;
        trial_ends_at: Date;
        plan_id: string;
      }>(
        'SELECT status, is_trial, trial_ends_at, plan_id FROM user_subscriptions WHERE user_id = $1',
        [userId]
      );

      expect(subscription).toBeDefined();
      expect(subscription?.status).toBe('trial');
      expect(subscription?.is_trial).toBe(true);
      expect(subscription?.trial_ends_at).toBeDefined();

      // Verify trial_ends_at is approximately 14 days from now
      const trialEndsAt = new Date(subscription!.trial_ends_at);
      const expectedEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const diffDays = Math.abs(trialEndsAt.getTime() - expectedEnd.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeLessThan(1); // Within 1 day tolerance

      // Verify it's the Professional plan
      const plan = await queryOne<{ name: string }>(
        'SELECT name FROM subscription_plans WHERE id = $1',
        [subscription!.plan_id]
      );
      expect(plan?.name).toBe('professional');
    });
  });

  describe('SubscriptionService.getTrialInfo', () => {
    it('should return correct trial info for user on trial', async () => {
      // Create user and assign trial
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Assign trial plan
      await subscriptionService.assignTrialPlan(user!.id);

      // Get trial info
      const trialInfo = await subscriptionService.getTrialInfo(user!.id);

      expect(trialInfo.isOnTrial).toBe(true);
      expect(trialInfo.trialEndsAt).toBeDefined();
      expect(trialInfo.daysRemaining).toBeGreaterThan(0);
      expect(trialInfo.daysRemaining).toBeLessThanOrEqual(14);
      expect(trialInfo.isExpired).toBe(false);
    });

    it('should return isOnTrial false for user without trial', async () => {
      // Create user without trial
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Don't assign any subscription

      // Get trial info
      const trialInfo = await subscriptionService.getTrialInfo(user!.id);

      expect(trialInfo.isOnTrial).toBe(false);
      expect(trialInfo.trialEndsAt).toBeNull();
      expect(trialInfo.daysRemaining).toBe(0);
      expect(trialInfo.isExpired).toBe(false);
    });

    it('should return isExpired true for expired trial', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Get professional plan
      const professionalPlan = await queryOne<{ id: string }>(
        "SELECT id FROM subscription_plans WHERE name = 'professional'"
      );

      // Manually create an expired trial
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      await execute(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, is_trial, trial_ends_at)
         VALUES ($1, $2, 'trial', true, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           is_trial = EXCLUDED.is_trial,
           trial_ends_at = EXCLUDED.trial_ends_at`,
        [user!.id, professionalPlan!.id, expiredDate]
      );

      // Get trial info
      const trialInfo = await subscriptionService.getTrialInfo(user!.id);

      expect(trialInfo.isOnTrial).toBe(true);
      expect(trialInfo.isExpired).toBe(true);
      expect(trialInfo.daysRemaining).toBe(0);
    });
  });

  describe('SubscriptionService.checkAndHandleTrialExpiration', () => {
    it('should downgrade expired trial to Starter plan', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Get professional plan
      const professionalPlan = await queryOne<{ id: string }>(
        "SELECT id FROM subscription_plans WHERE name = 'professional'"
      );

      // Create an expired trial
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await execute(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, is_trial, trial_ends_at)
         VALUES ($1, $2, 'trial', true, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           plan_id = EXCLUDED.plan_id,
           status = EXCLUDED.status,
           is_trial = EXCLUDED.is_trial,
           trial_ends_at = EXCLUDED.trial_ends_at`,
        [user!.id, professionalPlan!.id, expiredDate]
      );

      // Check and handle expiration
      const wasDowngraded = await subscriptionService.checkAndHandleTrialExpiration(user!.id);

      expect(wasDowngraded).toBe(true);

      // Verify downgraded to Starter
      const subscription = await queryOne<{
        status: string;
        is_trial: boolean;
        plan_id: string;
      }>(
        'SELECT status, is_trial, plan_id FROM user_subscriptions WHERE user_id = $1',
        [user!.id]
      );

      expect(subscription?.status).toBe('active');
      expect(subscription?.is_trial).toBe(false);

      // Verify it's the Starter plan
      const plan = await queryOne<{ name: string }>(
        'SELECT name FROM subscription_plans WHERE id = $1',
        [subscription!.plan_id]
      );
      expect(plan?.name).toBe('starter');
    });

    it('should not affect active trial', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Assign active trial
      await subscriptionService.assignTrialPlan(user!.id);

      // Check and handle expiration (should return false since trial is active)
      const wasDowngraded = await subscriptionService.checkAndHandleTrialExpiration(user!.id);

      expect(wasDowngraded).toBe(false);

      // Verify still on trial
      const subscription = await queryOne<{ status: string; is_trial: boolean }>(
        'SELECT status, is_trial FROM user_subscriptions WHERE user_id = $1',
        [user!.id]
      );

      expect(subscription?.status).toBe('trial');
      expect(subscription?.is_trial).toBe(true);
    });
  });

  describe('SubscriptionService.getPlanLimitsWithTrialOverrides', () => {
    it('should return trial-specific limits for trial user', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Assign trial
      await subscriptionService.assignTrialPlan(user!.id);

      // Get plan limits with trial overrides
      const limits = await subscriptionService.getPlanLimitsWithTrialOverrides(user!.id);

      // Trial should have reduced limits (10 domains, 10 SMS)
      expect(limits.max_domains).toBe(10);
      expect(limits.sms_alerts_per_month).toBe(10);
      expect(limits.isTrialLimited).toBe(true);

      // But should still have Professional features
      expect(limits.slack_alerts).toBe(true);
    });

    it('should return normal limits for non-trial user', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Assign regular starter plan (not trial)
      await subscriptionService.assignDefaultPlan(user!.id);

      // Get plan limits
      const limits = await subscriptionService.getPlanLimitsWithTrialOverrides(user!.id);

      expect(limits.isTrialLimited).toBe(false);
      // Should have starter plan limits
      expect(limits.name).toBe('starter');
    });
  });

  describe('SubscriptionService.assignTrialPlan', () => {
    it('should assign Professional plan as trial', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Assign trial
      const subscription = await subscriptionService.assignTrialPlan(user!.id);

      expect(subscription).toBeDefined();
      expect(subscription?.is_trial).toBe(true);
      expect(subscription?.status).toBe('trial');

      // Verify plan is Professional
      const plan = await queryOne<{ name: string }>(
        'SELECT name FROM subscription_plans WHERE id = $1',
        [subscription!.plan_id]
      );
      expect(plan?.name).toBe('professional');
    });

    it('should set trial_ends_at to 14 days from now', async () => {
      // Create user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      const beforeAssign = new Date();

      // Assign trial
      const subscription = await subscriptionService.assignTrialPlan(user!.id);

      expect(subscription?.trial_ends_at).toBeDefined();

      const trialEndsAt = new Date(subscription!.trial_ends_at!);
      const expectedMinEnd = new Date(beforeAssign.getTime() + 13 * 24 * 60 * 60 * 1000);
      const expectedMaxEnd = new Date(beforeAssign.getTime() + 15 * 24 * 60 * 60 * 1000);

      expect(trialEndsAt.getTime()).toBeGreaterThan(expectedMinEnd.getTime());
      expect(trialEndsAt.getTime()).toBeLessThan(expectedMaxEnd.getTime());
    });
  });

  describe('SubscriptionService.getAllPlans', () => {
    it('should return all available subscription plans', async () => {
      const plans = await subscriptionService.getAllPlans();

      expect(plans.length).toBeGreaterThan(0);

      // Check that we have the expected plans
      const planNames = plans.map(p => p.name);
      expect(planNames).toContain('starter');
      expect(planNames).toContain('professional');
    });
  });

  describe('SubscriptionService.canAddDomain', () => {
    it('should allow adding domains within limit', async () => {
      // Create user with trial
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      await subscriptionService.assignTrialPlan(user!.id);

      // Trial has 10 domain limit
      const canAdd = await subscriptionService.canAddDomain(user!.id, 5);
      expect(canAdd).toBe(true);
    });

    it('should reject adding domains at limit', async () => {
      // Create user with trial
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const user = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      await subscriptionService.assignTrialPlan(user!.id);

      // Trial has 10 domain limit, but limits are from plan (40 for professional)
      // The trial-specific limits are handled by getPlanLimitsWithTrialOverrides
      const canAdd = await subscriptionService.canAddDomain(user!.id, 40);
      expect(canAdd).toBe(false);
    });
  });
});
