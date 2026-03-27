import { TicketService } from '../ticket/ticket.service';
import * as dbConfig from '../database/config';

// Mock the database module
jest.mock('../database/config', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
  pool: { query: jest.fn(), end: jest.fn() },
}));

const APP_NAME = 'test-app';

function makeFakeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ticket-uuid-1',
    user_id: 'user-uuid-1',
    app_name: APP_NAME,
    category: 'billing',
    subject: 'Billing question',
    status: 'open',
    priority: 'medium',
    created_at: new Date('2026-03-27T10:00:00Z'),
    updated_at: new Date('2026-03-27T10:00:00Z'),
    closed_at: null,
    ...overrides,
  };
}

function makeFakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-uuid-1',
    ticket_id: 'ticket-uuid-1',
    user_id: 'user-uuid-1',
    is_admin: false,
    message: 'This is a test message body',
    created_at: new Date('2026-03-27T10:00:00Z'),
    ...overrides,
  };
}

describe('TicketService', () => {
  let ticketService: TicketService;
  let mockQuery: jest.Mock;
  let mockQueryOne: jest.Mock;
  let mockExecute: jest.Mock;
  const mockLogger = {
    info: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = dbConfig.query as jest.Mock;
    mockQueryOne = dbConfig.queryOne as jest.Mock;
    mockExecute = dbConfig.execute as jest.Mock;

    ticketService = new TicketService(APP_NAME, mockLogger as any);
  });

  // -------------------------------------------------------------------------
  // createTicket
  // -------------------------------------------------------------------------

  describe('createTicket', () => {
    it('should insert ticket and first message, then return both', async () => {
      const fakeTicket = makeFakeTicket();
      const fakeMessage = makeFakeMessage();

      mockQueryOne
        .mockResolvedValueOnce(fakeTicket)
        .mockResolvedValueOnce(fakeMessage);

      const result = await ticketService.createTicket(
        'user-uuid-1', 'billing', 'Billing question', 'I have a billing concern.', 'medium'
      );

      expect(result).toEqual({ ...fakeTicket, messages: [fakeMessage] });
      expect(mockQueryOne).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO support_tickets'),
        ['user-uuid-1', APP_NAME, 'billing', 'Billing question', 'medium']
      );
      expect(mockQueryOne).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO ticket_messages'),
        [fakeTicket.id, 'user-uuid-1', 'I have a billing concern.']
      );
    });

    it('should log ticket creation', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket())
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.createTicket('user-uuid-1', 'billing', 'Test', 'Test message body.');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ticket_created',
          user_id: 'user-uuid-1',
          metadata: expect.objectContaining({ ticketId: 'ticket-uuid-1', category: 'billing' }),
        })
      );
    });

    it('should use default priority of medium when not specified', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket())
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.createTicket('user-uuid-1', 'billing', 'Test', 'Test message body.');

      expect(mockQueryOne).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO support_tickets'),
        expect.arrayContaining(['medium'])
      );
    });

    it('should throw if ticket INSERT returns null', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await expect(
        ticketService.createTicket('user-uuid-1', 'billing', 'Fail', 'This should fail badly.')
      ).rejects.toThrow('Failed to create ticket');
    });

    it('should return empty messages array if message INSERT returns null', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket())
        .mockResolvedValueOnce(null);

      const result = await ticketService.createTicket(
        'user-uuid-1', 'billing', 'Subject', 'A message that is long enough.'
      );

      expect(result.messages).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getTickets
  // -------------------------------------------------------------------------

  describe('getTickets', () => {
    it('should return tickets and total count for a user', async () => {
      const fakeTickets = [makeFakeTicket(), makeFakeTicket({ id: 'ticket-uuid-2' })];
      mockQueryOne.mockResolvedValueOnce({ count: '2' });
      mockQuery.mockResolvedValueOnce(fakeTickets);

      const result = await ticketService.getTickets('user-uuid-1');

      expect(result.tickets).toEqual(fakeTickets);
      expect(result.total).toBe(2);
    });

    it('should apply status filter when provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '1' });
      mockQuery.mockResolvedValueOnce([makeFakeTicket({ status: 'open' })]);

      await ticketService.getTickets('user-uuid-1', { status: 'open' as any });

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t.status = $'),
        expect.arrayContaining(['user-uuid-1', APP_NAME, 'open'])
      );
    });

    it('should use default pagination (page 1, limit 20)', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getTickets('user-uuid-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([20, 0])
      );
    });

    it('should compute correct offset for page 2', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '30' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getTickets('user-uuid-1', { page: 2, limit: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 10])
      );
    });

    it('should return total 0 when count query returns null', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce([]);

      const result = await ticketService.getTickets('user-uuid-1');

      expect(result.total).toBe(0);
    });

    it('should always filter by app_name', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getTickets('user-uuid-1');

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('t.app_name = $2'),
        expect.arrayContaining([APP_NAME])
      );
    });
  });

  // -------------------------------------------------------------------------
  // getTicketById
  // -------------------------------------------------------------------------

  describe('getTicketById', () => {
    it('should return ticket with messages for owner', async () => {
      const fakeTicket = { ...makeFakeTicket(), user_email: 'user@example.com' };
      const fakeMessages = [makeFakeMessage(), makeFakeMessage({ id: 'msg-uuid-2' })];

      mockQueryOne.mockResolvedValueOnce(fakeTicket);
      mockQuery.mockResolvedValueOnce(fakeMessages);

      const result = await ticketService.getTicketById('ticket-uuid-1', 'user-uuid-1');

      expect(result).toEqual({ ...fakeTicket, messages: fakeMessages });
    });

    it('should return null when ticket is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await ticketService.getTicketById('nonexistent', 'user-uuid-1');

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should include user_id check for non-admin access', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await ticketService.getTicketById('ticket-uuid-1', 'user-uuid-1', false);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t.user_id = $2'),
        ['ticket-uuid-1', 'user-uuid-1']
      );
    });

    it('should omit user_id check for admin access', async () => {
      const fakeTicket = { ...makeFakeTicket(), user_email: 'user@example.com' };
      mockQueryOne.mockResolvedValueOnce(fakeTicket);
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getTicketById('ticket-uuid-1', 'admin-uuid', true);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.not.stringContaining('AND t.user_id = $2'),
        ['ticket-uuid-1']
      );
    });

    it('should query messages ordered by created_at ASC', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...makeFakeTicket(), user_email: 'user@example.com' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getTicketById('ticket-uuid-1', 'user-uuid-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY tm.created_at ASC'),
        ['ticket-uuid-1']
      );
    });
  });

  // -------------------------------------------------------------------------
  // addMessage
  // -------------------------------------------------------------------------

  describe('addMessage', () => {
    it('should add a message to an existing ticket', async () => {
      const fakeTicket = makeFakeTicket();
      const fakeMessage = makeFakeMessage({ message: 'Follow-up message.' });

      mockQueryOne
        .mockResolvedValueOnce(fakeTicket)
        .mockResolvedValueOnce(fakeMessage);

      const result = await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Follow-up message.');

      expect(result).toEqual(fakeMessage);
    });

    it('should return null when ticket is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await ticketService.addMessage('nonexistent', 'user-uuid-1', 'Hello');

      expect(result).toBeNull();
    });

    it('should reopen a resolved ticket when a non-admin user replies', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket({ status: 'resolved' }))
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Still having the issue.');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'open'"),
        ['ticket-uuid-1']
      );
    });

    it('should reopen a closed ticket when a non-admin user replies', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket({ status: 'closed' }))
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Please reopen.');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'open'"),
        ['ticket-uuid-1']
      );
    });

    it('should NOT reopen a ticket when an admin replies', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket({ status: 'resolved' }))
        .mockResolvedValueOnce(makeFakeMessage({ is_admin: true }));

      await ticketService.addMessage('ticket-uuid-1', 'admin-uuid', 'Admin reply.', true);

      const reopenCalls = mockExecute.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes("status = 'open'")
      );
      expect(reopenCalls).toHaveLength(0);
    });

    it('should not reopen an open or in_progress ticket', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket({ status: 'open' }))
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Another message.');

      const reopenCalls = mockExecute.mock.calls.filter(
        (call) => typeof call[0] === 'string' && (call[0] as string).includes("status = 'open'")
      );
      expect(reopenCalls).toHaveLength(0);
    });

    it('should always update the ticket updated_at timestamp', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket())
        .mockResolvedValueOnce(makeFakeMessage());

      await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Some message.');

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('SET updated_at = NOW()'),
        ['ticket-uuid-1']
      );
    });

    it('should allow admin to access any ticket without user_id check', async () => {
      mockQueryOne
        .mockResolvedValueOnce(makeFakeTicket({ user_id: 'other-user' }))
        .mockResolvedValueOnce(makeFakeMessage({ is_admin: true }));

      await ticketService.addMessage('ticket-uuid-1', 'admin-uuid', 'Admin note.', true);

      expect(mockQueryOne).toHaveBeenNthCalledWith(
        1,
        expect.not.stringContaining('AND user_id'),
        ['ticket-uuid-1']
      );
    });

    it('should include user_id check for non-admin', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await ticketService.addMessage('ticket-uuid-1', 'user-uuid-1', 'Hello.');

      expect(mockQueryOne).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('AND user_id = $2'),
        ['ticket-uuid-1', 'user-uuid-1']
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateTicketStatus
  // -------------------------------------------------------------------------

  describe('updateTicketStatus', () => {
    it('should update status and return the updated ticket', async () => {
      const updatedTicket = makeFakeTicket({ status: 'resolved' });
      mockQueryOne.mockResolvedValueOnce(updatedTicket);

      const result = await ticketService.updateTicketStatus('ticket-uuid-1', 'resolved' as any);

      expect(result).toEqual(updatedTicket);
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE support_tickets'),
        ['resolved', 'ticket-uuid-1']
      );
    });

    it('should set closed_at to NOW() when status is resolved', async () => {
      mockQueryOne.mockResolvedValueOnce(makeFakeTicket({ status: 'resolved' }));

      await ticketService.updateTicketStatus('ticket-uuid-1', 'resolved' as any);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('closed_at = NOW()'),
        expect.anything()
      );
    });

    it('should set closed_at to NOW() when status is closed', async () => {
      mockQueryOne.mockResolvedValueOnce(makeFakeTicket({ status: 'closed' }));

      await ticketService.updateTicketStatus('ticket-uuid-1', 'closed' as any);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('closed_at = NOW()'),
        expect.anything()
      );
    });

    it('should set closed_at to NULL when status is open', async () => {
      mockQueryOne.mockResolvedValueOnce(makeFakeTicket({ status: 'open' }));

      await ticketService.updateTicketStatus('ticket-uuid-1', 'open' as any);

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('closed_at = NULL'),
        expect.anything()
      );
    });

    it('should return null when ticket does not exist', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await ticketService.updateTicketStatus('nonexistent', 'open' as any);

      expect(result).toBeNull();
    });

    it('should log status change when ticket is found', async () => {
      mockQueryOne.mockResolvedValueOnce(makeFakeTicket({ status: 'closed' }));

      await ticketService.updateTicketStatus('ticket-uuid-1', 'closed' as any);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ticket_status_changed',
          metadata: expect.objectContaining({ ticketId: 'ticket-uuid-1', status: 'closed' }),
        })
      );
    });

    it('should NOT log when ticket is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      await ticketService.updateTicketStatus('nonexistent', 'open' as any);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getAdminTickets
  // -------------------------------------------------------------------------

  describe('getAdminTickets', () => {
    it('should return tickets with user_email and message_count', async () => {
      const fakeTickets = [
        { ...makeFakeTicket(), user_email: 'a@example.com', message_count: 3 },
        { ...makeFakeTicket({ id: 'ticket-2' }), user_email: 'b@example.com', message_count: 1 },
      ];
      mockQueryOne.mockResolvedValueOnce({ count: '2' });
      mockQuery.mockResolvedValueOnce(fakeTickets);

      const result = await ticketService.getAdminTickets();

      expect(result.tickets).toEqual(fakeTickets);
      expect(result.total).toBe(2);
    });

    it('should filter by status when provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getAdminTickets({ status: 'open' as any });

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t.status = $'),
        expect.arrayContaining(['open'])
      );
    });

    it('should filter by appName when provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getAdminTickets({ appName: APP_NAME });

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t.app_name = $'),
        expect.arrayContaining([APP_NAME])
      );
    });

    it('should use default pagination (page 1, limit 20)', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: '0' });
      mockQuery.mockResolvedValueOnce([]);

      await ticketService.getAdminTickets();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([20, 0])
      );
    });

    it('should return total 0 when count query returns null', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce([]);

      const result = await ticketService.getAdminTickets();

      expect(result.total).toBe(0);
    });
  });
});
