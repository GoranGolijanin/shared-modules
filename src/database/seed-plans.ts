import { pool, execute, queryOne } from './config.js';

interface PlanConfig {
  name: string;
  max_domains: number;
  max_team_members: number;
  check_interval_hours: number;
  api_requests_per_month: number | null;
  sms_alerts_per_month: number | null;
  email_alerts: boolean;
  slack_alerts: boolean;
}

/**
 * Subscription Plan Configurations
 *
 * Starter ($19/month, $15/year):
 * - 10 domains
 * - Email alerts only
 * - 1 team member (just the owner)
 * - 12-hour check interval
 * - No API access, No SMS, No Slack
 *
 * Professional ($59/month, $47/year):
 * - 40 domains
 * - Email, SMS (100/mo), and Slack alerts
 * - 5 team members
 * - 1-hour check interval (implied as faster)
 * - 5,000 API requests/month
 *
 * Enterprise ($149/month, custom):
 * - Unlimited domains (represented as 999999)
 * - All alert types, unlimited SMS
 * - Unlimited team members (represented as 999999)
 * - Custom check interval (1 hour default)
 * - Unlimited API requests
 */
const plans: PlanConfig[] = [
  {
    name: 'starter',
    max_domains: 10,
    max_team_members: 1,
    check_interval_hours: 12,
    api_requests_per_month: null, // No API access for starter
    sms_alerts_per_month: 0, // No SMS for starter
    email_alerts: true,
    slack_alerts: false,
  },
  {
    name: 'professional',
    max_domains: 40,
    max_team_members: 5,
    check_interval_hours: 1,
    api_requests_per_month: 5000,
    sms_alerts_per_month: 100,
    email_alerts: true,
    slack_alerts: true,
  },
  {
    name: 'enterprise',
    max_domains: 999999, // Effectively unlimited
    max_team_members: 999999, // Effectively unlimited
    check_interval_hours: 1,
    api_requests_per_month: null, // Unlimited
    sms_alerts_per_month: null, // Unlimited
    email_alerts: true,
    slack_alerts: true,
  },
];

async function seedPlans() {
  console.log('Seeding subscription plans...');

  try {
    for (const plan of plans) {
      // Check if plan already exists
      const existing = await queryOne<{ id: string }>(
        'SELECT id FROM subscription_plans WHERE name = $1',
        [plan.name]
      );

      if (existing) {
        // Update existing plan
        await execute(
          `UPDATE subscription_plans SET
            max_domains = $2,
            max_team_members = $3,
            check_interval_hours = $4,
            api_requests_per_month = $5,
            sms_alerts_per_month = $6,
            email_alerts = $7,
            slack_alerts = $8
          WHERE name = $1`,
          [
            plan.name,
            plan.max_domains,
            plan.max_team_members,
            plan.check_interval_hours,
            plan.api_requests_per_month,
            plan.sms_alerts_per_month,
            plan.email_alerts,
            plan.slack_alerts,
          ]
        );
        console.log(`  Updated plan: ${plan.name}`);
      } else {
        // Insert new plan
        await execute(
          `INSERT INTO subscription_plans
            (name, max_domains, max_team_members, check_interval_hours,
             api_requests_per_month, sms_alerts_per_month, email_alerts, slack_alerts)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            plan.name,
            plan.max_domains,
            plan.max_team_members,
            plan.check_interval_hours,
            plan.api_requests_per_month,
            plan.sms_alerts_per_month,
            plan.email_alerts,
            plan.slack_alerts,
          ]
        );
        console.log(`  Created plan: ${plan.name}`);
      }
    }

    console.log('\nSubscription plans seeded successfully!');
    console.log('\nPlan Summary:');
    console.log('─'.repeat(70));
    console.log(
      'Name'.padEnd(15) +
      'Domains'.padEnd(10) +
      'Team'.padEnd(8) +
      'Interval'.padEnd(10) +
      'API/mo'.padEnd(12) +
      'SMS/mo'.padEnd(10) +
      'Slack'
    );
    console.log('─'.repeat(70));

    for (const plan of plans) {
      console.log(
        plan.name.padEnd(15) +
        String(plan.max_domains === 999999 ? '∞' : plan.max_domains).padEnd(10) +
        String(plan.max_team_members === 999999 ? '∞' : plan.max_team_members).padEnd(8) +
        `${plan.check_interval_hours}h`.padEnd(10) +
        (plan.api_requests_per_month === null ? '∞' : String(plan.api_requests_per_month)).padEnd(12) +
        (plan.sms_alerts_per_month === null ? '∞' : String(plan.sms_alerts_per_month)).padEnd(10) +
        (plan.slack_alerts ? '✓' : '✗')
      );
    }
    console.log('─'.repeat(70));
  } catch (error) {
    console.error('Failed to seed plans:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
seedPlans();
