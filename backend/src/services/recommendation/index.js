const config = require('../../config');
const logger = require('../../utils/logger');
const { Post } = require('../../models');
const configService = require('./configService');
const tagPrecomputeService = require('./tagPrecomputeService');
const snapshotService = require('./snapshotService');
const rankingService = require('./rankingService');
const cacheService = require('./cacheService');
const scheduler = require('./scheduler');

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeTags = (tags) => {
  if (!tags) {
    return [];
  }

  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  const normalized = list
    .map((tag) => String(tag).trim().replace(/^[#＃]/, '').toLowerCase())
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, config.maxTagsPerPost);
};

const getOceanFlow = async (options) => {
  const {
    page = 1,
    limit = 20,
    mode = 'recommend',
    tags: rawTags,
    keyword: rawKeyword,
    userId
  } = options;

  const tags = sanitizeTags(rawTags);
  const keyword = (rawKeyword || '').trim();

  const recConfig = await configService.getConfig();

  if (config.recommendation.enabled && recConfig.cache.enabled) {
    const cached = await cacheService.getCachedRecommendation({
      mode,
      userId,
      tags,
      keyword,
      page,
      limit
    });

    if (cached) {
      logger.debug(`[Recommendation] Cache hit for mode=${mode}, page=${page}`);
      return {
        ...cached,
        fromCache: true
      };
    }
  }

  logger.debug(
    `[Recommendation] Computing fresh recommendation: mode=${mode}, page=${page}`
  );

  const filter = { status: 'published' };
  if (tags.length > 0) {
    filter.tags = { $in: tags };
  }
  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), 'i');
    filter.$or = [
      { title: regex },
      { contentText: regex },
      { dynamicTag: regex }
    ];
  }

  const preferredTags = userId
    ? await tagPrecomputeService.getUserTopTags(userId)
    : [];

  let rankedPosts;
  let total;

  if (mode === 'hot' && recConfig.snapshot.enabled) {
    const snapshotResult = await snapshotService.getHotPosts(
      '24h',
      page,
      limit
    );
    rankedPosts = snapshotResult.list;
    total = snapshotResult.pagination.total;
  } else {
    const maxItems = recConfig.cache.maxItemsPerPage;
    const basePosts = await Post.find(filter)
      .populate('author', 'nickname avatar')
      .sort({ createdAt: -1 })
      .limit(maxItems)
      .lean();

    const ranked = await rankingService.rankPostsWithConfig(
      basePosts,
      mode,
      preferredTags
    );

    total = ranked.length;

    const start = (page - 1) * limit;
    const paged = ranked.slice(start, start + limit);
    rankedPosts = paged;
  }

  const enriched = await cacheService.attachInteractionState(
    rankedPosts,
    userId
  );

  const pages = Math.ceil(total / limit);

  if (config.recommendation.enabled && recConfig.cache.enabled) {
    await cacheService.cacheRecommendation({
      mode,
      userId,
      tags,
      keyword,
      page,
      limit,
      items: rankedPosts,
      preferredTags,
      total,
      pages
    });

    if (userId) {
      await cacheService.cleanupOldUserCache(
        userId,
        recConfig.cache.maxCachedPages
      );
    }
  }

  return {
    mode,
    preferredTags,
    list: enriched,
    pagination: {
      page,
      limit,
      total,
      pages
    },
    fromCache: false
  };
};

const getHotTags = async (preferredWindow = '1h') => {
  return await snapshotService.getHotTags(preferredWindow);
};

const searchDeepSea = async (options) => {
  const {
    page = 1,
    limit = 20,
    keyword: rawKeyword,
    tags: rawTags,
    userId
  } = options;

  const tags = sanitizeTags(rawTags);
  const keyword = (rawKeyword || '').trim();

  const filter = { status: 'published' };

  if (tags.length > 0) {
    filter.tags = { $all: tags };
  }

  if (keyword) {
    const regex = new RegExp(escapeRegex(keyword), 'i');
    filter.$or = [
      { title: regex },
      { contentText: regex },
      { dynamicTag: regex }
    ];
  }

  const [list, total] = await Promise.all([
    Post.find(filter)
      .populate('author', 'nickname avatar')
      .sort({ resonanceCount: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Post.countDocuments(filter)
  ]);

  const enriched = await cacheService.attachInteractionState(list, userId);

  return {
    list: enriched,
    query: {
      keyword,
      tags
    },
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

const initialize = async () => {
  try {
    await configService.loadActiveConfig();
    logger.info('[Recommendation] Configuration loaded');

    if (config.recommendation.scheduler.enabled) {
      scheduler.start();
    }

    logger.info('[Recommendation] Service initialized successfully');
    return true;
  } catch (error) {
    logger.error(`[Recommendation] Initialization failed: ${error.message}`);
    return false;
  }
};

const shutdown = () => {
  scheduler.stop();
  logger.info('[Recommendation] Service shutdown complete');
};

const invalidateUserCache = async (userId) => {
  await Promise.all([
    cacheService.invalidateUserCache(userId),
    tagPrecomputeService.invalidateUserTags(userId)
  ]);
  logger.info(`[Recommendation] Invalidated all user data for: ${userId}`);
};

const refreshConfig = async () => {
  configService.invalidateCache();
  await configService.loadActiveConfig();
  logger.info('[Recommendation] Configuration refreshed');
};

module.exports = {
  getOceanFlow,
  getHotTags,
  searchDeepSea,
  initialize,
  shutdown,
  invalidateUserCache,
  refreshConfig,
  configService,
  tagPrecomputeService,
  snapshotService,
  rankingService,
  cacheService,
  scheduler
};
