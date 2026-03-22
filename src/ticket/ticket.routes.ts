import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TicketService } from './ticket.service.js';
import { LoggerService } from '../logging/logger.service.js';
import type { TicketStatus, TicketPriority } from '../types/index.js';

export interface TicketPluginOptions {
  appName: string;
  categories: string[];
  routePrefix?: string;
}

async function ticketPluginFn(fastify: FastifyInstance, options: TicketPluginOptions) {
  const logger = new LoggerService(options.appName);
  const ticketService = new TicketService(options.appName, logger);
  const validCategories = options.categories;
  const prefix = options.routePrefix ? `${options.routePrefix}/tickets` : '/tickets';

  // Create ticket
  fastify.post<{ Body: { category: string; subject: string; message: string; priority?: TicketPriority } }>(
    `${prefix}`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { category, subject, message, priority } = request.body;

      if (!category || !validCategories.includes(category)) {
        return reply.status(400).send({
          success: false,
          message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
        });
      }

      if (!subject || subject.trim().length < 3) {
        return reply.status(400).send({ success: false, message: 'Subject must be at least 3 characters' });
      }

      if (!message || message.trim().length < 10) {
        return reply.status(400).send({ success: false, message: 'Message must be at least 10 characters' });
      }

      const ticket = await ticketService.createTicket(userId, category, subject.trim(), message.trim(), priority);
      return reply.status(201).send({ success: true, data: ticket });
    }
  );

  // List user's tickets
  fastify.get<{ Querystring: { status?: string; page?: string; limit?: string } }>(
    `${prefix}`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user as { userId: string };
      const { status, page, limit } = request.query;

      const result = await ticketService.getTickets(userId, {
        status: status as TicketStatus | undefined,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
      });

      return reply.send({ success: true, data: result });
    }
  );

  // Get ticket by ID with messages
  fastify.get<{ Params: { id: string } }>(
    `${prefix}/:id`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId, admin } = request.user as { userId: string; admin?: boolean };
      const ticket = await ticketService.getTicketById(request.params.id, userId, admin === true);

      if (!ticket) {
        return reply.status(404).send({ success: false, message: 'Ticket not found' });
      }

      return reply.send({ success: true, data: ticket });
    }
  );

  // Add message to ticket
  fastify.post<{ Params: { id: string }; Body: { message: string } }>(
    `${prefix}/:id/messages`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId, admin } = request.user as { userId: string; admin?: boolean };
      const { message } = request.body;

      if (!message || message.trim().length < 1) {
        return reply.status(400).send({ success: false, message: 'Message is required' });
      }

      const newMessage = await ticketService.addMessage(
        request.params.id, userId, message.trim(), admin === true
      );

      if (!newMessage) {
        return reply.status(404).send({ success: false, message: 'Ticket not found' });
      }

      return reply.status(201).send({ success: true, data: newMessage });
    }
  );

  // Update ticket status (admin only)
  fastify.put<{ Params: { id: string }; Body: { status: string } }>(
    `${prefix}/:id/status`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { admin } = request.user as { admin?: boolean };

      if (!admin) {
        return reply.status(403).send({ success: false, message: 'Admin access required' });
      }

      const { status } = request.body;
      const validStatuses: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(status as TicketStatus)) {
        return reply.status(400).send({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const ticket = await ticketService.updateTicketStatus(request.params.id, status as TicketStatus);

      if (!ticket) {
        return reply.status(404).send({ success: false, message: 'Ticket not found' });
      }

      return reply.send({ success: true, data: ticket });
    }
  );

  // List all tickets (admin only)
  fastify.get<{ Querystring: { status?: string; appName?: string; page?: string; limit?: string } }>(
    `${prefix}/admin`,
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { admin } = request.user as { admin?: boolean };

      if (!admin) {
        return reply.status(403).send({ success: false, message: 'Admin access required' });
      }

      const { status, appName, page, limit } = request.query;

      const result = await ticketService.getAdminTickets({
        status: status as TicketStatus | undefined,
        appName,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
      });

      return reply.send({ success: true, data: result });
    }
  );
}

export const ticketPlugin = fp(ticketPluginFn, {
  name: 'ticket-plugin',
  fastify: '5.x',
  dependencies: ['auth-plugin'],
});

export default ticketPlugin;
