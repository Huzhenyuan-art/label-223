const mongoose = require('mongoose');
const { Post, User, Resonance, Comment } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getUserTopTags = async (userId) => {
  const objectId = new mongoose.Types.ObjectId(userId);
  const [authoredTags, resonatedTags] = await Promise.all([
    Post.aggregate([
      { $match: { author: objectId } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', score: { $sum: 3 } } }
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
      { $group: { _id: '$postDoc.tags', score: { $sum: 2 } } }
    ])
  ]);

  const map = new Map();
  [...authoredTags, ...resonatedTags].forEach((item) => {
    map.set(item._id, (map.get(item._id) || 0) + item.score);
  });

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 10);
};

const attachInteractionState = async (posts, userId) => {
  if (!userId || !posts.length) {
    return posts.map((post) => ({ ...post, isResonated: false, isFavorited: false }));
  }

  const ids = posts.map((item) => item._id);

  const [resonances, user] = await Promise.all([
    Resonance.find({ user: userId, post: { $in: ids } }).select('post').lean(),
    User.findById(userId).select('favoritePosts').lean()
  ]);

  const resonanceSet = new Set(resonances.map((item) => item.post.toString()));
  const favoriteSet = new Set((user?.favoritePosts || []).map((item) => item.toString()));

  return posts.map((post) => ({
    ...post,
    isResonated: resonanceSet.has(post._id.toString()),
    isFavorited: favoriteSet.has(post._id.toString())
  }));
};

const rankPosts = (posts, mode, preferredTags) => {
  const now = Date.now();
  const preferredSet = new Set(preferredTags);

  const ranked = posts.map((post) => {
    const ageHours = Math.max((now - new Date(post.createdAt).getTime()) / 3600000, 1);
    const base = post.resonanceCount * 3 + post.commentCount * 2 + post.superEchoCount * 4 + 1;
    const tagMatch = post.tags.reduce((acc, tag) => (preferredSet.has(tag) ? acc + 1 : acc), 0);

    let score = base;
    if (mode === 'recommend') {
      score += tagMatch * 6;
      score += Math.max(0, 24 - ageHours) * 0.2;
    } else if (mode === 'hot') {
      score = base / ageHours + tagMatch;
    }

    return { ...post, score };
  });

  if (mode === 'latest') {
    return ranked.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return ranked.sort((a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt));
};

exports.getOceanFlow = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const mode = req.query.mode || 'recommend';
    const tags = sanitizeTags(req.query.tags);
    const keyword = (req.query.keyword || '').trim();

    const filter = {};
    if (tags.length > 0) {
      filter.tags = { $in: tags };
    }
    if (keyword) {
      const regex = new RegExp(escapeRegex(keyword), 'i');
      filter.$or = [{ title: regex }, { contentText: regex }, { dynamicTag: regex }];
    }

    const basePosts = await Post.find(filter)
      .populate('author', 'nickname avatar')
      .sort({ createdAt: -1 })
      .limit(120)
      .lean();

    const preferredTags = req.userId ? await getUserTopTags(req.userId) : [];
    const ranked = rankPosts(basePosts, mode, preferredTags);

    const start = (page - 1) * limit;
    const paged = ranked.slice(start, start + limit);
    const enriched = await attachInteractionState(paged, req.userId);

    return res.json({
      code: 0,
      data: {
        mode,
        preferredTags,
        list: enriched,
        pagination: {
          page,
          limit,
          total: ranked.length,
          pages: Math.ceil(ranked.length / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get ocean flow error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getHotTags = async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 3600000);

    const buildPipeline = (startAt) => [
      { $match: { createdAt: { $gte: startAt } } },
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
      tags = await Post.aggregate(buildPipeline(new Date(Date.now() - 24 * 3600000)));
      window = '24h';
    }

    const nextUpdateAt = new Date(Math.ceil(Date.now() / 3600000) * 3600000);

    return res.json({
      code: 0,
      data: {
        window,
        nextUpdateAt: nextUpdateAt.toISOString(),
        list: tags.map((item, index) => ({
          rank: index + 1,
          tag: item._id,
          postCount: item.postCount,
          heat: item.heat
        }))
      }
    });
  } catch (error) {
    logger.error(`Get hot tags error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.searchDeepSea = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const keyword = (req.query.keyword || '').trim();
    const tags = sanitizeTags(req.query.tags);

    const filter = {};

    if (tags.length > 0) {
      filter.tags = { $all: tags };
    }

    if (keyword) {
      const regex = new RegExp(escapeRegex(keyword), 'i');
      filter.$or = [{ title: regex }, { contentText: regex }, { dynamicTag: regex }];
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

    const enriched = await attachInteractionState(list, req.userId);

    return res.json({
      code: 0,
      data: {
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
      }
    });
  } catch (error) {
    logger.error(`Search deep sea error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getPostDetail = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId).populate('author', 'nickname avatar').lean();
    if (!post) {
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

    const [enrichedPost] = await attachInteractionState([post], req.userId);
    const enrichedSuperEchoes = await attachInteractionState(superEchoes, req.userId);

    return res.json({
      code: 0,
      data: {
        post: enrichedPost,
        comments,
        superEchoes: enrichedSuperEchoes
      }
    });
  } catch (error) {
    logger.error(`Get post detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getResonanceList = async (req, res) => {
  try {
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
  } catch (error) {
    logger.error(`Get resonance list error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getSuperEchoTree = async (req, res) => {
  try {
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

    const userIds = [root.author, ...descendants.map((item) => item.author)].map((id) => id.toString());
    const users = await User.find({ _id: { $in: [...new Set(userIds)] } }).select('nickname avatar').lean();
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

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
  } catch (error) {
    logger.error(`Get super echo tree error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
