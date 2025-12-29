import Fastify, { FastifyInstance } from 'fastify';
import { authPlugin } from '../auth/index.js';
import { pool, execute } from '../database/config.js';

/**
 * Ensure the database schema has all required columns for tests.
 * This adds any missing columns that the subscription service expects.
 */
export async function ensureTestSchema(): Promise<void> {
  try {
    // Check if is_trial column exists, add if not
    const isTrialCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_subscriptions' AND column_name = 'is_trial'
    `);

    if (isTrialCheck.rows.length === 0) {
      await pool.query('ALTER TABLE user_subscriptions ADD COLUMN is_trial BOOLEAN DEFAULT false');
    }
  } catch (err) {
    // Column might already exist, ignore the error
    console.log('Note: is_trial column check:', (err as Error).message);
  }

  try {
    // Check if trial_ends_at column exists, add if not
    const trialEndsCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_subscriptions' AND column_name = 'trial_ends_at'
    `);

    if (trialEndsCheck.rows.length === 0) {
      await pool.query('ALTER TABLE user_subscriptions ADD COLUMN trial_ends_at TIMESTAMP');
    }
  } catch (err) {
    // Column might already exist, ignore the error
    console.log('Note: trial_ends_at column check:', (err as Error).message);
  }
}

export async function createTestServer(): Promise<FastifyInstance> {
  // Ensure database schema is up to date before creating server
  await ensureTestSchema();
  const fastify = Fastify({ logger: false });

  await fastify.register(authPlugin, {
    appName: 'test-app',
    jwtSecret: 'test-jwt-secret-for-testing-only',
    jwtExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    bcryptRounds: 4, // Lower rounds for faster tests
    appUrl: 'http://localhost:3000',
    cookieSecret: 'test-cookie-secret',
  });

  return fastify;
}

export async function cleanupTestData(): Promise<void> {
  // Delete test data (emails ending with @test.com or test-app data)
  await execute("DELETE FROM user_subscriptions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')");
  await execute("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')");
  await execute("DELETE FROM email_verification_attempts WHERE email LIKE '%@test.com'");
  await execute("DELETE FROM audit_logs WHERE app_name = 'test-app' OR user_email LIKE '%@test.com'");
  await execute("DELETE FROM users WHERE email LIKE '%@test.com'");
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test-${timestamp}-${random}@test.com`;
}

export async function waitForLog(
  queryFn: () => Promise<any>,
  maxAttempts: number = 50,
  delayMs: number = 100
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryFn();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error(`Log not found after ${maxAttempts} attempts (${maxAttempts * delayMs}ms)`);
}
