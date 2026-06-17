const { Post, User, Resonance, Comment } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const recommendation = require('../services/recommendation');
const { sanitizeTags, escapeRegex } = require('../utils/common');
const { attachInteractionState } = require('../utils/interaction');
const { asyncHandler } = require('../utils/errors');

const getLegacyOceanFlow = async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const mode = req.query.mode || 'recommend';
  const tags = sanitizeTags(req.query.tags);
  const keyword = (req.query.keyword || '').trim();

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

  const basePosts = await Post.find(filter)
    .populate('author', 'nickname avatar tagSkin')
    .sort({ createdAt: -1 })
    .limit(120)
    .lean();

  const preferredTags = req.userId
    ? await recommendation.tagPrecomputeService.getUserTopTags(
        req.userId,
        true
      )
    : [];

  const ranked = await recommendation.rankingService.rankPostsWithConfig(
    basePosts,
    mode,
    preferredTags
  );

  const start = (page - 1) * limit;
  const paged = ranked.slice(start, start + limit);
  const { list: enriched, viewerPremium } = await attachInteractionState(paged, req.userId);

  return res.json({
    code: 0,
    data: {
      mode,
      preferredTags,
      list: enriched,
      viewerPremium,
      pagination: {
        page,
        limit,
        total: ranked.length,
        pages: Math.ceil(ranked.length / limit)
      },
      legacy: true
    }
  });
};

exports.getOceanFlow = asyncHandler(async (req, res) => {
  if (!config.recommendation.enabled) {
    return await getLegacyOceanFlow(req, res);
  }

  const result = await recommendation.getOceanFlow({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    mode: req.query.mode || 'recommend',
    tags: req.query.tags,
    keyword: req.query.keyword,
    userId: req.userId
  });

  return res.json({
    code: 0,
    data: {
      mode: result.mode,
      preferredTags: result.preferredTags,
      list: result.list,
      viewerPremium: result.viewerPremium,
      pagination: result.pagination,
      fromCache: result.fromCache
    }
  });
});

const getLegacyHotTags = async (req, res) => {
  const oneHourAgo = new Date(Date.now() - 3600000);

  const buildPipeline = (startAt) => [
    { $match: { createdAt: { $gte: startAt }, status: 'published' } },
    {
      $project: {
        tags: 1,
        heat: {
          $add: [
            1,
            '$resonanceCount',
            '$commentCount',
            { $multiply: ['$superEchoCount', 2] }
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
    { $limit: 12 }
  ];

  let tags = await Post.aggregate(buildPipeline(oneHourAgo));
  let window = '1h';

  if (!tags.length) {
    tags = await Post.aggregate(
      buildPipeline(new Date(Date.now() - 24 * 3600000))
    );
    window = '24h';
  }

  const nextUpdateAt = new Date(Math.ceil(Date.now() / 3600000) * 3600000);

  const listWithFeatured = await Promise.all(
    tags.map(async (item, index) => {
      const tag = item._id;
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600000);
      const originPosts = await Post.find({
        tags: tag,
        type: 'origin',
        status: 'published',
        createdAt: { $gte: twentyFourHoursAgo }
      })
        .populate('author', 'nickname avatar tagSkin')
        .lean();

      let featuredOriginPosts = [];
      if (originPosts.length > 0) {
        const postIds = originPosts.map((p) => p._id);
        const recentResonanceCounts = await Resonance.aggregate([
          { $match: { post: { $in: postIds }, createdAt: { $gte: oneHourAgo } } },
          { $group: { _id: '$post', count: { $sum: 1 } } }
        ]);

        const resonanceGrowthMap = new Map();
        recentResonanceCounts.forEach((r) => {
          resonanceGrowthMap.set(r._id.toString(), r.count);
        });

        const postsWithGrowth = originPosts.map((post) => ({
          ...post,
          resonanceGrowth: resonanceGrowthMap.get(post._id.toString()) || 0
        }));

        postsWithGrowth.sort((a, b) => {
          if (b.resonanceGrowth !== a.resonanceGrowth) {
            return b.resonanceGrowth - a.resonanceGrowth;
          }
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        featuredOriginPosts = postsWithGrowth.slice(0, 3).map((post) => ({
          _id: post._id,
          title: post.title,
          contentText: post.contentText,
          dynamicTag: post.dynamicTag,
          author: post.author,
          resonanceCount: post.resonanceCount,
          commentCount: post.commentCount,
          superEchoCount: post.superEchoCount,
          resonanceGrowth: post.resonanceGrowth,
          createdAt: post.createdAt
        }));
      }

      return {
        rank: index + 1,
        tag: item._id,
        postCount: item.postCount,
        heat: item.heat,
        featuredOriginPosts
      };
    })
  );

  return res.json({
    code: 0,
    data: {
      window,
      nextUpdateAt: nextUpdateAt.toISOString(),
      list: listWithFeatured,
      legacy: true
    }
  });
};

exports.getHotTags = asyncHandler(async (req, res) => {
  if (!config.recommendation.enabled) {
    return await getLegacyHotTags(req, res);
  }

  try {
    const result = await recommendation.getHotTags('1h');

    return res.json({
      code: 0,
      data: {
        window: result.window,
        nextUpdateAt:
          result.nextUpdateAt instanceof Date
            ? result.nextUpdateAt.toISOString()
            : result.nextUpdateAt,
        list: result.list
      }
    });
  } catch (error) {
    logger.error(`Get hot tags error: ${error.message}`);

    if (config.recommendation.fallbackToLegacy) {
      logger.warn('Falling back to legacy hot tags implementation');
      try {
        return await getLegacyHotTags(req, res);
      } catch (legacyError) {
        logger.error(
          `Legacy hot tags also failed: ${legacyError.message}`
        );
      }
    }

    throw error;
  }
});

exports.searchDeepSea = asyncHandler(async (req, res) => {
  const result = await recommendation.searchDeepSea({
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    keyword: req.query.keyword,
    tags: req.query.tags,
    userId: req.userId
  });

  return res.json({
    code: 0,
    data: {
      list: result.list,
      viewerPremium: result.viewerPremium,
      query: result.query,
      pagination: result.pagination
    }
  });
});

exports.getPostDetail = asyncHandler(async (req, res) => {
  const postId = req.params.id;

  const post = await Post.findById(postId)
    .populate('author', 'nickname avatar tagSkin')
    .lean();
  if (!post) {
    return res.status(404).json({ code: 1, message: 'Post not found' });
  }

  if (post.status === 'removed') {
    return res.status(404).json({ code: 1, message: 'Post not found' });
  }

  const [allComments, superEchoes] = await Promise.all([
    Comment.find({ post: postId })
      .populate('user', 'nickname avatar')
      .sort({ createdAt: 1 })
      .limit(config.maxCommentsPerQuery)
      .lean(),
    Post.find({ parentPost: postId })
      .populate('author', 'nickname avatar')
      .sort({ createdAt: 1 })
      .lean()
  ]);

  const parentComments = allComments.filter((c) => !c.parentComment);
  const replyMap = new Map();
  allComments
    .filter((c) => c.parentComment)
    .forEach((reply) => {
      const pid = reply.parentComment.toString();
      if (!replyMap.has(pid)) {
        replyMap.set(pid, []);
      }
      replyMap.get(pid).push(reply);
    });

  const comments = parentComments
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((parent) => ({
      ...parent,
      replies: (replyMap.get(parent._id.toString()) || []).sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      )
    }));

  const enrichedResult = await attachInteractionState(
    [post],
    req.userId
  );
  const enrichedPost = enrichedResult.list[0];
  const viewerPremium = enrichedResult.viewerPremium;
  const enrichedSuperEchoesResult = await attachInteractionState(
    superEchoes,
    req.userId
  );
  const enrichedSuperEchoes = enrichedSuperEchoesResult.list;

  return res.json({
    code: 0,
    data: {
      post: enrichedPost,
      viewerPremium,
      comments,
      superEchoes: enrichedSuperEchoes
    }
  });
});

exports.getResonanceList = asyncHandler(async (req, res) => {
  const postId = req.params.id;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);

  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).json({ code: 1, message: 'Post not found' });
  }

  const [list, total] = await Promise.all([
    Resonance.find({ post: postId })
      .populate('user', 'nickname avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Resonance.countDocuments({ post: postId })
  ]);

  const resonanceList = list.map((item) => ({
    _id: item._id,
    user: item.user,
    createdAt: item.createdAt
  }));

  return res.json({
    code: 0,
    data: {
      list: resonanceList,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

exports.getSuperEchoTree = asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  const rootId = req.params.id;
  const objectId = new mongoose.Types.ObjectId(rootId);

  const treeData = await Post.aggregate([
    { $match: { _id: objectId } },
    {
      $graphLookup: {
        from: 'posts',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'parentPost',
        as: 'descendants'
      }
    }
  ]);

  if (!treeData.length) {
    return res.status(404).json({ code: 1, message: 'Post not found' });
  }

  const root = treeData[0];
  const descendants = root.descendants || [];

  const userIds = [
    root.author,
    ...descendants.map((item) => item.author)
  ].map((id) => id.toString());
  const users = await User.find({
    _id: { $in: [...new Set(userIds)] }
  })
    .select('nickname avatar')
    .lean();
  const userMap = new Map(
    users.map((user) => [user._id.toString(), user])
  );

  const childrenMap = new Map();
  descendants.forEach((item) => {
    const parentId = item.parentPost?.toString();
    if (!parentId) {
      return;
    }
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(item);
  });

  const attachChildren = (node) => {
    const nodeId = node._id.toString();
    const children = (childrenMap.get(nodeId) || [])
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((child) => attachChildren(child));

    return {
      _id: node._id,
      title: node.title,
      contentText: node.contentText,
      dynamicTag: node.dynamicTag,
      tags: node.tags,
      type: node.type,
      createdAt: node.createdAt,
      resonanceCount: node.resonanceCount,
      commentCount: node.commentCount,
      superEchoCount: node.superEchoCount,
      author: userMap.get(node.author.toString()) || null,
      children
    };
  };

  const tree = attachChildren(root);

  return res.json({
    code: 0,
    data: tree
  });
});
