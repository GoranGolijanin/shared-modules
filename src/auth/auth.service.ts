import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, queryOne, execute } from '../database/config.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email/brevo.js';
import { LoggerService } from '../logging/logger.service.js';
import { SubscriptionService } from '../subscription/subscription.service.js';
import type {
  User,
  RefreshToken,
  AuthTokens,
  AuthConfig,
  JWTPayload,
  EmailVerificationAttempt,
  AuthErrorCode,
} from '../types/index.js';

export class AuthService {
  private config: AuthConfig;
  private signJwt: (payload: { userId: string; email: string }, options?: { expiresIn?: string }) => string;
  private verifyJwt: (token: string) => JWTPayload;
  private logger: LoggerService;
  private subscriptionService: SubscriptionService;

  constructor(
    config: AuthConfig,
    signJwt: (payload: { userId: string; email: string }, options?: { expiresIn?: string }) => string,
    verifyJwt: (token: string) => JWTPayload,
    logger: LoggerService
  ) {
    this.config = config;
    this.signJwt = signJwt;
    this.verifyJwt = verifyJwt;
    this.logger = logger;
    this.subscriptionService = new SubscriptionService(config.appName, logger);
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60 * 1000; // Default 15 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 15 * 60 * 1000;
    }
  }

  private async checkRateLimit(email: string): Promise<{ allowed: boolean; errorCode?: AuthErrorCode }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const normalizedEmail = email.toLowerCase();

    // Get existing attempt record
    const attempt = await queryOne<EmailVerificationAttempt>(
      'SELECT id, attempt_count, first_attempt_at FROM email_verification_attempts WHERE email = $1',
      [normalizedEmail]
    );

    if (!attempt) {
      // First attempt - create record
      await execute(
        `INSERT INTO email_verification_attempts (email, attempt_count, first_attempt_at, last_attempt_at)
         VALUES ($1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [normalizedEmail]
      );
      return { allowed: true };
    }

    // Check if the time window has expired (more than 1 hour since first attempt)
    if (new Date(attempt.first_attempt_at) < oneHourAgo) {
      // Reset the counter - start a new time window
      await execute(
        `UPDATE email_verification_attempts
         SET attempt_count = 1, first_attempt_at = CURRENT_TIMESTAMP, last_attempt_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [attempt.id]
      );
      return { allowed: true };
    }

    // Check if rate limit exceeded (max 3 attempts per hour)
    if (attempt.attempt_count >= 3) {
      return { allowed: false, errorCode: 'RATE_LIMIT_EXCEEDED' as AuthErrorCode };
    }

    // Increment attempt count
    await execute(
      `UPDATE email_verification_attempts
       SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [attempt.id]
    );

    return { allowed: true };
  }

  async register(email: string, password: string): Promise<{ success: boolean; message: string; userId?: string; errorCode?: AuthErrorCode }> {
    // Check if user already exists
    const existingUser = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser) {
      await this.logger.error({
        action: 'register',
        message: 'Registration failed - email already exists',
        error_code: 'EMAIL_ALREADY_REGISTERED',
        user_email: email.toLowerCase(),
      });
      return {
        success: false,
        message: 'Email already registered',
        errorCode: 'EMAIL_ALREADY_REGISTERED' as AuthErrorCode,
      };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);

    // Generate verification token
    const verificationToken = this.generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email.toLowerCase(), passwordHash, this.hashToken(verificationToken), verificationExpires]
    );

    if (!user) {
      await this.logger.error({
        action: 'register',
        message: 'Failed to create user in database',
        user_email: email.toLowerCase(),
      });
      return { success: false, message: 'Failed to create user' };
    }

    // Send verification email
    await sendVerificationEmail(email, verificationToken, this.config.appUrl);

    await this.logger.info({
      action: 'register',
      message: `User ${email.toLowerCase()} registered successfully`,
      user_email: email.toLowerCase(),
      user_id: user.id,
    });

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string; errorCode?: AuthErrorCode }> {
    const tokenHash = this.hashToken(token);

    const user = await queryOne<User>(
      `SELECT id, email, email_verified, email_verification_expires
       FROM users
       WHERE email_verification_token = $1`,
      [tokenHash]
    );

    if (!user) {
      await this.logger.error({
        action: 'verify_email',
        message: 'Email verification failed - invalid token',
        error_code: 'INVALID_TOKEN',
      });
      return {
        success: false,
        message: 'Invalid verification token',
        errorCode: 'INVALID_TOKEN' as AuthErrorCode,
      };
    }

    if (user.email_verified) {
      await this.logger.warn({
        action: 'verify_email',
        message: 'Email verification attempt - already verified',
        user_email: user.email,
        user_id: user.id,
      });
      return {
        success: false,
        message: 'Email already verified',
        errorCode: 'EMAIL_ALREADY_VERIFIED' as AuthErrorCode,
      };
    }

    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      await this.logger.error({
        action: 'verify_email',
        message: 'Email verification failed - token expired',
        error_code: 'TOKEN_EXPIRED',
        user_email: user.email,
        user_id: user.id,
      });
      return {
        success: false,
        message: 'Verification token has expired',
        errorCode: 'TOKEN_EXPIRED' as AuthErrorCode,
      };
    }

    await execute(
      `UPDATE users
       SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Assign 14-day trial with Professional features to the newly verified user
    try {
      await this.subscriptionService.assignTrialPlan(user.id);
      await this.logger.info({
        action: 'assign_trial',
        message: `14-day trial assigned to ${user.email}`,
        user_email: user.email,
        user_id: user.id,
      });
    } catch (trialError) {
      // Log but don't fail the verification if trial assignment fails
      await this.logger.error({
        action: 'assign_trial',
        message: `Failed to assign trial to ${user.email}`,
        user_email: user.email,
        user_id: user.id,
        error_stack: trialError instanceof Error ? trialError.stack : undefined,
      });
    }

    await this.logger.info({
      action: 'verify_email',
      message: `Email verified successfully for ${user.email}`,
      user_email: user.email,
      user_id: user.id,
    });

    return { success: true, message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string, skipRateLimit = false): Promise<{ success: boolean; message: string; errorCode?: AuthErrorCode }> {
    // Check rate limit unless explicitly skipped
    if (!skipRateLimit) {
      const rateLimitCheck = await this.checkRateLimit(email);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          message: 'Too many verification email requests. Please try again in an hour.',
          errorCode: rateLimitCheck.errorCode,
        };
      }
    }

    const user = await queryOne<User>(
      'SELECT id, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      // Don't reveal if email exists
      return { success: true, message: 'If your email is registered, you will receive a verification link' };
    }

    if (user.email_verified) {
      return {
        success: false,
        message: 'Email is already verified',
        errorCode: 'EMAIL_ALREADY_VERIFIED' as AuthErrorCode,
      };
    }

    const verificationToken = this.generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await execute(
      `UPDATE users
       SET email_verification_token = $1, email_verification_expires = $2
       WHERE id = $3`,
      [this.hashToken(verificationToken), verificationExpires, user.id]
    );

    await sendVerificationEmail(email, verificationToken, this.config.appUrl);

    return { success: true, message: 'If your email is registered, you will receive a verification link' };
  }

  async login(email: string, password: string): Promise<{ success: boolean; message: string; tokens?: AuthTokens; user?: { id: string; email: string }; errorCode?: AuthErrorCode; email?: string }> {
    const user = await queryOne<User>(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      await this.logger.error({
        action: 'login',
        message: 'Login failed - user not found',
        error_code: 'INVALID_CREDENTIALS',
        user_email: email.toLowerCase(),
      });
      return {
        success: false,
        message: 'Invalid email or password',
        errorCode: 'INVALID_CREDENTIALS' as AuthErrorCode,
      };
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      await this.logger.error({
        action: 'login',
        message: 'Login failed - invalid password',
        error_code: 'INVALID_CREDENTIALS',
        user_email: email.toLowerCase(),
        user_id: user.id,
      });
      return {
        success: false,
        message: 'Invalid email or password',
        errorCode: 'INVALID_CREDENTIALS' as AuthErrorCode,
      };
    }

    if (!user.email_verified) {
      // Auto-resend verification email on login attempt (skip rate limit for first auto-send)
      const rateLimitCheck = await this.checkRateLimit(email);

      if (rateLimitCheck.allowed) {
        // This is within rate limit - send the email
        await this.resendVerificationEmail(email, true); // Skip rate limit check since we already checked
        await this.logger.warn({
          action: 'login',
          message: 'Login blocked - email not verified, verification email resent',
          user_email: email.toLowerCase(),
          user_id: user.id,
        });
        return {
          success: false,
          message: 'Your email is not verified. We have sent you a new verification link. Please check your email.',
          errorCode: 'EMAIL_NOT_VERIFIED' as AuthErrorCode,
          email: user.email,
        };
      } else {
        // Rate limit exceeded
        await this.logger.warn({
          action: 'login',
          message: 'Login blocked - email not verified, rate limit exceeded',
          user_email: email.toLowerCase(),
          user_id: user.id,
        });
        return {
          success: false,
          message: 'Your email is not verified. Too many verification emails sent. Please check your inbox or try again in an hour.',
          errorCode: 'EMAIL_NOT_VERIFIED' as AuthErrorCode,
          email: user.email,
        };
      }
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);

    await this.logger.info({
      action: 'login',
      message: `User ${email.toLowerCase()} logged in successfully`,
      user_email: email.toLowerCase(),
      user_id: user.id,
    });

    return {
      success: true,
      message: 'Login successful',
      tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ success: boolean; message: string; tokens?: AuthTokens; errorCode?: AuthErrorCode }> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await queryOne<RefreshToken>(
      `SELECT id, user_id, expires_at, revoked
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!storedToken) {
      return {
        success: false,
        message: 'Invalid refresh token',
        errorCode: 'INVALID_TOKEN' as AuthErrorCode,
      };
    }

    if (storedToken.revoked) {
      // Token reuse detected - revoke all tokens for this user
      await execute('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [storedToken.user_id]);
      return {
        success: false,
        message: 'Token reuse detected. All sessions have been revoked.',
        errorCode: 'TOKEN_REUSE_DETECTED' as AuthErrorCode,
      };
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      return {
        success: false,
        message: 'Refresh token has expired',
        errorCode: 'TOKEN_EXPIRED' as AuthErrorCode,
      };
    }

    // Revoke the used refresh token (rotation)
    await execute('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [storedToken.id]);

    // Get user
    const user = await queryOne<User>('SELECT id, email FROM users WHERE id = $1', [storedToken.user_id]);
    if (!user) {
      return {
        success: false,
        message: 'User not found',
        errorCode: 'USER_NOT_FOUND' as AuthErrorCode,
      };
    }

    // Generate new tokens
    const tokens = await this.generateAuthTokens(user.id, user.email);

    return { success: true, message: 'Tokens refreshed', tokens };
  }

  async logout(refreshToken: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(refreshToken);

    // Get user info for logging
    const token = await queryOne<RefreshToken & { user_email?: string }>(
      `SELECT rt.*, u.email as user_email
       FROM refresh_tokens rt
       LEFT JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    const result = await execute(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash]
    );

    if (result === 0) {
      await this.logger.error({
        action: 'logout',
        message: 'Logout failed - invalid refresh token',
      });
      return { success: false, message: 'Invalid refresh token' };
    }

    if (token) {
      await this.logger.info({
        action: 'logout',
        message: `User logged out successfully`,
        user_email: token.user_email,
        user_id: token.user_id,
      });
    }

    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAll(userId: string): Promise<{ success: boolean; message: string }> {
    const user = await queryOne<User>('SELECT email FROM users WHERE id = $1', [userId]);

    await execute('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);

    await this.logger.info({
      action: 'logout_all',
      message: `All sessions logged out for user`,
      user_email: user?.email,
      user_id: userId,
    });

    return { success: true, message: 'All sessions logged out' };
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await queryOne<User>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

    // Always return success to prevent email enumeration
    const successMessage = 'If your email is registered, you will receive a password reset link';

    if (!user) {
      return { success: true, message: successMessage };
    }

    const resetToken = this.generateToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await execute(
      `UPDATE users
       SET password_reset_token = $1, password_reset_expires = $2
       WHERE id = $3`,
      [this.hashToken(resetToken), resetExpires, user.id]
    );

    await sendPasswordResetEmail(email, resetToken, this.config.appUrl);

    return { success: true, message: successMessage };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string; errorCode?: AuthErrorCode }> {
    const tokenHash = this.hashToken(token);

    const user = await queryOne<User>(
      `SELECT id, email, password_reset_expires
       FROM users
       WHERE password_reset_token = $1`,
      [tokenHash]
    );

    if (!user) {
      await this.logger.error({
        action: 'reset_password',
        message: 'Password reset failed - invalid token',
        error_code: 'INVALID_TOKEN',
      });
      return {
        success: false,
        message: 'Invalid or expired reset token',
        errorCode: 'INVALID_TOKEN' as AuthErrorCode,
      };
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      await this.logger.error({
        action: 'reset_password',
        message: 'Password reset failed - token expired',
        error_code: 'TOKEN_EXPIRED',
        user_email: user.email,
        user_id: user.id,
      });
      return {
        success: false,
        message: 'Reset token has expired',
        errorCode: 'TOKEN_EXPIRED' as AuthErrorCode,
      };
    }

    const passwordHash = await bcrypt.hash(newPassword, this.config.bcryptRounds);

    await execute(
      `UPDATE users
       SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Revoke all refresh tokens for security
    await execute('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [user.id]);

    await this.logger.info({
      action: 'reset_password',
      message: `Password reset successfully for ${user.email}`,
      user_email: user.email,
      user_id: user.id,
    });

    return { success: true, message: 'Password reset successful. Please log in with your new password.' };
  }

  private async generateAuthTokens(userId: string, email: string): Promise<AuthTokens> {
    // Generate access token
    const accessToken = this.signJwt(
      { userId, email },
      { expiresIn: this.config.jwtExpiresIn }
    );

    // Generate refresh token
    const refreshToken = this.generateToken();
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.parseExpiresIn(this.config.refreshTokenExpiresIn));

    // Store refresh token
    await execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, refreshTokenHash, expiresAt]
    );

    return { accessToken, refreshToken };
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await execute(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked = true'
    );
    return result;
  }
}
