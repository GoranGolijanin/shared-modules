import Fastify, { FastifyInstance } from 'fastify';
import { authPlugin } from '../auth/index';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// In-memory database for testing
const mockUsers: Map<string, any> = new Map();
const mockRefreshTokens: Map<string, any> = new Map();
const mockEmailVerificationAttempts: Map<string, any> = new Map();

function generateId() {
  return crypto.randomUUID();
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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

    // Handle count queries for refresh tokens
    if (sql.includes('COUNT(*)') && sql.includes('refresh_tokens')) {
      const userId = String(params?.[0]);
      const tokens = Array.from(mockRefreshTokens.values()).filter(
        t => t.user_id === userId && !t.revoked
      );
      return { count: String(tokens.length) };
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

    // Handle UPDATE users (verify email)
    if (sql.includes('UPDATE users') && sql.includes('email_verified = true')) {
      const userId = String(params?.[0]);
      const user = mockUsers.get(userId);
      if (user) {
        user.email_verified = true;
        user.email_verification_token = null;
        user.email_verification_expires = null;
        return 1;
      }
      return 0;
    }

    // Handle UPDATE users (password reset token)
    if (sql.includes('UPDATE users') && sql.includes('password_reset_token')) {
      if (sql.includes('password_reset_token = $1') && params?.length === 3) {
        // Set reset token
        const users = Array.from(mockUsers.values());
        const userByEmail = users.find(u => u.email === String(params[2]).toLowerCase());
        if (userByEmail) {
          userByEmail.password_reset_token = params[0];
          userByEmail.password_reset_expires = params[1];
          return 1;
        }
      }
      if (sql.includes('password_hash = $1')) {
        // Reset password
        const userId = String(params?.[1]);
        const user = mockUsers.get(userId);
        if (user && params) {
          user.password_hash = params[0] as string;
          user.password_reset_token = null;
          user.password_reset_expires = null;
          return 1;
        }
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
        // Revoke by token id (token rotation)
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
      // For schema checks
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ column_name: 'is_trial' }] };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: jest.fn(),
  },
}));

// Mock the Brevo email module to prevent sending real emails during tests
jest.mock('../email/brevo', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
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

describe('Auth Module', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    await app.register(authPlugin, {
      appName: 'test-app',
      jwtSecret: 'test-jwt-secret-for-testing-only',
      jwtExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      bcryptRounds: 4, // Lower rounds for faster tests
      appUrl: 'http://localhost:3000',
      cookieSecret: 'test-cookie-secret',
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear mock data before each test
    mockUsers.clear();
    mockRefreshTokens.clear();
    mockEmailVerificationAttempts.clear();
  });

  function generateTestEmail(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `test-${timestamp}-${random}@test.com`;
  }

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const testEmail = generateTestEmail();

      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Registration successful');
      expect(body.userId).toBeDefined();
    });

    it('should reject registration with existing email', async () => {
      const testEmail = generateTestEmail();

      // First registration
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'AnotherPassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('already registered');
    });

    it('should reject registration with invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject registration with short password', async () => {
      const testEmail = generateTestEmail();
      const response = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should reject invalid verification token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/verify-email',
        payload: {
          token: 'invalid-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const testEmail = generateTestEmail();

      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Manually verify the user
      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.accessToken).toBeDefined();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(testEmail.toLowerCase());
    });

    it('should reject login with wrong password', async () => {
      const testEmail = generateTestEmail();

      // Register user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Manually verify the user
      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'WrongPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid');
    });

    it('should reject login with non-existent email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'nonexistent@test.com',
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject login for unverified email', async () => {
      const testEmail = generateTestEmail();

      // Register but don't verify
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('sent you a new verification link');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const testEmail = generateTestEmail();

      // Register and login user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Manually verify
      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const cookies = loginResponse.cookies;
      const refreshCookie = cookies.find((c: { name: string }) => c.name === 'refreshToken');
      const userRefreshToken = refreshCookie?.value || '';

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: userRefreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.accessToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: 'invalid-refresh-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should detect token reuse (rotation)', async () => {
      const testEmail = generateTestEmail();

      // Register, verify and login
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const cookies = loginResponse.cookies;
      const refreshCookie = cookies.find((c: { name: string }) => c.name === 'refreshToken');
      const userRefreshToken = refreshCookie?.value || '';

      // First refresh - should succeed
      await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: userRefreshToken,
        },
      });

      // Second refresh with same token - should fail (token already used)
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: userRefreshToken,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('reuse');
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('should accept forgot password request for existing email', async () => {
      const testEmail = generateTestEmail();

      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: {
          email: testEmail,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should not reveal if email exists (security)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: {
          email: 'nonexistent@test.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      // Same message whether email exists or not
      expect(body.message).toContain('If your email is registered');
    });
  });

  describe('POST /auth/reset-password', () => {
    it('should reject invalid reset token', async () => {
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
    });

    it('should reject short password in reset', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: {
          token: 'some-token',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Logged out');
    });
  });

  describe('GET /auth/me (Protected Route)', () => {
    it('should return user info with valid token', async () => {
      const testEmail = generateTestEmail();

      // Register, verify and login
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const loginBody = JSON.parse(loginResponse.body);
      const userAccessToken = loginBody.accessToken;

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${userAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(testEmail.toLowerCase());
    });

    it('should reject request without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout-all (Protected Route)', () => {
    it('should logout all sessions with valid token', async () => {
      const testEmail = generateTestEmail();

      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const user = Array.from(mockUsers.values()).find(u => u.email === testEmail.toLowerCase());
      if (user) {
        user.email_verified = true;
      }

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const body = JSON.parse(loginResponse.body);
      const userAccessToken = body.accessToken;

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout-all',
        headers: {
          authorization: `Bearer ${userAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const responseBody = JSON.parse(response.body);
      expect(responseBody.success).toBe(true);
      expect(responseBody.message).toContain('All sessions');
    });

    it('should reject without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout-all',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
