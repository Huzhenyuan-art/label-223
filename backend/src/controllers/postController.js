const mongoose = require('mongoose');
const { Post, Resonance, Comment, ResonanceNotification } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const { sendToUser } = require('../websocket');

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

    if (parent.author.toString() !== req.userId.toString()) {
      const notification = await ResonanceNotification.create({
        recipient: parent.author,
        post: parent._id,
        superEcho: post._id,
        sender: req.userId
      });

      await notification.populate('sender', 'nickname avatar');
      await notification.populate('post', 'title dynamicTag');

      try {
        sendToUser(parent.author.toString(), {
          type: 'resonance_notify',
          data: {
            _id: notification._id,
            post: notification.post,
            superEcho: post._id,
            sender: notification.sender,
            senderDynamicTag: post.dynamicTag,
            createdAt: notification.createdAt
          }
        });
      } catch (e) {
        logger.error(`Push resonance notify error: ${e.message}`);
      }
    }

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
      parentComment: null,
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

exports.createCommentReply = async (req, res) => {
  try {
    const postId = req.params.id;
    const parentCommentId = req.params.commentId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    const parentComment = await Comment.findById(parentCommentId);
    if (!parentComment) {
      return res.status(404).json({ code: 1, message: 'Parent comment not found' });
    }

    if (parentComment.parentComment) {
      return res.status(400).json({ code: 1, message: 'Only one level of reply is allowed' });
    }

    const reply = await Comment.create({
      post: postId,
      user: req.userId,
      parentComment: parentCommentId,
      dynamicTag: req.body.dynamicTag,
      content: req.body.content
    });

    await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

    await reply.populate('user', 'nickname avatar');
    await reply.populate('parentComment', '_id');

    logger.info(`Comment reply created: ${reply._id} -> ${parentCommentId}`);

    return res.status(201).json({ code: 0, data: reply });
  } catch (error) {
    logger.error(`Create comment reply error: ${error.message}`);
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

exports.updatePost = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    if (post.author.toString() !== req.userId.toString()) {
      return res.status(403).json({ code: 1, message: 'No permission to edit this post' });
    }

    if (post.type !== 'origin') {
      return res.status(400).json({ code: 1, message: 'Only origin posts can be edited' });
    }

    const tags = sanitizeTags(req.body.tags);
    if (!tags.length) {
      return res.status(400).json({ code: 1, message: 'At least one tag is required' });
    }

    const updatedPost = await Post.findByIdAndUpdate(
      postId,
      {
        title: req.body.title || '',
        contentText: req.body.contentText,
        contentAudio: req.body.audioUrl || '',
        contentLink: req.body.linkUrl || '',
        coverImage: req.body.coverImage || '',
        dynamicTag: req.body.dynamicTag,
        tags,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    logger.info(`Post updated: ${postId} by ${req.userId}`);

    return res.json({ code: 0, data: updatedPost });
  } catch (error) {
    logger.error(`Update post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const postId = req.params.id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    if (post.author.toString() !== req.userId.toString()) {
      return res.status(403).json({ code: 1, message: 'No permission to delete this post' });
    }

    if (post.type !== 'origin') {
      return res.status(400).json({ code: 1, message: 'Only origin posts can be deleted' });
    }

    await Resonance.deleteMany({ post: postId });

    await Comment.deleteMany({ post: postId });

    const superEchoes = await Post.find({ parentPost: postId });
    for (const echo of superEchoes) {
      await Resonance.deleteMany({ post: echo._id });
      await Comment.deleteMany({ post: echo._id });
    }

    await Post.deleteMany({ parentPost: postId });

    if (post.parentPost) {
      await Post.findByIdAndUpdate(
        post.parentPost,
        { $inc: { superEchoCount: -1 } }
      );
    }

    await Post.findByIdAndDelete(postId);

    logger.info(`Post deleted: ${postId} by ${req.userId}`);

    return res.json({ code: 0, data: { message: 'Post deleted successfully' } });
  } catch (error) {
    logger.error(`Delete post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
