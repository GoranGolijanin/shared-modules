export enum AuthErrorCode {
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  EMAIL_ALREADY_VERIFIED = 'EMAIL_ALREADY_VERIFIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',
}

export interface AuthResponse {
  success: boolean;
  message: string;
  errorCode?: AuthErrorCode;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  password_reset_token: string | null;
  password_reset_expires: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmailVerificationAttempt {
  id: string;
  email: string;
  attempt_count: number;
  first_attempt_at: Date;
  last_attempt_at: Date;
}

export type LogLevel = 'info' | 'error' | 'warn' | 'debug';

export interface AuditLog {
  id: string;
  app_name: string;
  log_level: LogLevel;
  action?: string;
  message: string;
  user_email?: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  error_code?: string;
  error_stack?: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface LogEntry {
  app_name: string;
  log_level: LogLevel;
  action?: string;
  message: string;
  user_email?: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  error_code?: string;
  error_stack?: string;
  metadata?: Record<string, any>;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthConfig {
  appName: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  bcryptRounds: number;
  appUrl: string;
}

// ============================================
// Subscription & Usage Types
// ============================================

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TRIAL = 'trial',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
}

export enum TeamRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum PlanLimitErrorCode {
  DOMAIN_LIMIT_REACHED = 'DOMAIN_LIMIT_REACHED',
  TEAM_LIMIT_REACHED = 'TEAM_LIMIT_REACHED',
  SMS_LIMIT_REACHED = 'SMS_LIMIT_REACHED',
  API_LIMIT_REACHED = 'API_LIMIT_REACHED',
  FEATURE_NOT_AVAILABLE = 'FEATURE_NOT_AVAILABLE',
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  max_domains: number;
  max_team_members: number;
  check_interval_hours: number;
  api_requests_per_month: number | null;
  sms_alerts_per_month: number | null;
  email_alerts: boolean;
  slack_alerts: boolean;
  created_at: Date;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  started_at: Date;
  expires_at: Date | null;
  billing_cycle: BillingCycle | null;
  stripe_subscription_id: string | null;
  is_trial: boolean;
  trial_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TrialInfo {
  isOnTrial: boolean;
  trialEndsAt: Date | null;
  daysRemaining: number;
  isExpired: boolean;
}

export interface UserSubscriptionWithPlan extends UserSubscription {
  plan: SubscriptionPlan;
}

export interface UsageTracking {
  id: string;
  user_id: string;
  month_year: string;
  api_requests: number;
  sms_alerts_sent: number;
  created_at: Date;
  updated_at: Date;
}

export interface TeamMember {
  id: string;
  owner_user_id: string;
  member_user_id: string;
  role: TeamRole;
  invited_at: Date;
  accepted_at: Date | null;
}

export interface TeamMemberWithUser extends TeamMember {
  member_email: string;
}

// Convenience type for current usage vs limits
export interface UsageLimits {
  plan: string;
  domains: {
    used: number;
    limit: number;
    unlimited: boolean;
  };
  teamMembers: {
    used: number;
    limit: number;
    unlimited: boolean;
  };
  apiRequests: {
    used: number;
    limit: number | null;
    unlimited: boolean;
  };
  smsAlerts: {
    used: number;
    limit: number | null;
    unlimited: boolean;
  };
  features: {
    emailAlerts: boolean;
    smsAlerts: boolean;
    slackAlerts: boolean;
  };
  checkIntervalHours: number;
}

export interface PlanLimitError {
  error: PlanLimitErrorCode;
  message: string;
  current?: number;
  limit?: number;
  upgradeUrl: string;
}
