import { WeeklyDigestService } from '../digest/weekly-digest.service.js';
import { logger } from '../../utils/logger.js';
import { FollowUpReminderService } from '../tracker/follow-up-reminder.service.js';
import { StalePipelineAlertService } from '../tracker/stale-pipeline-alert.service.js';
import { WeeklyFunnelReportService } from '../tracker/weekly-funnel-report.service.js';
import { MetricsPersistenceService } from '../monitoring/metrics-persistence.service.js';

const weeklyDigestService = new WeeklyDigestService();
const followUpReminderService = new FollowUpReminderService();
const stalePipelineAlertService = new StalePipelineAlertService();
const weeklyFunnelReportService = new WeeklyFunnelReportService();
const metricsPersistenceService = new MetricsPersistenceService();

export function startSchedulers(): NodeJS.Timeout[] {
  // 7 days
  const digestIntervalMs = 7 * 24 * 60 * 60 * 1000;
  const digestTimer = setInterval(() => {
    void (async () => {
      try {
        const [digestResult, funnelResult] = await Promise.all([
          weeklyDigestService.sendWeeklyDigest(),
          weeklyFunnelReportService.sendWeeklyReport(),
        ]);
        logger.info({ digestResult, funnelResult }, 'Weekly digest/report dispatch complete');
      } catch (error) {
        logger.error({ err: error }, 'Weekly digest/report dispatch failed');
      }
    })();
  }, digestIntervalMs);

  // Hourly scan for due follow-up reminders.
  const reminderIntervalMs = 60 * 60 * 1000;
  const reminderTimer = setInterval(() => {
    void (async () => {
      try {
        const result = await followUpReminderService.dispatchDueReminders();
        if (result.sent > 0 || result.failed > 0) {
          logger.info({ result }, 'Follow-up reminder dispatch complete');
        }
      } catch (error) {
        logger.error({ err: error }, 'Follow-up reminder dispatch failed');
      }
    })();
  }, reminderIntervalMs);

  // Every 6 hours: alert on stale "applied" pipeline.
  const staleAlertIntervalMs = 6 * 60 * 60 * 1000;
  const staleAlertTimer = setInterval(() => {
    void (async () => {
      try {
        const result = await stalePipelineAlertService.sendStalePipelineAlert();
        if (result.alerted) {
          logger.info({ result }, 'Stale pipeline alert sent');
        }
      } catch (error) {
        logger.error({ err: error }, 'Stale pipeline alert job failed');
      }
    })();
  }, staleAlertIntervalMs);

  // Every 10 minutes: flush in-process metrics to DB.
  const metricsIntervalMs = 10 * 60 * 1000;
  const metricsTimer = setInterval(() => {
    void (async () => {
      try {
        const result = await metricsPersistenceService.flushToDatabase();
        if (result.written > 0) {
          logger.info({ result }, 'Metric snapshots flushed');
        }
      } catch (error) {
        logger.error({ err: error }, 'Metric persistence job failed');
      }
    })();
  }, metricsIntervalMs);

  return [digestTimer, reminderTimer, staleAlertTimer, metricsTimer];
}

