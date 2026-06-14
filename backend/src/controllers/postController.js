const mongoose = require('mongoose');
const { Post, Resonance, Comment } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

const sanitizeTags = (tags) => {
  const list = Array.isArray(tags) ? tags : [];
  const normalized = list
    .map((tag) => String(tag).trim().replace(/^[#＃]/, '').toLowerCase())
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, config.maxTagsPerPost);
};

exports.createPost = async (req, res) => {
  try {
    const tags = sanitizeTags(req.body.tags);
    if (!tags.length) {
      return res.status(400).json({ code: 1, message: 'At least one tag is required' });
    }

    const post = await Post.create({
      title: req.body.title || '',
      contentText: req.body.contentText,
      contentAudio: req.body.audioUrl || '',
      contentLink: req.body.linkUrl || '',
      coverImage: req.body.coverImage || '',
      dynamicTag: req.body.dynamicTag,
      tags,
      type: 'origin',
      author: req.userId
    });

    logger.info(`Post created: ${post._id} by ${req.userId}`);

    return res.status(201).json({ code: 0, data: post });
  } catch (error) {
    logger.error(`Create post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createSuperEcho = async (req, res) => {
  try {
    const parentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ code: 1, message: 'Invalid post id' });
    }

    const parent = await Post.findById(parentId);
    if (!parent) {
      return res.status(404).json({ code: 1, message: 'Parent post not found' });
    }

    const tags = sanitizeTags(req.body.tags);
    if (!tags.length) {
      return res.status(400).json({ code: 1, message: 'At least one tag is required' });
    }

    const post = await Post.create({
      title: req.body.title || '',
      contentText: req.body.contentText,
      contentLink: req.body.linkUrl || '',
      dynamicTag: req.body.dynamicTag,
      tags,
      type: 'super_echo',
      parentPost: parent._id,
      author: req.userId
    });

    await Post.findByIdAndUpdate(parent._id, { $inc: { superEchoCount: 1 } });

    logger.info(`Super echo created: ${post._id} -> ${parent._id}`);

    return res.status(201).json({ code: 0, data: post });
  } catch (error) {
    logger.error(`Create super echo error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.toggleResonance = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    const exists = await Resonance.findOne({ post: postId, user: req.userId });

    if (exists) {
      await Resonance.deleteOne({ _id: exists._id });
      await Post.findByIdAndUpdate(postId, { $inc: { resonanceCount: -1 } });
      return res.json({
        code: 0,
        data: {
          resonated: false,
          resonanceCount: Math.max((post.resonanceCount || 0) - 1, 0)
        }
      });
    }

    await Resonance.create({ post: postId, user: req.userId });
    await Post.findByIdAndUpdate(postId, { $inc: { resonanceCount: 1 } });

    return res.json({
      code: 0,
      data: {
        resonated: true,
        resonanceCount: (post.resonanceCount || 0) + 1
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ code: 1, message: 'Already resonated' });
    }
    logger.error(`Toggle resonance error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createComment = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    const comment = await Comment.create({
      post: postId,
      user: req.userId,
      dynamicTag: req.body.dynamicTag,
      content: req.body.content
    });

    await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

    await comment.populate('user', 'nickname avatar');

    logger.info(`Comment created: ${comment._id} on ${postId}`);

    return res.status(201).json({ code: 0, data: comment });
  } catch (error) {
    logger.error(`Create comment error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getMyPosts = async (req, res) => {
  try {
    const list = await Post.find({ author: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ code: 0, data: list });
  } catch (error) {
    logger.error(`Get my posts error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
