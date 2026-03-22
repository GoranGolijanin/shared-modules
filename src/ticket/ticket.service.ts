import { query, queryOne, execute } from '../database/config.js';
import { LoggerService } from '../logging/logger.service.js';
import type { SupportTicket, TicketMessage, SupportTicketWithMessages, TicketStatus, TicketPriority } from '../types/index.js';

export class TicketService {
  private appName: string;
  private logger: LoggerService;

  constructor(appName: string, logger: LoggerService) {
    this.appName = appName;
    this.logger = logger;
  }

  async createTicket(
    userId: string,
    category: string,
    subject: string,
    message: string,
    priority: TicketPriority = 'medium'
  ): Promise<SupportTicket & { messages: TicketMessage[] }> {
    const ticket = await queryOne<SupportTicket>(
      `INSERT INTO support_tickets (user_id, app_name, category, subject, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, this.appName, category, subject, priority]
    );

    if (!ticket) {
      throw new Error('Failed to create ticket');
    }

    const firstMessage = await queryOne<TicketMessage>(
      `INSERT INTO ticket_messages (ticket_id, user_id, is_admin, message)
       VALUES ($1, $2, false, $3)
       RETURNING *`,
      [ticket.id, userId, message]
    );

    await this.logger.info({
      action: 'ticket_created',
      message: `Ticket created: ${subject}`,
      user_id: userId,
      metadata: { ticketId: ticket.id, category, priority },
    });

    return { ...ticket, messages: firstMessage ? [firstMessage] : [] };
  }

  async getTickets(
    userId: string,
    filters?: { status?: TicketStatus; page?: number; limit?: number }
  ): Promise<{ tickets: SupportTicket[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE t.user_id = $1 AND t.app_name = $2';
    const params: unknown[] = [userId, this.appName];

    if (filters?.status) {
      params.push(filters.status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM support_tickets t ${whereClause}`,
      params
    );

    params.push(limit, offset);
    const tickets = await query<SupportTicket>(
      `SELECT t.* FROM support_tickets t
       ${whereClause}
       ORDER BY t.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      tickets,
      total: parseInt(countResult?.count || '0', 10),
    };
  }

  async getTicketById(ticketId: string, userId: string, isAdmin = false): Promise<SupportTicketWithMessages | null> {
    const ownerClause = isAdmin ? '' : 'AND t.user_id = $2';
    const params: unknown[] = isAdmin ? [ticketId] : [ticketId, userId];

    const ticket = await queryOne<SupportTicket & { user_email: string }>(
      `SELECT t.*, u.email as user_email
       FROM support_tickets t
       JOIN users u ON t.user_id = u.id
       WHERE t.id = $1 ${ownerClause}`,
      params
    );

    if (!ticket) return null;

    const messages = await query<TicketMessage>(
      `SELECT tm.* FROM ticket_messages tm
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [ticketId]
    );

    return { ...ticket, messages };
  }

  async addMessage(ticketId: string, userId: string, message: string, isAdmin = false): Promise<TicketMessage | null> {
    // Verify ticket exists and user has access
    const ticket = await queryOne<SupportTicket>(
      isAdmin
        ? 'SELECT * FROM support_tickets WHERE id = $1'
        : 'SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2',
      isAdmin ? [ticketId] : [ticketId, userId]
    );

    if (!ticket) return null;

    const newMessage = await queryOne<TicketMessage>(
      `INSERT INTO ticket_messages (ticket_id, user_id, is_admin, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [ticketId, userId, isAdmin, message]
    );

    // Reopen ticket if it was resolved/closed and the user replies
    if (!isAdmin && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      await execute(
        `UPDATE support_tickets SET status = 'open', closed_at = NULL WHERE id = $1`,
        [ticketId]
      );
    }

    // Update ticket updated_at (trigger handles this, but touch it explicitly for the query)
    await execute('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

    return newMessage;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<SupportTicket | null> {
    const closedAt = status === 'closed' || status === 'resolved' ? 'NOW()' : 'NULL';

    const ticket = await queryOne<SupportTicket>(
      `UPDATE support_tickets
       SET status = $1, closed_at = ${closedAt}
       WHERE id = $2
       RETURNING *`,
      [status, ticketId]
    );

    if (ticket) {
      await this.logger.info({
        action: 'ticket_status_changed',
        message: `Ticket ${ticketId} status changed to ${status}`,
        metadata: { ticketId, status },
      });
    }

    return ticket;
  }

  async getAdminTickets(
    filters?: { status?: TicketStatus; appName?: string; page?: number; limit?: number }
  ): Promise<{ tickets: (SupportTicket & { user_email: string; message_count: number })[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.status) {
      params.push(filters.status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    if (filters?.appName) {
      params.push(filters.appName);
      whereClause += ` AND t.app_name = $${params.length}`;
    }

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM support_tickets t ${whereClause}`,
      params
    );

    params.push(limit, offset);
    const tickets = await query<SupportTicket & { user_email: string; message_count: number }>(
      `SELECT t.*, u.email as user_email,
              (SELECT COUNT(*)::int FROM ticket_messages tm WHERE tm.ticket_id = t.id) as message_count
       FROM support_tickets t
       JOIN users u ON t.user_id = u.id
       ${whereClause}
       ORDER BY
         CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 WHEN 'closed' THEN 3 END,
         t.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      tickets,
      total: parseInt(countResult?.count || '0', 10),
    };
  }
}
