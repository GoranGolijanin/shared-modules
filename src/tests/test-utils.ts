import Fastify, { FastifyInstance } from 'fastify';
import { authPlugin } from '../auth/index.js';
import { pool, execute } from '../database/config.js';

export async function createTestServer(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  await fastify.register(authPlugin, {
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
  // Delete test users (emails ending with @test.com)
  await execute("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com')");
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
