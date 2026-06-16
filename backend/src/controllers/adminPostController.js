const mongoose = require('mongoose');
const { Post, Resonance, Comment, User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { logOperation } = require('../services/adminLogService');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

exports.getPosts = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { keyword, status, type, tag, authorId, startDate, endDate, sortBy } = req.query;

    const query = {};
    if (keyword) {
      const kw = keyword.trim();
      query.$or = [
        { title: { $regex: kw, $options: 'i' } },
        { contentText: { $regex: kw, $options: 'i' } },
        { dynamicTag: { $regex: kw, $options: 'i' } }
      ];
    }
    if (status) {
      query.status = status;
    }
    if (type) {
      query.type = type;
    }
    if (tag) {
      query.tags = tag.toLowerCase().trim();
    }
    if (authorId && mongoose.Types.ObjectId.isValid(authorId)) {
      query.author = new mongoose.Types.ObjectId(authorId);
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    let sortOption = { createdAt: -1 };
    if (sortBy === 'resonance') {
      sortOption = { resonanceCount: -1, createdAt: -1 };
    } else if (sortBy === 'comment') {
      sortOption = { commentCount: -1, createdAt: -1 };
    } else if (sortBy === 'superEcho') {
      sortOption = { superEchoCount: -1, createdAt: -1 };
    }

    const [list, total] = await Promise.all([
      Post.find(query)
        .populate('author', 'nickname avatar account')
        .populate('removedBy', 'nickname')
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Post.countDocuments(query)
    ]);

    return res.json({
      code: 0,
      data: {
        list,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get posts error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getPostDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid post id' });
    }

    const post = await Post.findById(id)
      .populate('author', 'nickname avatar account')
      .populate('removedBy', 'nickname')
      .lean();
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    const [comments, resonances, auditLogs] = await Promise.all([
      Comment.find({ post: id })
        .populate('user', 'nickname avatar')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Resonance.find({ post: id })
        .populate('user', 'nickname avatar')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      AuditLog.find({ type: { $in: ['post', 'super_echo', 'comment'] }, targetId: id })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
    ]);

    return res.json({
      code: 0,
      data: {
        post,
        comments,
        resonances,
        auditLogs
      }
    });
  } catch (error) {
    logger.error(`Get post detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.removePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid post id' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    if (post.status === 'removed') {
      return res.status(400).json({ code: 1, message: '帖子已下架' });
    }

    post.status = 'removed';
    post.removedAt = new Date();
    post.removedReason = reason;
    post.removedBy = req.userId;
    await post.save();

    await logOperation(req, {
      module: 'post',
      action: 'remove_post',
      targetId: post._id,
      targetType: 'Post',
      detail: { reason, title: post.title, contentText: post.contentText, author: post.author.toString() }
    });

    logger.info(`Post removed: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '下架成功' }
    });
  } catch (error) {
    logger.error(`Remove post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.restorePost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid post id' });
    }

    const post = await Post.findById(id);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    if (post.status === 'published') {
      return res.status(400).json({ code: 1, message: '帖子已发布' });
    }

    post.status = 'published';
    post.removedAt = null;
    post.removedReason = '';
    post.removedBy = null;
    await post.save();

    await logOperation(req, {
      module: 'post',
      action: 'restore_post',
      targetId: post._id,
      targetType: 'Post',
      detail: { title: post.title, contentText: post.contentText, author: post.author.toString() }
    });

    logger.info(`Post restored: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '恢复成功' }
    });
  } catch (error) {
    logger.error(`Restore post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.batchRemovePosts = async (req, res) => {
  try {
    const { postIds, reason = '' } = req.body;

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ code: 1, message: 'postIds must be a non-empty array' });
    }

    const validIds = postIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ code: 1, message: 'No valid post ids provided' });
    }

    const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));
    const now = new Date();

    const result = await Post.updateMany(
      { _id: { $in: objectIds }, status: 'published' },
      {
        $set: {
          status: 'removed',
          removedAt: now,
          removedReason: reason,
          removedBy: req.userId
        }
      }
    );

    const posts = await Post.find({ _id: { $in: objectIds } }).select('_id title contentText author').lean();
    for (const post of posts) {
      await logOperation(req, {
        module: 'post',
        action: 'batch_remove_post',
        targetId: post._id,
        targetType: 'Post',
        detail: { reason, title: post.title, contentText: post.contentText, author: post.author.toString() }
      }).catch(() => {});
    }

    logger.info(`Batch remove posts: ${result.modifiedCount} posts by ${req.userId}`);

    return res.json({
      code: 0,
      data: {
        removedCount: result.modifiedCount,
        totalCount: validIds.length
      }
    });
  } catch (error) {
    logger.error(`Batch remove posts error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
