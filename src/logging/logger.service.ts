import { execute } from '../database/config.js';
import type { LogEntry, LogLevel } from '../types/index.js';

export class LoggerService {
  private appName: string;

  constructor(appName: string) {
    this.appName = appName;
  }

  private async log(entry: Omit<LogEntry, 'app_name'>): Promise<void> {
    try {
      await execute(
        `INSERT INTO audit_logs
         (app_name, log_level, action, message, user_email, user_id, ip_address, user_agent, error_code, error_stack, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          this.appName,
          entry.log_level,
          entry.action || null,
          entry.message,
          entry.user_email || null,
          entry.user_id || null,
          entry.ip_address || null,
          entry.user_agent || null,
          entry.error_code || null,
          entry.error_stack || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
        ]
      );
    } catch (error) {
      // In test environment, throw the error so tests can catch it
      if (process.env.NODE_ENV === 'test') {
        throw error;
      }
      // Fallback to console if database logging fails in production
      console.error('Failed to write to audit log:', error);
      console.log('Log entry:', entry);
    }
  }

  async info(params: {
    action: string;
    message: string;
    user_email?: string;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      log_level: 'info',
      action: params.action,
      message: params.message,
      user_email: params.user_email,
      user_id: params.user_id,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      metadata: params.metadata,
    });
  }

  async error(params: {
    action: string;
    message: string;
    error_code?: string;
    error_stack?: string;
    user_email?: string;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      log_level: 'error',
      action: params.action,
      message: params.message,
      error_code: params.error_code,
      error_stack: params.error_stack,
      user_email: params.user_email,
      user_id: params.user_id,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      metadata: params.metadata,
    });
  }

  async warn(params: {
    action: string;
    message: string;
    user_email?: string;
    user_id?: string;
    ip_address?: string;
    user_agent?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      log_level: 'warn',
      action: params.action,
      message: params.message,
      user_email: params.user_email,
      user_id: params.user_id,
      ip_address: params.ip_address,
      user_agent: params.user_agent,
      metadata: params.metadata,
    });
  }

  async debug(params: {
    action: string;
    message: string;
    user_email?: string;
    user_id?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.log({
      log_level: 'debug',
      action: params.action,
      message: params.message,
      user_email: params.user_email,
      user_id: params.user_id,
      metadata: params.metadata,
    });
  }
}
