const config = require('../../config');
const logger = require('../../utils/logger');
const tagPrecomputeService = require('./tagPrecomputeService');
const snapshotService = require('./snapshotService');
const cacheService = require('./cacheService');

const parseCronToMs = (cronExpression) => {
  const parts = cronExpression.split(' ');
  if (parts.length < 5) return 30 * 60 * 1000;

  const minute = parts[0];
  const hour = parts[1];

  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10);
    return interval * 60 * 1000;
  }

  if (minute === '*' && hour === '*') {
    return 60 * 60 * 1000;
  }

  return 30 * 60 * 1000;
};

class RecommendationScheduler {
  constructor() {
    this.timers = new Map();
    this.isRunning = false;
  }

  start() {
    if (!config.recommendation.scheduler.enabled) {
      logger.info('[Scheduler] Recommendation scheduler disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('[Scheduler] Already running');
      return;
    }

    this.isRunning = true;
    logger.info('[Scheduler] Starting recommendation scheduler');

    this.scheduleJob(
      'tagPrecompute',
      config.recommendation.scheduler.tagPrecomputeCron,
      async () => {
        logger.info('[Scheduler] Running tag precompute job');
        try {
          await tagPrecomputeService.precomputeBatch();
        } catch (error) {
          logger.error(`[Scheduler] Tag precompute failed: ${error.message}`);
        }
      }
    );

    this.scheduleJob(
      'hotSnapshot',
      config.recommendation.scheduler.hotSnapshotCron,
      async () => {
        logger.info('[Scheduler] Running hot snapshot job');
        try {
          await snapshotService.createAllSnapshots();
        } catch (error) {
          logger.error(`[Scheduler] Hot snapshot failed: ${error.message}`);
        }
      }
    );

    this.scheduleJob(
      'cacheCleanup',
      config.recommendation.scheduler.cacheCleanupCron,
      async () => {
        logger.info('[Scheduler] Running cache cleanup job');
        try {
          await Promise.all([
            cacheService.cleanupExpiredCache(),
            snapshotService.cleanupExpiredSnapshots()
          ]);
        } catch (error) {
          logger.error(`[Scheduler] Cache cleanup failed: ${error.message}`);
        }
      }
    );

    logger.info('[Scheduler] Recommendation scheduler started');
  }

  scheduleJob(name, cronExpression, jobFn) {
    const intervalMs = parseCronToMs(cronExpression);

    const runJob = async () => {
      try {
        await jobFn();
      } catch (error) {
        logger.error(`[Scheduler] Job ${name} error: ${error.message}`);
      }
    };

    setTimeout(runJob, 5000);

    const timer = setInterval(runJob, intervalMs);
    this.timers.set(name, timer);

    logger.info(
      `[Scheduler] Scheduled job ${name} with interval ${intervalMs / 1000 / 60} minutes`
    );
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('[Scheduler] Stopping recommendation scheduler');

    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      logger.debug(`[Scheduler] Stopped job: ${name}`);
    }

    this.timers.clear();
    this.isRunning = false;

    logger.info('[Scheduler] Recommendation scheduler stopped');
  }

  triggerJob(name) {
    const jobs = {
      tagPrecompute: () => tagPrecomputeService.precomputeBatch(),
      hotSnapshot: () => snapshotService.createAllSnapshots(),
      cacheCleanup: () =>
        Promise.all([
          cacheService.cleanupExpiredCache(),
          snapshotService.cleanupExpiredSnapshots()
        ])
    };

    const job = jobs[name];
    if (job) {
      logger.info(`[Scheduler] Manually triggering job: ${name}`);
      return job();
    }

    throw new Error(`Unknown job: ${name}`);
  }
}

const scheduler = new RecommendationScheduler();

module.exports = scheduler;
