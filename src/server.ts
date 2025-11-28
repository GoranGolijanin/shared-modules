import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { authPlugin } from './auth/index.js';

// Load .env from shared-modules root (works when run from project root)
dotenv.config();

const fastify = Fastify({
  logger: true,
});

async function start() {
  try {
    // Register CORS
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    });

    // Register auth plugin
    await fastify.register(authPlugin, {
      jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      jwtExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      bcryptRounds: 12,
      appUrl: process.env.APP_URL || 'http://localhost:3000',
      cookieSecret: process.env.COOKIE_SECRET || 'your-cookie-secret-change-in-production',
    });

    // Health check endpoint
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Start server
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT || '3001');

    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
