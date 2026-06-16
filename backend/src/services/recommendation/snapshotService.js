const mongoose = require('mongoose');
const { HotListSnapshot, Post } = require('../../models');
const configService = require('./configService');
const logger = require('../../utils/logger');

const WINDOW_HOURS = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '7d': 168
};

const buildHotPostsPipeline = (startAt, maxItems, hotConfig, rankingConfig) => {
  const { heatBase, superEchoHeatMultiplier } = hotConfig;

  return [
    { $match: { createdAt: { $gte: startAt }, status: 'published' } },
    {
      $addFields: {
        ageHours: {
          $divide: [
            { $subtract: [new Date(), '$createdAt'] },
            3600000
          ]
        }
      }
    },
    {
      $addFields: {
        ageHours: { $max: ['$ageHours', 1] },
        heat: {
          $add: [
            heatBase,
            '$resonanceCount',
            '$commentCount',
            { $multiply: ['$superEchoCount', superEchoHeatMultiplier] }
          ]
        }
      }
    },
    {
      $addFields: {
        score: {
          $divide: ['$heat', { $pow: ['$ageHours', rankingConfig.hotDecayFactor] }]
        }
      }
    },
    { $sort: { score: -1, createdAt: -1 } },
    { $limit: maxItems }
  ];
};

const buildHotTagsPipeline = (startAt, maxTags, hotConfig) => {
  const { heatBase, superEchoHeatMultiplier } = hotConfig;

  return [
    { $match: { createdAt: { $gte: startAt }, status: 'published' } },
    {
      $project: {
        tags: 1,
        heat: {
          $add: [
            heatBase,
            '$resonanceCount',
            '$commentCount',
            { $multiply: ['$superEchoCount', superEchoHeatMultiplier] }
          ]
        }
      }
    },
    { $unwind: '$tags' },
    {
      $group: {
        _id: '$tags',
        postCount: { $sum: 1 },
        heat: { $sum: '$heat' }
      }
    },
    { $sort: { heat: -1, postCount: -1 } },
    { $limit: maxTags }
  ];
};

const createHotPostsSnapshot = async (window, recConfig) => {
  try {
    const hours = WINDOW_HOURS[window];
    const startAt = new Date(Date.now() - hours * 3600000);
    const maxItems = recConfig.snapshot.maxItems;

    const pipeline = buildHotPostsPipeline(
      startAt,
      maxItems,
      recConfig.hotTags,
      recConfig.ranking
    );

    const hotPosts = await Post.aggregate(pipeline);

    if (hotPosts.length === 0) {
      logger.debug(`[Snapshot] No hot posts for window ${window}`);
      return null;
    }

    const items = hotPosts.map((post, index) => ({
      rank: index + 1,
      itemId: post._id,
      itemRef: 'Post',
      score: post.score,
      heat: post.heat
    }));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + recConfig.snapshot.ttlMinutes * 60000);

    const snapshot = await HotListSnapshot.create({
      type: 'posts',
      window,
      items,
      snapshotAt: now,
      expiresAt,
      totalItems: items.length
    });

    logger.info(`[Snapshot] Created hot posts snapshot: window=${window}, items=${items.length}`);
    return snapshot;
  } catch (error) {
    logger.error(`[Snapshot] Hot posts snapshot error (window=${window}): ${error.message}`);
    throw error;
  }
};

const createHotTagsSnapshot = async (window, recConfig) => {
  try {
    const hours = WINDOW_HOURS[window];
    const startAt = new Date(Date.now() - hours * 3600000);
    const maxTags = recConfig.hotTags.maxTags;

    const pipeline = buildHotTagsPipeline(startAt, maxTags, recConfig.hotTags);
    const hotTags = await Post.aggregate(pipeline);

    if (hotTags.length === 0) {
      logger.debug(`[Snapshot] No hot tags for window ${window}`);
      return null;
    }

    const items = hotTags.map((tag, index) => ({
      rank: index + 1,
      itemId: new mongoose.Types.ObjectId(),
      itemRef: 'Tag',
      score: tag.heat,
      heat: tag.heat,
      tag: tag._id,
      postCount: tag.postCount
    }));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + recConfig.snapshot.ttlMinutes * 60000);

    const snapshot = await HotListSnapshot.create({
      type: 'tags',
      window,
      items,
      snapshotAt: now,
      expiresAt,
      totalItems: items.length
    });

    logger.info(`[Snapshot] Created hot tags snapshot: window=${window}, items=${items.length}`);
    return snapshot;
  } catch (error) {
    logger.error(`[Snapshot] Hot tags snapshot error (window=${window}): ${error.message}`);
    throw error;
  }
};

const createAllSnapshots = async () => {
  try {
    const recConfig = await configService.getConfig();
    if (!recConfig.snapshot.enabled) {
      logger.info('[Snapshot] Snapshot disabled, skipping');
      return { created: 0 };
    }

    const enabledWindows = Object.entries(recConfig.snapshot.intervals)
      .filter(([_, enabled]) => enabled)
      .map(([window]) => window);

    if (enabledWindows.length === 0) {
      logger.info('[Snapshot] No windows enabled');
      return { created: 0 };
    }

    const results = [];
    for (const window of enabledWindows) {
      try {
        const postsSnapshot = await createHotPostsSnapshot(window, recConfig);
        const tagsSnapshot = await createHotTagsSnapshot(window, recConfig);
        results.push({
          window,
          posts: postsSnapshot ? postsSnapshot.totalItems : 0,
          tags: tagsSnapshot ? tagsSnapshot.totalItems : 0
        });
      } catch (error) {
        logger.error(`[Snapshot] Window ${window} failed: ${error.message}`);
      }
    }

    logger.info(`[Snapshot] All snapshots complete: ${JSON.stringify(results)}`);
    return { created: results.length, details: results };
  } catch (error) {
    logger.error(`[Snapshot] Create all error: ${error.message}`);
    throw error;
  }
};

const getLatestSnapshot = async (type, window) => {
  try {
    const snapshot = await HotListSnapshot.findOne({
      type,
      window,
      expiresAt: { $gt: new Date() }
    })
      .sort({ snapshotAt: -1 })
      .lean();

    if (snapshot) {
      logger.debug(`[Snapshot] Found cached ${type} snapshot for window ${window}`);
    }

    return snapshot;
  } catch (error) {
    logger.error(`[Snapshot] Get latest error: ${error.message}`);
    return null;
  }
};

const getHotTags = async (preferredWindow = '1h') => {
  try {
    const recConfig = await configService.getConfig();

    if (recConfig.snapshot.enabled) {
      let snapshot = await getLatestSnapshot('tags', preferredWindow);

      if (!snapshot && preferredWindow !== '24h') {
        snapshot = await getLatestSnapshot('tags', '24h');
      }

      if (snapshot) {
        return {
          window: snapshot.window,
          nextUpdateAt: snapshot.expiresAt,
          list: snapshot.items.map((item) => ({
            rank: item.rank,
            tag: item.tag,
            postCount: item.postCount,
            heat: item.heat
          }))
        };
      }
    }

    logger.warn('[Snapshot] No cached hot tags, falling back to live query');

    const now = Date.now();
    const windowMs = recConfig.hotTags.windowHours * 3600000;
    const fallbackMs = recConfig.hotTags.fallbackWindowHours * 3600000;

    let startAt = new Date(now - windowMs);
    let pipeline = buildHotTagsPipeline(startAt, recConfig.hotTags.maxTags, recConfig.hotTags);
    let tags = await Post.aggregate(pipeline);
    let window = preferredWindow;

    if (!tags.length) {
      startAt = new Date(now - fallbackMs);
      pipeline = buildHotTagsPipeline(startAt, recConfig.hotTags.maxTags, recConfig.hotTags);
      tags = await Post.aggregate(pipeline);
      window = '24h';
    }

    const nextUpdateAt = new Date(Math.ceil(now / 3600000) * 3600000);

    return {
      window,
      nextUpdateAt,
      list: tags.map((item, index) => ({
        rank: index + 1,
        tag: item._id,
        postCount: item.postCount,
        heat: item.heat
      }))
    };
  } catch (error) {
    logger.error(`[Snapshot] Get hot tags error: ${error.message}`);
    throw error;
  }
};

const getHotPosts = async (window = '24h', page = 1, limit = 20) => {
  try {
    const recConfig = await configService.getConfig();
    let items = [];
    let total = 0;

    if (recConfig.snapshot.enabled) {
      const snapshot = await getLatestSnapshot('posts', window);
      if (snapshot) {
        items = snapshot.items;
        total = snapshot.totalItems;
      }
    }

    if (items.length === 0) {
      logger.warn('[Snapshot] No cached hot posts, falling back to live query');
      const hours = WINDOW_HOURS[window];
      const startAt = new Date(Date.now() - hours * 3600000);
      const pipeline = buildHotPostsPipeline(
        startAt,
        recConfig.snapshot.maxItems,
        recConfig.hotTags,
        recConfig.ranking
      );
      const posts = await Post.aggregate(pipeline);
      items = posts.map((post, index) => ({
        rank: index + 1,
        itemId: post._id,
        score: post.score,
        heat: post.heat
      }));
      total = items.length;
    }

    const start = (page - 1) * limit;
    const pagedItems = items.slice(start, start + limit);
    const postIds = pagedItems.map((item) => item.itemId);

    const posts = await Post.find({ _id: { $in: postIds } })
      .populate('author', 'nickname avatar')
      .lean();

    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
    const orderedPosts = pagedItems
      .map((item) => postMap.get(item.itemId.toString()))
      .filter(Boolean);

    return {
      list: orderedPosts,
      itemScores: pagedItems.map((item) => ({
        postId: item.itemId,
        score: item.score
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`[Snapshot] Get hot posts error: ${error.message}`);
    throw error;
  }
};

const cleanupExpiredSnapshots = async () => {
  try {
    const result = await HotListSnapshot.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    logger.info(`[Snapshot] Cleaned up ${result.deletedCount} expired snapshots`);
    return result.deletedCount;
  } catch (error) {
    logger.error(`[Snapshot] Cleanup error: ${error.message}`);
    return 0;
  }
};

module.exports = {
  createHotPostsSnapshot,
  createHotTagsSnapshot,
  createAllSnapshots,
  getLatestSnapshot,
  getHotTags,
  getHotPosts,
  cleanupExpiredSnapshots
};
