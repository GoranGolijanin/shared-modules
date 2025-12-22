import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
  jwtSecret: string;
  jwtExpiresIn?: string;
  refreshTokenExpiresIn?: string;
  bcryptRounds?: number;
  appUrl: string;
  cookieSecret?: string;
}

export async function authPlugin(fastify: FastifyInstance, options: AuthPluginOptions) {
  const config: AuthConfig = {
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

  // Register auth routes
  registerAuthRoutes(fastify, config);
}

export default authPlugin;
