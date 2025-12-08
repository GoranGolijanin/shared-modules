import Fastify, { FastifyInstance } from 'fastify';
import { authPlugin } from '../auth/index.js';
import { pool, execute } from '../database/config.js';

export async function createTestServer(): Promise<FastifyInstance> {
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
  maxAttempts: number = 10,
  delayMs: number = 100
): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryFn();
    if (result) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}
