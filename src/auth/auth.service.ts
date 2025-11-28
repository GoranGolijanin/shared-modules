import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, queryOne, execute } from '../database/config.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email/brevo.js';
import type {
  User,
  RefreshToken,
  AuthTokens,
  AuthConfig,
  JWTPayload,
} from '../types/index.js';

export class AuthService {
  private config: AuthConfig;
  private signJwt: (payload: { userId: string; email: string }, options?: { expiresIn?: string }) => string;
  private verifyJwt: (token: string) => JWTPayload;

  constructor(
    config: AuthConfig,
    signJwt: (payload: { userId: string; email: string }, options?: { expiresIn?: string }) => string,
    verifyJwt: (token: string) => JWTPayload
  ) {
    this.config = config;
    this.signJwt = signJwt;
    this.verifyJwt = verifyJwt;
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

  async register(email: string, password: string): Promise<{ success: boolean; message: string; userId?: string }> {
    // Check if user already exists
    const existingUser = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser) {
      return { success: false, message: 'Email already registered' };
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
      return { success: false, message: 'Failed to create user' };
    }

    // Send verification email
    await sendVerificationEmail(email, verificationToken, this.config.appUrl);

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      userId: user.id,
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(token);

    const user = await queryOne<User>(
      `SELECT id, email_verified, email_verification_expires
       FROM users
       WHERE email_verification_token = $1`,
      [tokenHash]
    );

    if (!user) {
      return { success: false, message: 'Invalid verification token' };
    }

    if (user.email_verified) {
      return { success: false, message: 'Email already verified' };
    }

    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      return { success: false, message: 'Verification token has expired' };
    }

    await execute(
      `UPDATE users
       SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL
       WHERE id = $1`,
      [user.id]
    );

    return { success: true, message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    const user = await queryOne<User>(
      'SELECT id, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      // Don't reveal if email exists
      return { success: true, message: 'If your email is registered, you will receive a verification link' };
    }

    if (user.email_verified) {
      return { success: false, message: 'Email is already verified' };
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

  async login(email: string, password: string): Promise<{ success: boolean; message: string; tokens?: AuthTokens; user?: { id: string; email: string } }> {
    const user = await queryOne<User>(
      'SELECT id, email, password_hash, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (!user) {
      return { success: false, message: 'Invalid email or password' };
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return { success: false, message: 'Invalid email or password' };
    }

    if (!user.email_verified) {
      return { success: false, message: 'Please verify your email before logging in' };
    }

    const tokens = await this.generateAuthTokens(user.id, user.email);

    return {
      success: true,
      message: 'Login successful',
      tokens,
      user: { id: user.id, email: user.email },
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ success: boolean; message: string; tokens?: AuthTokens }> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await queryOne<RefreshToken>(
      `SELECT id, user_id, expires_at, revoked
       FROM refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!storedToken) {
      return { success: false, message: 'Invalid refresh token' };
    }

    if (storedToken.revoked) {
      // Token reuse detected - revoke all tokens for this user
      await execute('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [storedToken.user_id]);
      return { success: false, message: 'Token reuse detected. All sessions have been revoked.' };
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      return { success: false, message: 'Refresh token has expired' };
    }

    // Revoke the used refresh token (rotation)
    await execute('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [storedToken.id]);

    // Get user
    const user = await queryOne<User>('SELECT id, email FROM users WHERE id = $1', [storedToken.user_id]);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Generate new tokens
    const tokens = await this.generateAuthTokens(user.id, user.email);

    return { success: true, message: 'Tokens refreshed', tokens };
  }

  async logout(refreshToken: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const result = await execute(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash]
    );

    if (result === 0) {
      return { success: false, message: 'Invalid refresh token' };
    }

    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAll(userId: string): Promise<{ success: boolean; message: string }> {
    await execute('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [userId]);
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

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = this.hashToken(token);

    const user = await queryOne<User>(
      `SELECT id, password_reset_expires
       FROM users
       WHERE password_reset_token = $1`,
      [tokenHash]
    );

    if (!user) {
      return { success: false, message: 'Invalid or expired reset token' };
    }

    if (user.password_reset_expires && new Date(user.password_reset_expires) < new Date()) {
      return { success: false, message: 'Reset token has expired' };
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
