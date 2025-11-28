import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import type {
  RegisterRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  RefreshTokenRequest,
  AuthConfig,
} from '../types/index.js';

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
};

const forgotPasswordSchema = {
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email' },
    },
  },
};

const resetPasswordSchema = {
  body: {
    type: 'object',
    required: ['token', 'password'],
    properties: {
      token: { type: 'string' },
      password: { type: 'string', minLength: 8 },
    },
  },
};

const verifyEmailSchema = {
  body: {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string' },
    },
  },
};

const refreshTokenSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string' },
    },
  },
};

export function registerAuthRoutes(fastify: FastifyInstance, config: AuthConfig) {
  const authService = new AuthService(
    config,
    (payload: { userId: string; email: string }, options?: { expiresIn?: string }) =>
      fastify.jwt.sign(payload, options),
    (token: string) => fastify.jwt.verify(token) as { userId: string; email: string }
  );

  // Register
  fastify.post<{ Body: RegisterRequest }>(
    '/auth/register',
    { schema: registerSchema },
    async (request, reply) => {
      const { email, password } = request.body;
      const result = await authService.register(email, password);

      if (!result.success) {
        return reply.status(400).send(result);
      }

      return reply.status(201).send(result);
    }
  );

  // Verify email
  fastify.post<{ Body: VerifyEmailRequest }>(
    '/auth/verify-email',
    { schema: verifyEmailSchema },
    async (request, reply) => {
      const { token } = request.body;
      const result = await authService.verifyEmail(token);

      if (!result.success) {
        return reply.status(400).send(result);
      }

      return reply.send(result);
    }
  );

  // Resend verification email
  fastify.post<{ Body: { email: string } }>(
    '/auth/resend-verification',
    { schema: forgotPasswordSchema },
    async (request, reply) => {
      const { email } = request.body;
      const result = await authService.resendVerificationEmail(email);
      return reply.send(result);
    }
  );

  // Login
  fastify.post<{ Body: LoginRequest }>(
    '/auth/login',
    { schema: loginSchema },
    async (request, reply) => {
      const { email, password } = request.body;
      const result = await authService.login(email, password);

      if (!result.success) {
        return reply.status(401).send(result);
      }

      // Set refresh token as HTTP-only cookie
      if (result.tokens) {
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/auth',
          maxAge: 7 * 24 * 60 * 60, // 7 days
        });
      }

      return reply.send({
        success: true,
        message: result.message,
        accessToken: result.tokens?.accessToken,
        user: result.user,
      });
    }
  );

  // Refresh tokens
  fastify.post<{ Body: RefreshTokenRequest }>(
    '/auth/refresh',
    { schema: refreshTokenSchema },
    async (request, reply) => {
      // Try to get refresh token from cookie first, then from body
      const refreshToken = request.cookies.refreshToken || request.body.refreshToken;

      if (!refreshToken) {
        return reply.status(400).send({ success: false, message: 'Refresh token required' });
      }

      const result = await authService.refreshTokens(refreshToken);

      if (!result.success) {
        reply.clearCookie('refreshToken', { path: '/auth' });
        return reply.status(401).send(result);
      }

      // Set new refresh token cookie
      if (result.tokens) {
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/auth',
          maxAge: 7 * 24 * 60 * 60,
        });
      }

      return reply.send({
        success: true,
        message: result.message,
        accessToken: result.tokens?.accessToken,
      });
    }
  );

  // Forgot password
  fastify.post<{ Body: ForgotPasswordRequest }>(
    '/auth/forgot-password',
    { schema: forgotPasswordSchema },
    async (request, reply) => {
      const { email } = request.body;
      const result = await authService.forgotPassword(email);
      return reply.send(result);
    }
  );

  // Reset password
  fastify.post<{ Body: ResetPasswordRequest }>(
    '/auth/reset-password',
    { schema: resetPasswordSchema },
    async (request, reply) => {
      const { token, password } = request.body;
      const result = await authService.resetPassword(token, password);

      if (!result.success) {
        return reply.status(400).send(result);
      }

      return reply.send(result);
    }
  );

  // Logout
  fastify.post(
    '/auth/logout',
    async (request, reply) => {
      const refreshToken = request.cookies.refreshToken;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      reply.clearCookie('refreshToken', { path: '/auth' });
      return reply.send({ success: true, message: 'Logged out successfully' });
    }
  );

  // Logout all sessions (requires authentication)
  fastify.post(
    '/auth/logout-all',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as { userId: string };
      const result = await authService.logoutAll(user.userId);

      reply.clearCookie('refreshToken', { path: '/auth' });
      return reply.send(result);
    }
  );

  // Get current user (protected route example)
  fastify.get(
    '/auth/me',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ success: true, user: request.user });
    }
  );
}
