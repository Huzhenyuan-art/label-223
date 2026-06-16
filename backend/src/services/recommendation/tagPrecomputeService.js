const mongoose = require('mongoose');
const {
  UserInterestTags,
  Post,
  Resonance,
  Comment,
  User
} = require('../../models');
const configService = require('./configService');
const logger = require('../../utils/logger');

const computeUserTags = async (userId, recConfig) => {
  const objectId = new mongoose.Types.ObjectId(userId);
  const { ranking } = recConfig;

  const [authoredTags, resonatedTags, commentedTags] = await Promise.all([
    Post.aggregate([
      { $match: { author: objectId } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          score: { $sum: ranking.authoredTagWeight },
          count: { $sum: 1 }
        }
      }
    ]),
    Resonance.aggregate([
      { $match: { user: objectId } },
      {
        $lookup: {
          from: 'posts',
          localField: 'post',
          foreignField: '_id',
          as: 'postDoc'
        }
      },
      { $unwind: '$postDoc' },
      { $unwind: '$postDoc.tags' },
      {
        $group: {
          _id: '$postDoc.tags',
          score: { $sum: ranking.resonatedTagWeight },
          count: { $sum: 1 }
        }
      }
    ]),
    Comment.aggregate([
      { $match: { user: objectId } },
      {
        $lookup: {
          from: 'posts',
          localField: 'post',
          foreignField: '_id',
          as: 'postDoc'
        }
      },
      { $unwind: '$postDoc' },
      { $unwind: '$postDoc.tags' },
      {
        $group: {
          _id: '$postDoc.tags',
          score: { $sum: ranking.commentedTagWeight },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const tagMap = new Map();
  const sourceMap = new Map();

  const processTags = (tags, source) => {
    tags.forEach((item) => {
      const current = tagMap.get(item._id) || 0;
      tagMap.set(item._id, current + item.score);

      const sources = sourceMap.get(item._id) || new Set();
      sources.add(source);
      sourceMap.set(item._id, sources);
    });
  };

  processTags(authoredTags, 'authored');
  processTags(resonatedTags, 'resonated');
  processTags(commentedTags, 'commented');

  const allTags = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, score]) => ({
      tag,
      score,
      source: [...sourceMap.get(tag)].sort().join(',')
    }));

  const topTags = allTags
    .slice(0, ranking.maxTopTags)
    .map((item) => item.tag);

  return {
    tags: allTags,
    topTags
  };
};

const precomputeUserTags = async (userId) => {
  try {
    const recConfig = await configService.getConfig();
    const result = await computeUserTags(userId, recConfig);

    const existing = await UserInterestTags.findOne({ user: userId });
    const now = new Date();

    if (existing) {
      existing.tags = result.tags;
      existing.topTags = result.topTags;
      existing.lastComputedAt = now;
      existing.version = (existing.version || 1) + 1;
      await existing.save();
      logger.debug(`[TagPrecompute] Updated tags for user: ${userId}`);
    } else {
      await UserInterestTags.create({
        user: userId,
        tags: result.tags,
        topTags: result.topTags,
        lastComputedAt: now
      });
      logger.debug(`[TagPrecompute] Created tags for user: ${userId}`);
    }

    return result.topTags;
  } catch (error) {
    logger.error(`[TagPrecompute] Error for user ${userId}: ${error.message}`);
    throw error;
  }
};

const getUserTopTags = async (userId, forceRefresh = false) => {
  if (!userId) {
    return [];
  }

  try {
    const recConfig = await configService.getConfig();

    if (!forceRefresh && recConfig.precompute.enabled) {
      const cached = await UserInterestTags.findOne({
        user: userId
      }).lean();

      if (cached) {
        const stalenessMs = Date.now() - new Date(cached.lastComputedAt).getTime();
        const thresholdMs = recConfig.precompute.stalenessThresholdHours * 3600000;

        if (stalenessMs < thresholdMs) {
          logger.debug(`[TagPrecompute] Using cached tags for user: ${userId}`);
          return cached.topTags;
        }
      }
    }

    logger.debug(`[TagPrecompute] Computing fresh tags for user: ${userId}`);
    return await precomputeUserTags(userId);
  } catch (error) {
    logger.error(`[TagPrecompute] Get tags error: ${error.message}`);
    return [];
  }
};

const precomputeBatch = async (batchSize = null) => {
  try {
    const recConfig = await configService.getConfig();
    if (!recConfig.precompute.enabled) {
      logger.info('[TagPrecompute] Precompute disabled, skipping');
      return { processed: 0, skipped: 0 };
    }

    const size = batchSize || recConfig.precompute.maxUsersPerBatch;
    const thresholdMs = recConfig.precompute.stalenessThresholdHours * 3600000;
    const thresholdDate = new Date(Date.now() - thresholdMs);

    const usersWithStaleTags = await UserInterestTags.aggregate([
      { $match: { lastComputedAt: { $lt: thresholdDate } } },
      { $sort: { lastComputedAt: 1 } },
      { $limit: size },
      { $project: { user: 1, _id: 0 } }
    ]);

    const staleUserIds = usersWithStaleTags.map((item) => item.user.toString());

    const usersWithoutTags = await User.aggregate([
      {
        $lookup: {
          from: 'userinteresttags',
          localField: '_id',
          foreignField: 'user',
          as: 'tags'
        }
      },
      { $match: { tags: { $size: 0 } } },
      { $sort: { lastLoginAt: -1 } },
      { $limit: size - staleUserIds.length },
      { $project: { _id: 1 } }
    ]);

    const newUserIds = usersWithoutTags.map((item) => item._id.toString());
    const allUserIds = [...staleUserIds, ...newUserIds];

    if (allUserIds.length === 0) {
      logger.info('[TagPrecompute] No users need tag precomputation');
      return { processed: 0, skipped: 0 };
    }

    logger.info(`[TagPrecompute] Processing batch of ${allUserIds.length} users`);

    let processed = 0;
    let failed = 0;

    for (const userId of allUserIds) {
      try {
        await precomputeUserTags(userId);
        processed++;
      } catch (error) {
        failed++;
        logger.error(`[TagPrecompute] Failed for user ${userId}: ${error.message}`);
      }
    }

    logger.info(`[TagPrecompute] Batch complete: processed=${processed}, failed=${failed}`);
    return { processed, failed, total: allUserIds.length };
  } catch (error) {
    logger.error(`[TagPrecompute] Batch error: ${error.message}`);
    throw error;
  }
};

const invalidateUserTags = async (userId) => {
  try {
    await UserInterestTags.deleteOne({ user: userId });
    logger.debug(`[TagPrecompute] Invalidated tags for user: ${userId}`);
  } catch (error) {
    logger.error(`[TagPrecompute] Invalidate error: ${error.message}`);
  }
};

module.exports = {
  computeUserTags,
  precomputeUserTags,
  getUserTopTags,
  precomputeBatch,
  invalidateUserTags
};
