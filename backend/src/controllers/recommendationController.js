const recommendation = require('../services/recommendation');
const logger = require('../utils/logger');

exports.getConfig = async (req, res) => {
  try {
    const config = await recommendation.configService.getConfig();
    return res.json({
      code: 0,
      data: config
    });
  } catch (error) {
    logger.error(`Get recommendation config error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { name = 'default', ...updates } = req.body;
    const config = await recommendation.configService.updateConfig(
      name,
      updates
    );
    return res.json({
      code: 0,
      data: config
    });
  } catch (error) {
    logger.error(`Update recommendation config error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.refreshConfig = async (req, res) => {
  try {
    await recommendation.refreshConfig();
    const config = await recommendation.configService.getConfig();
    return res.json({
      code: 0,
      data: {
        message: 'Configuration refreshed',
        config
      }
    });
  } catch (error) {
    logger.error(`Refresh recommendation config error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.triggerJob = async (req, res) => {
  try {
    const { jobName } = req.params;
    const result = await recommendation.scheduler.triggerJob(jobName);
    return res.json({
      code: 0,
      data: {
        message: `Job ${jobName} triggered`,
        result
      }
    });
  } catch (error) {
    logger.error(`Trigger job error: ${error.message}`);
    return res.status(400).json({ code: 1, message: error.message });
  }
};

exports.precomputeUserTags = async (req, res) => {
  try {
    const { userId } = req.params;
    const tags = await recommendation.tagPrecomputeService.precomputeUserTags(
      userId
    );
    return res.json({
      code: 0,
      data: {
        userId,
        topTags: tags
      }
    });
  } catch (error) {
    logger.error(`Precompute user tags error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.invalidateUserCache = async (req, res) => {
  try {
    const { userId } = req.params;
    await recommendation.invalidateUserCache(userId);
    return res.json({
      code: 0,
      data: {
        message: `Cache invalidated for user ${userId}`
      }
    });
  } catch (error) {
    logger.error(`Invalidate user cache error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createSnapshot = async (req, res) => {
  try {
    const { window } = req.params;
    const recConfig = await recommendation.configService.getConfig();

    let result;
    if (req.query.type === 'posts') {
      result = await recommendation.snapshotService.createHotPostsSnapshot(
        window,
        recConfig
      );
    } else if (req.query.type === 'tags') {
      result = await recommendation.snapshotService.createHotTagsSnapshot(
        window,
        recConfig
      );
    } else {
      result = await recommendation.snapshotService.createAllSnapshots();
    }

    return res.json({
      code: 0,
      data: result
    });
  } catch (error) {
    logger.error(`Create snapshot error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const config = await recommendation.configService.getConfig();
    return res.json({
      code: 0,
      data: {
        schedulerRunning: recommendation.scheduler.isRunning,
        precomputeEnabled: config.precompute.enabled,
        snapshotEnabled: config.snapshot.enabled,
        cacheEnabled: config.cache.enabled,
        snapshotWindows: config.snapshot.intervals,
        precomputeIntervalMinutes: config.precompute.intervalMinutes,
        cacheTTLMinutes: config.cache.ttlMinutes
      }
    });
  } catch (error) {
    logger.error(`Get recommendation status error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.cleanupCache = async (req, res) => {
  try {
    const [cacheCount, snapshotCount] = await Promise.all([
      recommendation.cacheService.cleanupExpiredCache(),
      recommendation.snapshotService.cleanupExpiredSnapshots()
    ]);

    return res.json({
      code: 0,
      data: {
        cacheEntriesRemoved: cacheCount,
        snapshotEntriesRemoved: snapshotCount
      }
    });
  } catch (error) {
    logger.error(`Cleanup cache error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
