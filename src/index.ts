// Auth module exports
export { authPlugin, AuthService, registerAuthRoutes } from './auth/index.js';
export type { AuthPluginOptions } from './auth/index.js';

// Database exports
export { pool, query, queryOne, execute } from './database/config.js';

// Email exports
export {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSSLExpiryAlert,
  sendDomainExpiryAlert,
} from './email/brevo.js';
export type { EmailOptions } from './email/brevo.js';

// Logging exports
export { LoggerService } from './logging/logger.service.js';

// Subscription exports
export { SubscriptionService } from './subscription/index.js';

// Usage exports
export { UsageService } from './usage/index.js';

// Middleware exports
export { planLimitsPlugin } from './middleware/index.js';
export type { PlanLimitsPluginOptions } from './middleware/index.js';

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

// Subscription & Usage type exports
export {
  SubscriptionStatus,
  BillingCycle,
  TeamRole,
  PlanLimitErrorCode,
} from './types/index.js';

export type {
  SubscriptionPlan,
  UserSubscription,
  UserSubscriptionWithPlan,
  UsageTracking,
  TeamMember,
  TeamMemberWithUser,
  UsageLimits,
  PlanLimitError,
} from './types/index.js';
