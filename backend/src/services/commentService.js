const { Comment, Post } = require('../models');
const logger = require('../utils/logger');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { isValidObjectId } = require('../utils/common');
const { processContentAudit, buildCommentAuditFields, buildAuditBlockedResponse } = require('../utils/auditHelper');
const notificationService = require('./notificationService');

const createComment = async ({ postId, body, userId }) => {
  if (!isValidObjectId(postId)) {
    throw BadRequestError('Invalid post id');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildCommentAuditFields(body),
    type: 'comment',
    userId,
    targetId: post._id
  });

  if (auditResult.blocked) {
    throw buildAuditBlockedResponse(
      auditResult.matchedWords,
      '内容包含违规信息，无法发布'
    );
  }

  const { finalFields } = auditResult;

  const comment = await Comment.create({
    post: postId,
    user: userId,
    parentComment: null,
    dynamicTag: finalFields.dynamicTag,
    content: finalFields.content
  });

  await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

  await comment.populate('user', 'nickname avatar');

  if (post.author.toString() !== userId.toString()) {
    notificationService.createCommentNotification(
      post.author,
      userId,
      post._id,
      comment._id,
      finalFields.dynamicTag,
      finalFields.content
    ).catch((e) => logger.error(`Create comment notification error: ${e.message}`));
  }

  return { comment, auditInfo: auditResult };
};

const createCommentReply = async ({ postId, commentId, body, userId }) => {
  if (!isValidObjectId(postId)) {
    throw BadRequestError('Invalid post id');
  }
  if (!isValidObjectId(commentId)) {
    throw BadRequestError('Invalid comment id');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  const parentComment = await Comment.findById(commentId);
  if (!parentComment) {
    throw NotFoundError('Parent comment not found');
  }

  if (parentComment.parentComment) {
    throw BadRequestError('Only one level of reply is allowed');
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildCommentAuditFields(body),
    type: 'comment_reply',
    userId,
    targetId: commentId
  });

  if (auditResult.blocked) {
    throw buildAuditBlockedResponse(
      auditResult.matchedWords,
      '内容包含违规信息，无法发布'
    );
  }

  const { finalFields } = auditResult;

  const reply = await Comment.create({
    post: postId,
    user: userId,
    parentComment: commentId,
    dynamicTag: finalFields.dynamicTag,
    content: finalFields.content
  });

  await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

  await reply.populate('user', 'nickname avatar');
  await reply.populate('parentComment', '_id');

  const notifiedUsers = new Set();
  notifiedUsers.add(userId.toString());

  if (post.author.toString() !== userId.toString()) {
    notificationService.createCommentNotification(
      post.author,
      userId,
      post._id,
      reply._id,
      finalFields.dynamicTag,
      finalFields.content
    ).catch((e) => logger.error(`Create comment notification error: ${e.message}`));
    notifiedUsers.add(post.author.toString());
  }

  if (
    parentComment.user.toString() !== userId.toString() &&
    !notifiedUsers.has(parentComment.user.toString())
  ) {
    notificationService.createCommentNotification(
      parentComment.user,
      userId,
      post._id,
      reply._id,
      finalFields.dynamicTag,
      finalFields.content
    ).catch((e) => logger.error(`Create comment reply notification error: ${e.message}`));
  }

  return { reply, auditInfo: auditResult };
};

module.exports = {
  createComment,
  createCommentReply
};
