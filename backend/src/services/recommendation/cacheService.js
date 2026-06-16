const crypto = require('crypto');
const { RecommendationCache, Post, Resonance, User } = require('../../models');
const configService = require('./configService');
const logger = require('../../utils/logger');

const generateCacheKey = (mode, userId, tags, keyword, page, limit) => {
  const parts = [
    mode,
    userId || 'anon',
    Array.isArray(tags) ? tags.sort().join(',') : '',
    keyword || '',
    String(page),
    String(limit)
  ];

  return crypto
    .createHash('md5')
    .update(parts.join('|'))
    .digest('hex');
};

const attachInteractionState = async (posts, userId) => {
  if (!userId || !posts.length) {
    return posts.map((post) => ({
      ...post,
      isResonated: false,
      isFavorited: false
    }));
  }

  const ids = posts.map((item) => item._id);

  const [resonances, user] = await Promise.all([
    Resonance.find({ user: userId, post: { $in: ids } })
      .select('post')
      .lean(),
    User.findById(userId).select('favoritePosts').lean()
  ]);

  const resonanceSet = new Set(
    resonances.map((item) => item.post.toString())
  );
  const favoriteSet = new Set(
    (user?.favoritePosts || []).map((item) => item.toString())
  );

  return posts.map((post) => ({
    ...post,
    isResonated: resonanceSet.has(post._id.toString()),
    isFavorited: favoriteSet.has(post._id.toString())
  }));
};

const cacheRecommendation = async (options) => {
  try {
    const recConfig = await configService.getConfig();

    if (!recConfig.cache.enabled) {
      logger.debug('[Cache] Cache disabled, skipping');
      return null;
    }

    const {
      mode,
      userId,
      tags,
      keyword,
      page,
      limit,
      items,
      itemScores,
      preferredTags,
      total,
      pages
    } = options;

    const cacheKey = generateCacheKey(mode, userId, tags, keyword, page, limit);

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + recConfig.cache.ttlMinutes * 60000
    );

    const itemIds = items.map((item) =>
      typeof item === 'object' && item._id ? item._id : item
    );

    const scores =
      itemScores ||
      items.map((item, index) => ({
        postId: typeof item === 'object' && item._id ? item._id : item,
        score: typeof item === 'object' && item.score ? item.score : 0
      }));

    await RecommendationCache.findOneAndUpdate(
      { cacheKey },
      {
        mode,
        user: userId || null,
        tags: tags || [],
        keyword: keyword || '',
        page,
        limit,
        total,
        pages,
        items: itemIds,
        itemScores: scores,
        preferredTags: preferredTags || [],
        createdAt: now,
        expiresAt
      },
      { upsert: true, new: true }
    );

    logger.debug(
      `[Cache] Cached recommendation: mode=${mode}, page=${page}, items=${itemIds.length}`
    );

    return cacheKey;
  } catch (error) {
    logger.error(`[Cache] Cache error: ${error.message}`);
    return null;
  }
};

const getCachedRecommendation = async (options) => {
  try {
    const recConfig = await configService.getConfig();

    if (!recConfig.cache.enabled) {
      logger.debug('[Cache] Cache disabled');
      return null;
    }

    const { mode, userId, tags, keyword, page, limit } = options;
    const cacheKey = generateCacheKey(mode, userId, tags, keyword, page, limit);

    const cached = await RecommendationCache.findOne({
      cacheKey,
      expiresAt: { $gt: new Date() }
    }).lean();

    if (!cached) {
      logger.debug(`[Cache] Miss for key: ${cacheKey}`);
      return null;
    }

    logger.debug(`[Cache] Hit for key: ${cacheKey}`);

    const posts = await Post.find({ _id: { $in: cached.items } })
      .populate('author', 'nickname avatar')
      .lean();

    const postMap = new Map(
      posts.map((post) => [post._id.toString(), post])
    );

    const orderedPosts = cached.items
      .map((id) => postMap.get(id.toString()))
      .filter(Boolean);

    const enriched = await attachInteractionState(
      orderedPosts,
      userId
    );

    return {
      mode: cached.mode,
      preferredTags: cached.preferredTags,
      list: enriched,
      itemScores: cached.itemScores,
      pagination: {
        page: cached.page,
        limit: cached.limit,
        total: cached.total,
        pages: cached.pages
      }
    };
  } catch (error) {
    logger.error(`[Cache] Get error: ${error.message}`);
    return null;
  }
};

const invalidateUserCache = async (userId) => {
  try {
    const result = await RecommendationCache.deleteMany({ user: userId });
    logger.debug(
      `[Cache] Invalidated ${result.deletedCount} cache entries for user: ${userId}`
    );
    return result.deletedCount;
  } catch (error) {
    logger.error(`[Cache] Invalidate user error: ${error.message}`);
    return 0;
  }
};

const invalidateModeCache = async (mode) => {
  try {
    const result = await RecommendationCache.deleteMany({ mode });
    logger.debug(
      `[Cache] Invalidated ${result.deletedCount} cache entries for mode: ${mode}`
    );
    return result.deletedCount;
  } catch (error) {
    logger.error(`[Cache] Invalidate mode error: ${error.message}`);
    return 0;
  }
};

const cleanupExpiredCache = async () => {
  try {
    const result = await RecommendationCache.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    logger.info(
      `[Cache] Cleaned up ${result.deletedCount} expired cache entries`
    );
    return result.deletedCount;
  } catch (error) {
    logger.error(`[Cache] Cleanup error: ${error.message}`);
    return 0;
  }
};

const cleanupOldUserCache = async (userId, maxPages) => {
  try {
    const oldEntries = await RecommendationCache.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(maxPages)
      .select('_id')
      .lean();

    if (oldEntries.length > 0) {
      const ids = oldEntries.map((e) => e._id);
      await RecommendationCache.deleteMany({ _id: { $in: ids } });
      logger.debug(
        `[Cache] Cleaned up ${oldEntries.length} old cache entries for user: ${userId}`
      );
    }

    return oldEntries.length;
  } catch (error) {
    logger.error(`[Cache] Cleanup old error: ${error.message}`);
    return 0;
  }
};

module.exports = {
  generateCacheKey,
  cacheRecommendation,
  getCachedRecommendation,
  invalidateUserCache,
  invalidateModeCache,
  cleanupExpiredCache,
  cleanupOldUserCache,
  attachInteractionState
};
