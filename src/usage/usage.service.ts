import { queryOne, execute } from '../database/config.js';
import { LoggerService } from '../logging/logger.service.js';
import type { UsageTracking } from '../types/index.js';

export class UsageService {
  private logger: LoggerService;
  private appName: string;

  constructor(appName: string, logger: LoggerService) {
    this.appName = appName;
    this.logger = logger;
  }

  /**
   * Get the current month's usage for a user
   */
  async getCurrentUsage(userId: string): Promise<UsageTracking | null> {
    const currentMonth = this.getCurrentMonthYear();

    return queryOne<UsageTracking>(
      'SELECT * FROM usage_tracking WHERE user_id = $1 AND month_year = $2',
      [userId, currentMonth]
    );
  }

  /**
   * Get or create usage record for current month
   */
  async getOrCreateCurrentUsage(userId: string): Promise<UsageTracking> {
    const currentMonth = this.getCurrentMonthYear();

    // Try to get existing record
    const existing = await this.getCurrentUsage(userId);
    if (existing) {
      return existing;
    }

    // Create new record for this month
    const newUsage = await queryOne<UsageTracking>(
      `INSERT INTO usage_tracking (user_id, month_year, api_requests, sms_alerts_sent)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [userId, currentMonth]
    );

    return newUsage!;
  }

  /**
   * Increment API request count for current month
   */
  async incrementApiRequests(userId: string, count: number = 1): Promise<number> {
    const currentMonth = this.getCurrentMonthYear();

    const result = await queryOne<{ api_requests: number }>(
      `INSERT INTO usage_tracking (user_id, month_year, api_requests, sms_alerts_sent)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         api_requests = usage_tracking.api_requests + $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING api_requests`,
      [userId, currentMonth, count]
    );

    return result?.api_requests || 0;
  }

  /**
   * Increment SMS alerts sent count for current month
   */
  async incrementSmsAlerts(userId: string, count: number = 1): Promise<number> {
    const currentMonth = this.getCurrentMonthYear();

    const result = await queryOne<{ sms_alerts_sent: number }>(
      `INSERT INTO usage_tracking (user_id, month_year, api_requests, sms_alerts_sent)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (user_id, month_year) DO UPDATE SET
         sms_alerts_sent = usage_tracking.sms_alerts_sent + $3,
         updated_at = CURRENT_TIMESTAMP
       RETURNING sms_alerts_sent`,
      [userId, currentMonth, count]
    );

    await this.logger.info({
      action: 'sms_alert_sent',
      message: `SMS alert sent (${result?.sms_alerts_sent || 1} this month)`,
      user_id: userId,
      metadata: { month: currentMonth, total_sent: result?.sms_alerts_sent },
    });

    return result?.sms_alerts_sent || 0;
  }

  /**
   * Get API request count for current month
   */
  async getApiRequestCount(userId: string): Promise<number> {
    const usage = await this.getCurrentUsage(userId);
    return usage?.api_requests || 0;
  }

  /**
   * Get SMS alerts sent count for current month
   */
  async getSmsAlertCount(userId: string): Promise<number> {
    const usage = await this.getCurrentUsage(userId);
    return usage?.sms_alerts_sent || 0;
  }

  /**
   * Get usage history for a user (last N months)
   */
  async getUsageHistory(userId: string, months: number = 6): Promise<UsageTracking[]> {
    const startMonth = this.getMonthYearOffset(-months);

    const history = await queryOne<UsageTracking[]>(
      `SELECT * FROM usage_tracking
       WHERE user_id = $1 AND month_year >= $2
       ORDER BY month_year DESC`,
      [userId, startMonth]
    );

    return history || [];
  }

  /**
   * Reset usage for a specific month (admin function)
   */
  async resetUsage(userId: string, monthYear?: string): Promise<boolean> {
    const targetMonth = monthYear || this.getCurrentMonthYear();

    const result = await execute(
      `UPDATE usage_tracking
       SET api_requests = 0, sms_alerts_sent = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND month_year = $2`,
      [userId, targetMonth]
    );

    if (result > 0) {
      await this.logger.info({
        action: 'usage_reset',
        message: `Usage reset for month ${targetMonth}`,
        user_id: userId,
      });
    }

    return result > 0;
  }

  /**
   * Delete old usage records (cleanup function)
   */
  async cleanupOldUsage(monthsToKeep: number = 12): Promise<number> {
    const cutoffMonth = this.getMonthYearOffset(-monthsToKeep);

    const result = await execute(
      'DELETE FROM usage_tracking WHERE month_year < $1',
      [cutoffMonth]
    );

    if (result > 0) {
      await this.logger.info({
        action: 'usage_cleanup',
        message: `Deleted ${result} old usage records (before ${cutoffMonth})`,
      });
    }

    return result;
  }

  private getCurrentMonthYear(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonthYearOffset(monthsOffset: number): string {
    const now = new Date();
    now.setMonth(now.getMonth() + monthsOffset);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
