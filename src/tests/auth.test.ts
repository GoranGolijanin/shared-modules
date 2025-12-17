import { FastifyInstance } from 'fastify';
import { createTestServer, cleanupTestData, closeDatabase, generateTestEmail } from './test-utils';
import { queryOne, execute } from '../database/config';

describe('Auth Module', () => {
  let app: FastifyInstance;
  let testEmail: string;
  let verificationToken: string;
  let accessToken: string;
  let refreshToken: string;

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

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
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
    beforeEach(async () => {
      // Register a user and get verification token from database
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Get the verification token hash from database
      const user = await queryOne<{ email_verification_token: string }>(
        'SELECT email_verification_token FROM users WHERE email = $1',
        [testEmail.toLowerCase()]
      );
      verificationToken = user?.email_verification_token || '';
    });

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
    beforeEach(async () => {
      // Register and manually verify user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      // Manually verify the user for testing
      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );
    });

    it('should login successfully with valid credentials', async () => {
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

      // Save tokens for later tests
      accessToken = body.accessToken;

      // Get refresh token from cookie
      const cookies = response.cookies;
      const refreshCookie = cookies.find((c: { name: string }) => c.name === 'refreshToken');
      if (refreshCookie) {
        refreshToken = refreshCookie.value;
      }
    });

    it('should reject login with wrong password', async () => {
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
      const unverifiedEmail = generateTestEmail();

      // Register but don't verify
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: unverifiedEmail,
          password: 'TestPassword123!',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: unverifiedEmail,
          password: 'TestPassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('sent you a new verification link');
    });
  });

  describe('POST /auth/refresh', () => {
    let userRefreshToken: string;

    beforeEach(async () => {
      // Register, verify, and login user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

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
      userRefreshToken = refreshCookie?.value || '';
    });

    it('should refresh tokens successfully', async () => {
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
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });
    });

    it('should accept forgot password request for existing email', async () => {
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
    let userAccessToken: string;

    beforeEach(async () => {
      // Register, verify, and login user
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const body = JSON.parse(loginResponse.body);
      userAccessToken = body.accessToken;
    });

    it('should return user info with valid token', async () => {
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
    let userAccessToken: string;

    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      await execute(
        'UPDATE users SET email_verified = true WHERE email = $1',
        [testEmail.toLowerCase()]
      );

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testEmail,
          password: 'TestPassword123!',
        },
      });

      const body = JSON.parse(loginResponse.body);
      userAccessToken = body.accessToken;
    });

    it('should logout all sessions with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout-all',
        headers: {
          authorization: `Bearer ${userAccessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('All sessions');
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
