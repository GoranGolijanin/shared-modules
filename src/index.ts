// Auth module exports
export { authPlugin, AuthService, registerAuthRoutes } from './auth/index.js';
export type { AuthPluginOptions } from './auth/index.js';

// Database exports
export { pool, query, queryOne, execute } from './database/config.js';

// Email exports
export { sendEmail, sendVerificationEmail, sendPasswordResetEmail } from './email/brevo.js';
export type { EmailOptions } from './email/brevo.js';

// Type exports
export type {
  User,
  RefreshToken,
  AuthTokens,
  JWTPayload,
  RegisterRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  RefreshTokenRequest,
  AuthConfig,
} from './types/index.js';
