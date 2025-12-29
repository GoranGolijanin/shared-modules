import Fastify, { FastifyInstance } from 'fastify';
import { authPlugin } from '../auth/index';
import crypto from 'crypto';

// In-memory database for testing
const mockUsers: Map<string, any> = new Map();
const mockRefreshTokens: Map<string, any> = new Map();
const mockEmailVerificationAttempts: Map<string, any> = new Map();
const mockAuditLogs: any[] = [];

function generateId() {
  return crypto.randomUUID();
}

// Mock the database module
jest.mock('../database/config', () => ({
  query: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    // Handle SELECT queries
    if (sql.includes('SELECT') && sql.includes('FROM users')) {
      const users = Array.from(mockUsers.values());
      if (params && params[0]) {
        const email = String(params[0]).toLowerCase();
        const user = users.find(u => u.email === email);
        return user ? [user] : [];
      }
      return users;
    }
    return [];
  }),
  queryOne: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    // Handle user queries
    if (sql.includes('FROM users') && sql.includes('email = $1')) {
      const email = String(params?.[0]).toLowerCase();
      return Array.from(mockUsers.values()).find(u => u.email === email) || null;
    }

    // Handle user by id
    if (sql.includes('FROM users') && sql.includes('id = $1')) {
      const id = String(params?.[0]);
      return mockUsers.get(id) || null;
    }

    // Handle user by verification token
    if (sql.includes('FROM users') && sql.includes('email_verification_token = $1')) {
      const tokenHash = String(params?.[0]);
      return Array.from(mockUsers.values()).find(u => u.email_verification_token === tokenHash) || null;
    }

    // Handle user by reset token
    if (sql.includes('FROM users') && sql.includes('password_reset_token = $1')) {
      const tokenHash = String(params?.[0]);
      return Array.from(mockUsers.values()).find(u => u.password_reset_token === tokenHash) || null;
    }

    // Handle refresh token queries
    if (sql.includes('FROM refresh_tokens') && sql.includes('token_hash = $1')) {
      const tokenHash = String(params?.[0]);
      const token = Array.from(mockRefreshTokens.values()).find(t => t.token_hash === tokenHash);
      if (token && sql.includes('JOIN users')) {
        const user = mockUsers.get(token.user_id);
        return { ...token, user_email: user?.email };
      }
      return token || null;
    }

    // Handle email verification attempts
    if (sql.includes('FROM email_verification_attempts') && sql.includes('email = $1')) {
      const email = String(params?.[0]).toLowerCase();
      return mockEmailVerificationAttempts.get(email) || null;
    }

    // Handle subscription plan queries
    if (sql.includes('FROM subscription_plans') && sql.includes('name = $1')) {
      const planName = String(params?.[0]);
      if (planName === 'professional') {
        return {
          id: 'professional-plan-id',
          name: 'professional',
          max_domains: 40,
          max_team_members: 5,
          check_interval_hours: 6,
          api_requests_per_month: 5000,
          sms_alerts_per_month: 100,
          email_alerts: true,
          slack_alerts: true,
        };
      }
      if (planName === 'starter') {
        return {
          id: 'starter-plan-id',
          name: 'starter',
          max_domains: 10,
          max_team_members: 1,
          check_interval_hours: 12,
        };
      }
      return null;
    }

    // Handle INSERT ... RETURNING for users
    if (sql.includes('INSERT INTO users') && sql.includes('RETURNING')) {
      const email = String(params?.[0]).toLowerCase();
      const passwordHash = String(params?.[1]);
      const verificationToken = String(params?.[2]);
      const verificationExpires = params?.[3];

      const id = generateId();
      const user = {
        id,
        email,
        password_hash: passwordHash,
        email_verified: false,
        email_verification_token: verificationToken,
        email_verification_expires: verificationExpires,
        created_at: new Date(),
      };
      mockUsers.set(id, user);
      return user;
    }

    // Handle INSERT for subscriptions
    if (sql.includes('INSERT INTO user_subscriptions') && sql.includes('RETURNING')) {
      return {
        id: generateId(),
        user_id: params?.[0],
        plan_id: params?.[1],
        status: params?.[2] || 'trial',
        is_trial: params?.[3] ?? true,
        trial_ends_at: params?.[4],
      };
    }

    // Handle audit log queries
    if (sql.includes('FROM audit_logs')) {
      const appName = params?.[0];
      const userEmail = params?.[1];
      const log = mockAuditLogs.find(l =>
        l.app_name === appName &&
        l.user_email === userEmail
      );
      return log || null;
    }

    return null;
  }),
  execute: jest.fn().mockImplementation(async (sql: string, params?: unknown[]) => {
    // Handle INSERT into refresh_tokens
    if (sql.includes('INSERT INTO refresh_tokens')) {
      const id = generateId();
      const token = {
        id,
        user_id: params?.[0],
        token_hash: params?.[1],
        expires_at: params?.[2],
        revoked: false,
      };
      mockRefreshTokens.set(id, token);
      return 1;
    }

    // Handle INSERT into audit_logs
    if (sql.includes('INSERT INTO audit_logs')) {
      mockAuditLogs.push({
        id: generateId(),
        app_name: params?.[0],
        log_level: params?.[1],
        action: params?.[2],
        message: params?.[3],
        user_email: params?.[4],
        user_id: params?.[5],
        error_code: params?.[6],
        created_at: new Date(),
      });
      return 1;
    }

    // Handle UPDATE users (verify email)
    if (sql.includes('UPDATE users') && sql.includes('email_verified = true')) {
      if (params?.[0]) {
        const userId = String(params[0]);
        const user = mockUsers.get(userId);
        if (user) {
          user.email_verified = true;
          user.email_verification_token = null;
          user.email_verification_expires = null;
          return 1;
        }
        // Also try to find by email
        const userByEmail = Array.from(mockUsers.values()).find(
          u => u.email === String(params[0]).toLowerCase()
        );
        if (userByEmail) {
          userByEmail.email_verified = true;
          return 1;
        }
      }
      return 0;
    }

    // Handle UPDATE users (password reset token)
    if (sql.includes('UPDATE users') && sql.includes('password_reset_token')) {
      if (sql.includes('password_reset_token = $1') && params?.length === 3) {
        const users = Array.from(mockUsers.values());
        const userByEmail = users.find(u => u.email === String(params[2]).toLowerCase());
        if (userByEmail) {
          userByEmail.password_reset_token = params[0];
          userByEmail.password_reset_expires = params[1];
          return 1;
        }
      }
      return 0;
    }

    // Handle UPDATE users (email verification token)
    if (sql.includes('UPDATE users') && sql.includes('email_verification_token')) {
      const userId = String(params?.[2]);
      const user = mockUsers.get(userId);
      if (user) {
        user.email_verification_token = params?.[0];
        user.email_verification_expires = params?.[1];
        return 1;
      }
      return 0;
    }

    // Handle UPDATE refresh_tokens (revoke)
    if (sql.includes('UPDATE refresh_tokens') && sql.includes('revoked = true')) {
      if (sql.includes('token_hash = $1')) {
        const tokenHash = String(params?.[0]);
        const token = Array.from(mockRefreshTokens.values()).find(t => t.token_hash === tokenHash);
        if (token) {
          token.revoked = true;
          return 1;
        }
        return 0;
      }
      if (sql.includes('WHERE id = $1')) {
        const tokenId = String(params?.[0]);
        const token = mockRefreshTokens.get(tokenId);
        if (token) {
          token.revoked = true;
          return 1;
        }
        return 0;
      }
      if (sql.includes('user_id = $1')) {
        const userId = String(params?.[0]);
        let count = 0;
        mockRefreshTokens.forEach(token => {
          if (token.user_id === userId) {
            token.revoked = true;
            count++;
          }
        });
        return count;
      }
    }

    // Handle INSERT into email_verification_attempts
    if (sql.includes('INSERT INTO email_verification_attempts')) {
      const email = String(params?.[0]).toLowerCase();
      mockEmailVerificationAttempts.set(email, {
        id: generateId(),
        email,
        attempt_count: 1,
        first_attempt_at: new Date(),
        last_attempt_at: new Date(),
      });
      return 1;
    }

    // Handle UPDATE email_verification_attempts
    if (sql.includes('UPDATE email_verification_attempts')) {
      const id = String(params?.[0]);
      const attempt = Array.from(mockEmailVerificationAttempts.values()).find(a => a.id === id);
      if (attempt) {
        if (sql.includes('attempt_count = 1')) {
          attempt.attempt_count = 1;
          attempt.first_attempt_at = new Date();
        } else {
          attempt.attempt_count++;
        }
        attempt.last_attempt_at = new Date();
        return 1;
      }
      return 0;
    }

    // Handle DELETE
    if (sql.includes('DELETE FROM')) {
      return 0;
    }

    return 0;
  }),
  pool: {
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'is_trial' }] };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: jest.fn(),
  },
}));

// Mock the Brevo email module
jest.mock('../email/brevo', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

// Mock the logger
jest.mock('../logging/logger.service', () => ({
  LoggerService: jest.fn().mockImplementation(() => ({
    info: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Auth UX Features', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    await app.register(authPlugin, {
      appName: 'test-app',
      jwtSecret: 'test-jwt-secret-for-testing-only',
      jwtExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      bcryptRounds: 4,
      appUrl: 'http://localhost:3000',
      cookieSecret: 'test-cookie-secret',
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockUsers.clear();
    mockRefreshTokens.clear();
    mockEmailVerificationAttempts.clear();
    mockAuditLogs.length = 0;
  });

  function generateTestEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@test.com`;
  }

  describe('Error Codes', () => {
    describe('Registration Error Codes', () => {
      it('should return EMAIL_ALREADY_REGISTERED error code', async () => {
        const testEmail = generateTestEmail();

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
        const testEmail = generateTestEmail();

        // Register user
        await app.inject({
          method: 'POST',
          url: '/auth/register',
          payload: { email: testEmail, password: 'TestPassword123!' },
        });

        // Manually verify
        const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
        if (user) {
          user.email_verified = true;
        }

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
        const testEmail = generateTestEmail();

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
      const testEmail = generateTestEmail();

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
      const attempt = mockEmailVerificationAttempts.get(testEmail.toLowerCase());
      expect(attempt).toBeDefined();
      expect(attempt?.attempt_count).toBe(1);
    });

    it('should include user email in response for frontend to use', async () => {
      const testEmail = generateTestEmail();

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
  });

  describe('Rate Limiting for Verification Emails', () => {
    it('should allow first 3 verification email resends within 1 hour', async () => {
      const testEmail = generateTestEmail();

      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: testEmail, password: 'TestPassword123!' },
      });

      // Make 3 resend-verification requests - all should succeed
      const responses = [];
      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/resend-verification',
          payload: { email: testEmail },
        });
        responses.push(JSON.parse(response.body));
      }

      // All 3 requests should succeed (not rate limited)
      expect(responses[0].success).toBe(true);
      expect(responses[1].success).toBe(true);
      expect(responses[2].success).toBe(true);
    });

    it('should block 4th attempt and return rate limit error', async () => {
      const testEmail = generateTestEmail();

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
      const testEmail = generateTestEmail();

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

      expect(body1.success).toBe(true);
      expect(body2.success).toBe(true);
    });
  });
});
