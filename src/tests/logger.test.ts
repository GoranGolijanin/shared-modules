import { LoggerService } from '../logging/logger.service';
import { queryOne, execute } from '../database/config';
import { closeDatabase } from './test-utils';
import type { AuditLog } from '../types/index';

describe('Logger Service', () => {
  let logger: LoggerService;
  const testAppName = 'test-logger-app';

  beforeAll(() => {
    logger = new LoggerService(testAppName);
  });

  afterAll(async () => {
    // Cleanup test logs
    await execute("DELETE FROM audit_logs WHERE app_name = $1", [testAppName]);
    await closeDatabase();
  });

  afterEach(async () => {
    // Clean up after each test
    await execute("DELETE FROM audit_logs WHERE app_name = $1", [testAppName]);
  });

  describe('info()', () => {
    it('should log info message successfully', async () => {
      await logger.info({
        action: 'test_action',
        message: 'Test info message',
        user_email: 'testuser@test.com',
        user_id: 'test-user-id-123',
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2 ORDER BY created_at DESC LIMIT 1',
        [testAppName, 'test_action']
      );

      expect(log).toBeDefined();
      expect(log?.log_level).toBe('info');
      expect(log?.action).toBe('test_action');
      expect(log?.message).toBe('Test info message');
      expect(log?.user_email).toBe('testuser@test.com');
      expect(log?.user_id).toBe('test-user-id-123');
    });

    it('should log info with metadata', async () => {
      await logger.info({
        action: 'user_update',
        message: 'User updated profile',
        user_email: 'user@test.com',
        metadata: { fields: ['name', 'email'], old_email: 'old@test.com' },
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'user_update']
      );

      expect(log).toBeDefined();
      expect(log?.metadata).toBeDefined();
      expect(log?.metadata).toEqual({ fields: ['name', 'email'], old_email: 'old@test.com' });
    });

    it('should log info with IP and user agent', async () => {
      await logger.info({
        action: 'login',
        message: 'User logged in',
        user_email: 'user@test.com',
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'login']
      );

      expect(log).toBeDefined();
      expect(log?.ip_address).toBe('192.168.1.1');
      expect(log?.user_agent).toBe('Mozilla/5.0');
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

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'payment_failed']
      );

      expect(log).toBeDefined();
      expect(log?.log_level).toBe('error');
      expect(log?.error_code).toBe('PAYMENT_DECLINED');
      expect(log?.message).toBe('Payment processing failed');
    });

    it('should log error with stack trace', async () => {
      const error = new Error('Test error');

      await logger.error({
        action: 'test_error',
        message: error.message,
        error_code: 'TEST_ERROR',
        error_stack: error.stack,
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'test_error']
      );

      expect(log).toBeDefined();
      expect(log?.error_stack).toBeDefined();
      expect(log?.error_stack).toContain('Error: Test error');
    });

    it('should log error with metadata', async () => {
      await logger.error({
        action: 'api_error',
        message: 'External API call failed',
        error_code: 'API_TIMEOUT',
        metadata: { endpoint: '/api/users', timeout: 5000 },
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'api_error']
      );

      expect(log).toBeDefined();
      expect(log?.metadata).toEqual({ endpoint: '/api/users', timeout: 5000 });
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

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'rate_limit_warning']
      );

      expect(log).toBeDefined();
      expect(log?.log_level).toBe('warn');
      expect(log?.message).toBe('User approaching rate limit');
    });
  });

  describe('debug()', () => {
    it('should log debug message', async () => {
      await logger.debug({
        action: 'test_debug',
        message: 'Debug information',
        metadata: { step: 1, data: 'test' },
      });

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'test_debug']
      );

      expect(log).toBeDefined();
      expect(log?.log_level).toBe('debug');
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

      const app1Logs = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1',
        ['app1']
      );

      const app2Logs = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1',
        ['app2']
      );

      expect(app1Logs).toBeDefined();
      expect(app1Logs?.message).toBe('App 1 message');

      expect(app2Logs).toBeDefined();
      expect(app2Logs?.message).toBe('App 2 message');

      // Cleanup
      await execute("DELETE FROM audit_logs WHERE app_name IN ('app1', 'app2')");
    });
  });

  describe('timestamp', () => {
    it('should automatically add created_at timestamp', async () => {
      const before = new Date();

      await logger.info({
        action: 'timestamp_test',
        message: 'Testing timestamp',
      });

      const after = new Date();

      const log = await queryOne<AuditLog>(
        'SELECT * FROM audit_logs WHERE app_name = $1 AND action = $2',
        [testAppName, 'timestamp_test']
      );

      expect(log).toBeDefined();
      expect(log?.created_at).toBeDefined();

      const logTime = new Date(log!.created_at);
      expect(logTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(logTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
