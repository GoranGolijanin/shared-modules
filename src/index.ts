// Auth module exports
export { authPlugin, AuthService, registerAuthRoutes } from './auth/index.js';
export type { AuthPluginOptions } from './auth/index.js';

// Database exports
export { pool, query, queryOne, execute } from './database/config.js';

// Email exports
export { sendEmail, sendVerificationEmail, sendPasswordResetEmail } from './email/brevo.js';
export type { EmailOptions } from './email/brevo.js';

// Logging exports
export { LoggerService } from './logging/logger.service.js';

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
  AuditLog,
  LogEntry,
  LogLevel,
  AuthErrorCode,
} from './types/index.js';
