const { ResonanceNotification } = require('../models');
const logger = require('../utils/logger');
const { sendToUser } = require('../websocket');
const notificationService = require('../services/notificationService');
const postService = require('../services/postService');
const resonanceService = require('../services/resonanceService');
const commentService = require('../services/commentService');
const { asyncHandler } = require('../utils/errors');

const buildAuditInfo = (auditInfo) => ({
  auditInfo: {
    action: auditInfo.action,
    matchedWords: auditInfo.matchedWords
  }
});

exports.createPost = asyncHandler(async (req, res) => {
  const result = await postService.createOriginPost({
    body: req.body,
    userId: req.userId
  });

  logger.info(`Post created: ${result.post._id} by ${req.userId}, auditAction: ${result.auditInfo.action}`);

  return res.status(201).json({
    code: 0,
    data: result.post,
    ...buildAuditInfo(result.auditInfo)
  });
});

exports.createSuperEcho = asyncHandler(async (req, res) => {
  const result = await postService.createSuperEcho({
    parentId: req.params.id,
    body: req.body,
    userId: req.userId
  });

  const { post, auditInfo, parent } = result;

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

    notificationService.createSuperEchoNotification(
      parent.author,
      req.userId,
      parent._id,
      post._id,
      post.dynamicTag
    ).catch((e) => logger.error(`Create super echo notification error: ${e.message}`));
  }

  logger.info(`Super echo created: ${post._id} -> ${parent._id}, auditAction: ${auditInfo.action}`);

  return res.status(201).json({
    code: 0,
    data: post,
    ...buildAuditInfo(auditInfo)
  });
});

exports.toggleResonance = asyncHandler(async (req, res) => {
  try {
    const result = await resonanceService.toggleResonance({
      postId: req.params.id,
      userId: req.userId
    });

    return res.json({ code: 0, data: result });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ code: 1, message: 'Already resonated' });
    }
    throw error;
  }
});

exports.createComment = asyncHandler(async (req, res) => {
  const result = await commentService.createComment({
    postId: req.params.id,
    body: req.body,
    userId: req.userId
  });

  logger.info(`Comment created: ${result.comment._id} on ${req.params.id}, auditAction: ${result.auditInfo.action}`);

  return res.status(201).json({
    code: 0,
    data: result.comment,
    ...buildAuditInfo(result.auditInfo)
  });
});

exports.createCommentReply = asyncHandler(async (req, res) => {
  const result = await commentService.createCommentReply({
    postId: req.params.id,
    commentId: req.params.commentId,
    body: req.body,
    userId: req.userId
  });

  logger.info(`Comment reply created: ${result.reply._id} -> ${req.params.commentId}, auditAction: ${result.auditInfo.action}`);

  return res.status(201).json({
    code: 0,
    data: result.reply,
    ...buildAuditInfo(result.auditInfo)
  });
});

exports.getMyPosts = asyncHandler(async (req, res) => {
  const list = await postService.getMyPosts(req.userId);
  return res.json({ code: 0, data: list });
});

exports.updatePost = asyncHandler(async (req, res) => {
  const result = await postService.updatePost({
    postId: req.params.id,
    body: req.body,
    userId: req.userId
  });

  logger.info(`Post updated: ${req.params.id} by ${req.userId}, auditAction: ${result.auditInfo.action}`);

  return res.json({
    code: 0,
    data: result.updatedPost,
    ...buildAuditInfo(result.auditInfo)
  });
});

exports.deletePost = asyncHandler(async (req, res) => {
  await postService.deletePost({
    postId: req.params.id,
    userId: req.userId
  });

  logger.info(`Post deleted: ${req.params.id} by ${req.userId}`);

  return res.json({ code: 0, data: { message: 'Post deleted successfully' } });
});
