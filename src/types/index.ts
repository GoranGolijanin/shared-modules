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
