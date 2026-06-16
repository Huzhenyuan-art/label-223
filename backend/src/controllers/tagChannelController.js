const {
  TagChannel,
  UserTagSubscription,
  Post,
  User,
  Resonance
} = require('../models');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const normalizeTag = (tag) => {
  return String(tag || '')
    .trim()
    .replace(/^[#＃]/, '')
    .toLowerCase()
    .slice(0, 20);
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

const ensureTagChannel = async (tagName) => {
  const tag = normalizeTag(tagName);
  if (!tag) {
    return null;
  }

  let channel = await TagChannel.findOne({ tag }).lean();
  if (!channel) {
    try {
      const [postCountResult, lastPost] = await Promise.all([
        Post.countDocuments({ tags: tag, type: 'origin' }),
        Post.findOne({ tags: tag, type: 'origin' })
          .sort({ createdAt: -1 })
          .select('createdAt')
          .lean()
      ]);

      channel = await TagChannel.create({
        tag,
        displayName: tagName.replace(/^[#＃]/, ''),
        postCount: postCountResult,
        lastPostAt: lastPost?.createdAt || null,
        isOfficial: false,
        isActive: true
      });
      channel = channel.toObject();
    } catch (error) {
      if (error.code === 11000) {
        channel = await TagChannel.findOne({ tag }).lean();
      } else {
        throw error;
      }
    }
  }

  return channel;
};

exports.getTagChannelList = async (req, res) => {
  try {
    const userId = req.userId;
    const category = req.query.category;
    const keyword = (req.query.keyword || '').trim();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);

    const filter = { isActive: true };
    if (category && category !== 'all') {
      filter.category = category;
    }
    if (keyword) {
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ tag: regex }, { displayName: regex }, { description: regex }];
    }

    const [channels, total] = await Promise.all([
      TagChannel.find(filter)
        .sort({ sortOrder: 1, subscriberCount: -1, postCount: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TagChannel.countDocuments(filter)
    ]);

    let subscribedTags = [];
    if (userId) {
      const subscriptions = await UserTagSubscription.find({ user: userId })
        .select('tag subscribedAt lastViewedAt unreadCount')
        .lean();
      subscribedTags = subscriptions;
    }

    const subscribedTagSet = new Set(subscribedTags.map((s) => s.tag));
    const subscriptionMap = new Map(subscribedTags.map((s) => [s.tag, s]));

    const list = channels.map((ch) => {
      const subscription = subscriptionMap.get(ch.tag);
      let hasNewContent = false;
      let unreadCount = 0;

      if (subscription) {
        unreadCount = subscription.unreadCount || 0;
        if (ch.lastPostAt && subscription.lastViewedAt) {
          hasNewContent = new Date(ch.lastPostAt) > new Date(subscription.lastViewedAt);
        } else if (ch.lastPostAt && !subscription.lastViewedAt) {
          hasNewContent = true;
        }
        if (unreadCount > 0) {
          hasNewContent = true;
        }
      }

      return {
        tag: ch.tag,
        displayName: ch.displayName || ch.tag,
        description: ch.description || '',
        coverImage: ch.coverImage || '',
        category: ch.category,
        subscriberCount: ch.subscriberCount || 0,
        postCount: ch.postCount || 0,
        lastPostAt: ch.lastPostAt || null,
        isOfficial: ch.isOfficial || false,
        isSubscribed: subscribedTagSet.has(ch.tag),
        subscribedAt: subscription?.subscribedAt || null,
        hasNewContent,
        unreadCount
      };
    });

    return res.json({
      code: 0,
      data: {
        list,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get tag channel list error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '获取标签列表失败' });
  }
};

exports.getMySubscribedTags = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ code: 1, message: '请先登录' });
    }

    const subscriptions = await UserTagSubscription.find({ user: userId })
      .sort({ subscribedAt: -1 })
      .lean();

    if (subscriptions.length === 0) {
      return res.json({
        code: 0,
        data: {
          list: []
        }
      });
    }

    const tagList = subscriptions.map((s) => s.tag);
    const channels = await TagChannel.find({ tag: { $in: tagList } }).lean();
    const channelMap = new Map(channels.map((c) => [c.tag, c]));

    const list = subscriptions.map((sub) => {
      const ch = channelMap.get(sub.tag);
      let hasNewContent = false;
      let unreadCount = sub.unreadCount || 0;

      if (ch) {
        if (ch.lastPostAt && sub.lastViewedAt) {
          hasNewContent = new Date(ch.lastPostAt) > new Date(sub.lastViewedAt);
        } else if (ch.lastPostAt && !sub.lastViewedAt) {
          hasNewContent = true;
        }
      }
      if (unreadCount > 0) {
        hasNewContent = true;
      }

      return {
        tag: sub.tag,
        displayName: ch?.displayName || sub.tag,
        description: ch?.description || '',
        coverImage: ch?.coverImage || '',
        category: ch?.category || 'general',
        subscriberCount: ch?.subscriberCount || 0,
        postCount: ch?.postCount || 0,
        lastPostAt: ch?.lastPostAt || null,
        isOfficial: ch?.isOfficial || false,
        isSubscribed: true,
        subscribedAt: sub.subscribedAt,
        hasNewContent,
        unreadCount
      };
    });

    return res.json({
      code: 0,
      data: {
        list
      }
    });
  } catch (error) {
    logger.error(`Get subscribed tags error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '获取订阅标签失败' });
  }
};

exports.subscribeTag = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ code: 1, message: '请先登录' });
    }

    const tagName = req.body.tag || req.params.tag;
    const tag = normalizeTag(tagName);

    if (!tag) {
      return res.status(400).json({ code: 1, message: '标签不能为空' });
    }

    await ensureTagChannel(tag);

    const existing = await UserTagSubscription.findOne({ user: userId, tag });
    if (existing) {
      return res.json({
        code: 0,
        data: {
          tag,
          subscribed: true,
          subscribedAt: existing.subscribedAt,
          message: '已经订阅该标签'
        }
      });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await UserTagSubscription.create(
        [{
          user: userId,
          tag,
          subscribedAt: new Date(),
          lastViewedAt: new Date()
        }],
        { session }
      );

      await TagChannel.updateOne(
        { tag },
        { $inc: { subscriberCount: 1 } },
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      logger.info(`User ${userId} subscribed to tag: ${tag}`);

      return res.json({
        code: 0,
        data: {
          tag,
          subscribed: true,
          subscribedAt: new Date(),
          message: '订阅成功'
        }
      });
    } catch (txError) {
      await session.abortTransaction();
      session.endSession();
      throw txError;
    }
  } catch (error) {
    logger.error(`Subscribe tag error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '订阅失败，请稍后重试' });
  }
};

exports.unsubscribeTag = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ code: 1, message: '请先登录' });
    }

    const tagName = req.body.tag || req.params.tag;
    const tag = normalizeTag(tagName);

    if (!tag) {
      return res.status(400).json({ code: 1, message: '标签不能为空' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const result = await UserTagSubscription.deleteOne(
        { user: userId, tag },
        { session }
      );

      if (result.deletedCount > 0) {
        await TagChannel.updateOne(
          { tag },
          { $inc: { subscriberCount: -1 } },
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      logger.info(`User ${userId} unsubscribed from tag: ${tag}`);

      return res.json({
        code: 0,
        data: {
          tag,
          subscribed: false,
          message: '已取消订阅'
        }
      });
    } catch (txError) {
      await session.abortTransaction();
      session.endSession();
      throw txError;
    }
  } catch (error) {
    logger.error(`Unsubscribe tag error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '取消订阅失败，请稍后重试' });
  }
};

exports.markTagViewed = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ code: 1, message: '请先登录' });
    }

    const tagName = req.body.tag || req.params.tag;
    const tag = normalizeTag(tagName);

    if (!tag) {
      return res.status(400).json({ code: 1, message: '标签不能为空' });
    }

    await UserTagSubscription.updateOne(
      { user: userId, tag },
      {
        $set: {
          lastViewedAt: new Date(),
          unreadCount: 0
        }
      }
    );

    return res.json({
      code: 0,
      data: {
        tag,
        viewed: true
      }
    });
  } catch (error) {
    logger.error(`Mark tag viewed error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '标记失败' });
  }
};

exports.getTagsNewContentStatus = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.json({
        code: 0,
        data: {
          hasAnyNew: false,
          tags: []
        }
      });
    }

    const subscriptions = await UserTagSubscription.find({ user: userId }).lean();

    if (subscriptions.length === 0) {
      return res.json({
        code: 0,
        data: {
          hasAnyNew: false,
          tags: []
        }
      });
    }

    const tagList = subscriptions.map((s) => s.tag);
    const channels = await TagChannel.find({ tag: { $in: tagList } })
      .select('tag lastPostAt')
      .lean();
    const channelMap = new Map(channels.map((c) => [c.tag, c]));

    const tagsWithNew = [];
    let hasAnyNew = false;

    subscriptions.forEach((sub) => {
      const ch = channelMap.get(sub.tag);
      let hasNew = false;
      let unreadCount = sub.unreadCount || 0;

      if (ch) {
        if (ch.lastPostAt && sub.lastViewedAt) {
          hasNew = new Date(ch.lastPostAt) > new Date(sub.lastViewedAt);
        } else if (ch.lastPostAt && !sub.lastViewedAt) {
          hasNew = true;
        }
      }
      if (unreadCount > 0) {
        hasNew = true;
      }

      if (hasNew) {
        hasAnyNew = true;
        tagsWithNew.push({
          tag: sub.tag,
          unreadCount,
          lastPostAt: ch?.lastPostAt || null
        });
      }
    });

    return res.json({
      code: 0,
      data: {
        hasAnyNew,
        tags: tagsWithNew
      }
    });
  } catch (error) {
    logger.error(`Get tags new content status error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '获取更新状态失败' });
  }
};

exports.getTagPosts = async (req, res) => {
  try {
    const tagName = req.params.tag || req.query.tag;
    const tag = normalizeTag(tagName);
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const userId = req.userId;

    if (!tag) {
      return res.status(400).json({ code: 1, message: '标签不能为空' });
    }

    const filter = {
      tags: tag,
      type: 'origin'
    };

    const [posts, total, channel, subscription] = await Promise.all([
      Post.find(filter)
        .populate('author', 'nickname avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments(filter),
      ensureTagChannel(tag),
      userId ? UserTagSubscription.findOne({ user: userId, tag }).lean() : null
    ]);

    const enrichedPosts = await attachInteractionState(posts, userId);

    if (userId && subscription) {
      await UserTagSubscription.updateOne(
        { user: userId, tag },
        {
          $set: {
            lastViewedAt: new Date(),
            unreadCount: 0
          }
        }
      );
    }

    return res.json({
      code: 0,
      data: {
        tag,
        displayName: channel?.displayName || tag,
        description: channel?.description || '',
        subscriberCount: channel?.subscriberCount || 0,
        postCount: total,
        isSubscribed: !!subscription,
        list: enrichedPosts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get tag posts error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '获取标签内容失败' });
  }
};

exports.recommendTagsForUser = async (req, res) => {
  try {
    const userId = req.userId;
    const limit = Number(req.query.limit || 20);

    let subscribedSet = new Set();
    if (userId) {
      const subscriptions = await UserTagSubscription.find({ user: userId })
        .select('tag')
        .lean();
      subscribedSet = new Set(subscriptions.map((s) => s.tag));
    }

    const userTopTags = userId
      ? await require('../services/recommendation/tagPrecomputeService').getUserTopTags(userId, false)
      : [];

    const userTagSet = new Set(userTopTags.filter((t) => !subscribedSet.has(t)));

    const hotChannels = await TagChannel.find({
      isActive: true,
      tag: { $nin: [...subscribedSet] }
    })
      .sort({ subscriberCount: -1, postCount: -1 })
      .limit(limit * 2)
      .lean();

    const recommended = [];
    const addedTags = new Set();

    userTopTags.forEach((tag) => {
      if (!subscribedSet.has(tag) && !addedTags.has(tag)) {
        const ch = hotChannels.find((c) => c.tag === tag);
        recommended.push({
          tag,
          displayName: ch?.displayName || tag,
          description: ch?.description || '',
          subscriberCount: ch?.subscriberCount || 0,
          postCount: ch?.postCount || 0,
          isOfficial: ch?.isOfficial || false,
          reason: userTagSet.has(tag) ? '根据你的兴趣推荐' : '',
          isSubscribed: false
        });
        addedTags.add(tag);
      }
    });

    hotChannels.forEach((ch) => {
      if (!addedTags.has(ch.tag) && recommended.length < limit) {
        recommended.push({
          tag: ch.tag,
          displayName: ch.displayName || ch.tag,
          description: ch.description || '',
          subscriberCount: ch.subscriberCount || 0,
          postCount: ch.postCount || 0,
          isOfficial: ch.isOfficial || false,
          reason: ch.isOfficial ? '官方推荐' : '热门标签',
          isSubscribed: false
        });
        addedTags.add(ch.tag);
      }
    });

    return res.json({
      code: 0,
      data: {
        list: recommended.slice(0, limit)
      }
    });
  } catch (error) {
    logger.error(`Recommend tags error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '获取推荐标签失败' });
  }
};
