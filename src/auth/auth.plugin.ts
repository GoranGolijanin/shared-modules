import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import { registerAuthRoutes } from './auth.routes.js';
import type { AuthConfig } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}

export interface AuthPluginOptions {
  appName: string;
  jwtSecret: string;
  jwtExpiresIn?: string;
  refreshTokenExpiresIn?: string;
  bcryptRounds?: number;
  appUrl: string;
  cookieSecret?: string;
  /** Prefix for auth routes (e.g., '/api' makes routes available at /api/auth/*) */
  routePrefix?: string;
}

async function authPluginFn(fastify: FastifyInstance, options: AuthPluginOptions) {
  const config: AuthConfig = {
    appName: options.appName,
    jwtSecret: options.jwtSecret,
    jwtExpiresIn: options.jwtExpiresIn || '15m',
    refreshTokenExpiresIn: options.refreshTokenExpiresIn || '7d',
    bcryptRounds: options.bcryptRounds || 12,
    appUrl: options.appUrl,
  };

  // Register JWT plugin
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  // Register cookie plugin
  await fastify.register(fastifyCookie, {
    secret: options.cookieSecret || config.jwtSecret,
    parseOptions: {},
  });

  // Add authenticate decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
  });

  // Register auth routes (with optional prefix)
  if (options.routePrefix) {
    await fastify.register(
      async (instance) => {
        registerAuthRoutes(instance, config);
      },
      { prefix: options.routePrefix }
    );
  } else {
    registerAuthRoutes(fastify, config);
  }
}

export const authPlugin = fp(authPluginFn, {
  name: 'auth-plugin',
  fastify: '5.x',
});

export default authPlugin;
