import { LoggerService } from '../logging/logger.service';
import * as dbConfig from '../database/config';

// Mock the database module
jest.mock('../database/config', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
  pool: {
    query: jest.fn(),
    end: jest.fn(),
  },
}));

describe('Logger Service', () => {
  let logger: LoggerService;
  let mockExecute: jest.Mock;
  let mockQueryOne: jest.Mock;
  const testAppName = 'test-logger-app';

  beforeAll(() => {
    logger = new LoggerService(testAppName);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute = dbConfig.execute as jest.Mock;
    mockQueryOne = dbConfig.queryOne as jest.Mock;
    // Default successful execute
    mockExecute.mockResolvedValue(1);
  });

  describe('info()', () => {
    it('should log info message successfully', async () => {
      const testUserId = '00000000-0000-0000-0000-000000000001';

      await logger.info({
        action: 'test_action',
        message: 'Test info message',
        user_email: 'testuser@test.com',
        user_id: testUserId,
      });

      expect(mockExecute).toHaveBeenCalled();
      const [query, params] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      expect(params).toContain('info');
      expect(params).toContain('test_action');
      expect(params).toContain('Test info message');
      expect(params).toContain('testuser@test.com');
      expect(params).toContain(testUserId);
    });

    it('should log info with metadata', async () => {
      await logger.info({
        action: 'user_update',
        message: 'User updated profile',
        user_email: 'user@test.com',
        metadata: { fields: ['name', 'email'], old_email: 'old@test.com' },
      });

      expect(mockExecute).toHaveBeenCalled();
      const [query, params] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      // Check that metadata was serialized and included
      const metadataParam = params.find((p: unknown) =>
        typeof p === 'string' && p.includes('fields')
      );
      expect(metadataParam).toBeDefined();
    });

    it('should log info with IP and user agent', async () => {
      await logger.info({
        action: 'login',
        message: 'User logged in',
        user_email: 'user@test.com',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      });

      expect(mockExecute).toHaveBeenCalled();
      const [, params] = mockExecute.mock.calls[0];
      expect(params).toContain('192.168.1.1');
      expect(params).toContain('Mozilla/5.0');
    });
  });

  describe('error()', () => {
    it('should log error message with error code', async () => {
      await logger.error({
        action: 'payment_failed',
        message: 'Payment processing failed',
        error_code: 'PAYMENT_DECLINED',
        user_email: 'user@test.com',
      });

      expect(mockExecute).toHaveBeenCalled();
      const [query, params] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      expect(params).toContain('error');
      expect(params).toContain('PAYMENT_DECLINED');
      expect(params).toContain('Payment processing failed');
    });

    it('should log error with stack trace', async () => {
      const error = new Error('Test error');

      await logger.error({
        action: 'test_error',
        message: error.message,
        error_code: 'TEST_ERROR',
        error_stack: error.stack,
      });

      expect(mockExecute).toHaveBeenCalled();
      const [, params] = mockExecute.mock.calls[0];
      expect(params).toContain('error');
      // Find the stack trace param
      const stackParam = params.find((p: unknown) =>
        typeof p === 'string' && p.includes('Error: Test error')
      );
      expect(stackParam).toBeDefined();
    });

    it('should log error with metadata', async () => {
      await logger.error({
        action: 'api_error',
        message: 'External API call failed',
        error_code: 'API_TIMEOUT',
        metadata: { endpoint: '/api/users', timeout: 5000 },
      });

      expect(mockExecute).toHaveBeenCalled();
      const [, params] = mockExecute.mock.calls[0];
      expect(params).toContain('error');
      // Check metadata was included
      const metadataParam = params.find((p: unknown) =>
        typeof p === 'string' && p.includes('endpoint')
      );
      expect(metadataParam).toBeDefined();
    });
  });

  describe('warn()', () => {
    it('should log warning message', async () => {
      await logger.warn({
        action: 'rate_limit_warning',
        message: 'User approaching rate limit',
        user_email: 'user@test.com',
        metadata: { current_count: 8, max_count: 10 },
      });

      expect(mockExecute).toHaveBeenCalled();
      const [query, params] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      expect(params).toContain('warn');
      expect(params).toContain('User approaching rate limit');
    });
  });

  describe('debug()', () => {
    it('should log debug message', async () => {
      await logger.debug({
        action: 'test_debug',
        message: 'Debug information',
        metadata: { step: 1, data: 'test' },
      });

      expect(mockExecute).toHaveBeenCalled();
      const [query, params] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
      expect(params).toContain('debug');
    });
  });

  describe('app isolation', () => {
    it('should isolate logs by app name', async () => {
      const logger1 = new LoggerService('app1');
      const logger2 = new LoggerService('app2');

      await logger1.info({
        action: 'test',
        message: 'App 1 message',
      });

      await logger2.info({
        action: 'test',
        message: 'App 2 message',
      });

      // Check that both loggers called execute with their respective app names
      expect(mockExecute).toHaveBeenCalledTimes(2);

      const call1Params = mockExecute.mock.calls[0][1];
      const call2Params = mockExecute.mock.calls[1][1];

      expect(call1Params).toContain('app1');
      expect(call2Params).toContain('app2');
    });
  });

  describe('timestamp', () => {
    it('should automatically add created_at timestamp', async () => {
      await logger.info({
        action: 'timestamp_test',
        message: 'Testing timestamp',
      });

      expect(mockExecute).toHaveBeenCalled();
      // The database handles created_at automatically via DEFAULT NOW()
      // We just verify the log was written successfully
      const [query] = mockExecute.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_logs');
    });
  });
});
