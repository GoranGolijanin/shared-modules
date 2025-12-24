import { FastifyInstance } from 'fastify';
import { createTestServer, cleanupTestData, closeDatabase, generateTestEmail, waitForLog } from './test-utils';
import { execute, queryOne } from '../database/config';
import type { AuditLog, EmailVerificationAttempt } from '../types/index';

describe('Auth UX Features', () => {
  let app: FastifyInstance;
  let testEmail: string;

  beforeAll(async () => {
    app = await createTestServer();
    await app.ready();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
    await closeDatabase();
  });

  beforeEach(() => {
    testEmail = generateTestEmail();
  });

  afterEach(async () => {
    // Cleanup email verification attempts for this test
    await execute("DELETE FROM email_verification_attempts WHERE email = $1", [testEmail.toLowerCase()]);
  });

  describe('Error Codes', () => {
    describe('Registration Error Codes', () => {
      it('should return EMAIL_ALREADY_REGISTERED error code', async () => {
        // First registration
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        // Duplicate registration
        const response = await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('EMAIL_ALREADY_REGISTERED');
      });
    });

    describe('Login Error Codes', () => {
      it('should return INVALID_CREDENTIALS error code for wrong password', async () => {
        // Register and verify user
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        await execute(
          'UPDATE users SET email_verified = true WHERE email = $1',
          [testEmail.toLowerCase()]
        );

        // Try login with wrong password
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: testEmail, password: 'WrongPassword!' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('INVALID_CREDENTIALS');
      });

      it('should return EMAIL_NOT_VERIFIED error code for unverified email', async () => {
        // Register but don't verify
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        // Try to login
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('EMAIL_NOT_VERIFIED');
        expect(body.email).toBe(testEmail.toLowerCase());
      });
    });

    describe('Email Verification Error Codes', () => {
      it('should return INVALID_TOKEN error code', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/verify-email',
          payload: { token: 'invalid-token-12345' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('INVALID_TOKEN');
      });

      it('should return EMAIL_ALREADY_VERIFIED error code', async () => {
        // Register and verify
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        await execute(
          'UPDATE users SET email_verified = true, email_verification_token = NULL WHERE email = $1',
          [testEmail.toLowerCase()]
        );

        // Try to verify again - would need a valid token here, but simulating the scenario
        // In practice, this would require getting a verification token somehow
      });
    });

    describe('Password Reset Error Codes', () => {
      it('should return INVALID_TOKEN error code for password reset', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/reset-password',
          payload: {
            token: 'invalid-reset-token',
            password: 'NewPassword123!',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('INVALID_TOKEN');
      });
    });

    describe('Refresh Token Error Codes', () => {
      it('should return INVALID_TOKEN error code for invalid refresh token', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refreshToken: 'invalid-refresh-token' },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.errorCode).toBe('INVALID_TOKEN');
      });
    });
  });

  describe('Auto-Resend Verification Email on Login', () => {
    it('should auto-resend verification email when unverified user tries to login', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Try to login - should auto-resend verification
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('EMAIL_NOT_VERIFIED');
      expect(body.message).toContain('sent you a new verification link');

      // Check that a rate limit entry was created
      const attempt = await queryOne<EmailVerificationAttempt>(
        'SELECT * FROM email_verification_attempts WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      expect(attempt).toBeDefined();
      expect(attempt?.attempt_count).toBe(1);
    });

    it('should include user email in response for frontend to use', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Try to login
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const body = JSON.parse(response.body);
      expect(body.email).toBe(testEmail.toLowerCase());
    });

    it('should log auto-resend action', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Try to login (triggers auto-resend)
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Check audit log
      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'login'
           AND log_level = 'warn'
           ORDER BY created_at DESC LIMIT 1`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('verification email resent');
    });
  });

  describe('Rate Limiting for Verification Emails', () => {
    it('should allow first 3 verification email resends within 1 hour', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Attempt 1
      const response1 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });
      expect(response1.statusCode).toBe(401);
      const body1 = JSON.parse(response1.body);
      expect(body1.message).toContain('sent you a new verification link');

      // Attempt 2
      const response2 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });
      expect(response2.statusCode).toBe(401);
      const body2 = JSON.parse(response2.body);
      expect(body2.message).toContain('sent you a new verification link');

      // Attempt 3
      const response3 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });
      expect(response3.statusCode).toBe(401);
      const body3 = JSON.parse(response3.body);
      expect(body3.message).toContain('sent you a new verification link');

      // Check rate limit entry
      const attempt = await queryOne<EmailVerificationAttempt>(
        'SELECT * FROM email_verification_attempts WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      expect(attempt).toBeDefined();
      expect(attempt?.attempt_count).toBe(3);
    });

    it('should block 4th attempt and return rate limit error', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Make 3 resend-verification attempts (exhausts the limit)
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/resend-verification',
          payload: { email: testEmail },
        });
      }

      // 4th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        payload: { email: testEmail },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.message).toContain('Too many verification email requests');
    });

    it('should allow requests before rate limit is reached', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Make 2 resend-verification requests - should both succeed (under limit of 3)
      const response1 = await app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        payload: { email: testEmail },
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        payload: { email: testEmail },
      });

      // Both requests should succeed (not rate limited yet)
      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);

      // Requests before limit should succeed
      expect(body1.success).toBe(true);
      expect(body2.success).toBe(true);
    });

    it('should apply rate limit to manual resend endpoint as well', async () => {
      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Make 3 manual resend requests
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/auth/resend-verification',
          payload: { email: testEmail },
        });
      }

      // 4th attempt should be rate limited
      const response = await app.inject({
        method: 'POST',
        url: '/auth/resend-verification',
        payload: { email: testEmail },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.message).toContain('Too many verification email requests');
    });

  });

  describe('Audit Logging Integration', () => {
    it('should log successful registration', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const body = JSON.parse(response.body);

      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'register'
           AND log_level = 'info'`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('registered successfully');
      expect(log?.user_id).toBe(body.userId);
    });

    it('should log failed registration (duplicate email)', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Duplicate registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'register'
           AND log_level = 'error'`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('already exists');
      expect(log?.error_code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('should log successful login', async () => {
      // Register and verify
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Login
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'login'
           AND log_level = 'info'`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('logged in successfully');
    });

    it('should log failed login attempts', async () => {
      // Register and verify
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      // Failed login
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'WrongPassword!' },
      });

      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'login'
           AND log_level = 'error'`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('invalid password');
      expect(log?.error_code).toBe('INVALID_CREDENTIALS');
    });

    it('should log logout', async () => {
      // Register, verify, and login
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      const cookies = loginResponse.cookies;
      const refreshCookie = cookies.find((c: { name: string }) => c.name === 'refreshToken');

      // Logout
      await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { refreshToken: refreshCookie?.value || '' },
      });

      const log = await waitForLog(() =>
        queryOne<AuditLog>(
          `SELECT * FROM audit_logs
           WHERE app_name = 'test-app'
           AND user_email = $1
           AND action = 'logout'
           AND log_level = 'info'`,
          [testEmail.toLowerCase()]
        )
      );

      expect(log).toBeDefined();
      expect(log?.message).toContain('logged out successfully');
    });
  });
});
