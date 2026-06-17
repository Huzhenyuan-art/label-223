const recommendation = require('../services/recommendation');
const { asyncHandler, sendSuccess } = require('../utils/errors');

exports.getConfig = asyncHandler(async (req, res) => {
  const config = await recommendation.configService.getConfig();
  return sendSuccess(res, config);
});

exports.updateConfig = asyncHandler(async (req, res) => {
  const { name = 'default', ...updates } = req.body;
  const config = await recommendation.configService.updateConfig(name, updates);
  return sendSuccess(res, config);
});

exports.refreshConfig = asyncHandler(async (req, res) => {
  await recommendation.refreshConfig();
  const config = await recommendation.configService.getConfig();
  return sendSuccess(res, {
    message: 'Configuration refreshed',
    config
  });
});

exports.triggerJob = asyncHandler(async (req, res) => {
  const { jobName } = req.params;
  const result = await recommendation.scheduler.triggerJob(jobName);
  return sendSuccess(res, {
    message: `Job ${jobName} triggered`,
    result
  });
});

exports.precomputeUserTags = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tags = await recommendation.tagPrecomputeService.precomputeUserTags(userId);
  return sendSuccess(res, {
    userId,
    topTags: tags
  });
});

exports.invalidateUserCache = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await recommendation.invalidateUserCache(userId);
  return sendSuccess(res, {
    message: `Cache invalidated for user ${userId}`
  });
});

exports.createSnapshot = asyncHandler(async (req, res) => {
  const { window } = req.params;
  const recConfig = await recommendation.configService.getConfig();

  let result;
  if (req.query.type === 'posts') {
    result = await recommendation.snapshotService.createHotPostsSnapshot(window, recConfig);
  } else if (req.query.type === 'tags') {
    result = await recommendation.snapshotService.createHotTagsSnapshot(window, recConfig);
  } else {
    result = await recommendation.snapshotService.createAllSnapshots();
  }

  return sendSuccess(res, result);
});

exports.getStatus = asyncHandler(async (req, res) => {
  const config = await recommendation.configService.getConfig();
  return sendSuccess(res, {
    schedulerRunning: recommendation.scheduler.isRunning,
    precomputeEnabled: config.precompute.enabled,
    snapshotEnabled: config.snapshot.enabled,
    cacheEnabled: config.cache.enabled,
    snapshotWindows: config.snapshot.intervals,
    precomputeIntervalMinutes: config.precompute.intervalMinutes,
    cacheTTLMinutes: config.cache.ttlMinutes
  });
});

exports.cleanupCache = asyncHandler(async (req, res) => {
  const [cacheCount, snapshotCount] = await Promise.all([
    recommendation.cacheService.cleanupExpiredCache(),
    recommendation.snapshotService.cleanupExpiredSnapshots()
  ]);

  return sendSuccess(res, {
    cacheEntriesRemoved: cacheCount,
    snapshotEntriesRemoved: snapshotCount
  });
});
