const mongoose = require('mongoose');
const { Post, TagChannel, UserTagSubscription, User } = require('../models');
const logger = require('../utils/logger');
const { sanitizeTags, isValidObjectId } = require('../utils/common');
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError
} = require('../utils/errors');
const {
  processContentAudit,
  buildPostAuditFields,
  buildAuditBlockedResponse
} = require('../utils/auditHelper');

const updateTagChannelsOnPostCreate = async (tags, userId) => {
  try {
    const now = new Date();
    for (const tag of tags) {
      const channel = await TagChannel.findOne({ tag });
      if (channel) {
        await TagChannel.updateOne(
          { tag },
          { $inc: { postCount: 1 }, $set: { lastPostAt: now } }
        );
      } else {
        await TagChannel.create({
          tag,
          displayName: tag,
          postCount: 1,
          lastPostAt: now,
          isActive: true
        });
      }

      await UserTagSubscription.updateMany(
        { tag, user: { $ne: userId } },
        { $inc: { unreadCount: 1 } }
      );
    }
  } catch (tagUpdateError) {
    logger.error(`Update tag channels error: ${tagUpdateError.message}`);
  }
};

const createPost = async ({ body, userId, type = 'origin', parentPostId = null }) => {
  const tags = sanitizeTags(body.tags);
  if (!tags.length) {
    throw BadRequestError('At least one tag is required');
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildPostAuditFields(body, tags),
    type: type === 'super_echo' ? 'super_echo' : 'post',
    userId,
    targetId: parentPostId
  });

  if (auditResult.blocked) {
    throw buildAuditBlockedResponse(
      auditResult.matchedWords,
      '内容包含违规信息，无法发布'
    );
  }

  const { finalFields } = auditResult;
  const finalTags = finalFields.tags
    ? sanitizeTags(finalFields.tags.split(' '))
    : tags;

  const author = await User.findById(userId).select('tagSkin').lean();

  const postData = {
    title: finalFields.title || '',
    contentText: finalFields.contentText,
    contentLink: body.linkUrl || '',
    dynamicTag: finalFields.dynamicTag,
    tags: finalTags,
    type,
    author: userId
  };

  if (type === 'origin') {
    postData.contentAudio = body.audioUrl || '';
    postData.coverImage = body.coverImage || '';
    postData.authorSkin = author?.tagSkin || 'ocean';
  }

  if (parentPostId) {
    postData.parentPost = parentPostId;
  }

  const post = await Post.create(postData);

  if (type === 'origin') {
    await updateTagChannelsOnPostCreate(finalTags, userId);
  }

  return { post, auditInfo: auditResult };
};

const createOriginPost = async ({ body, userId }) => {
  return createPost({ body, userId, type: 'origin' });
};

const createSuperEcho = async ({ parentId, body, userId }) => {
  if (!isValidObjectId(parentId)) {
    throw BadRequestError('Invalid post id');
  }

  const parent = await Post.findById(parentId);
  if (!parent) {
    throw NotFoundError('Parent post not found');
  }

  const result = await createPost({
    body,
    userId,
    type: 'super_echo',
    parentPostId: parent._id
  });

  await Post.findByIdAndUpdate(parent._id, { $inc: { superEchoCount: 1 } });

  return { ...result, parent };
};

const updatePost = async ({ postId, body, userId }) => {
  if (!isValidObjectId(postId)) {
    throw BadRequestError('Invalid post id');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  if (post.author.toString() !== userId.toString()) {
    throw ForbiddenError('No permission to edit this post');
  }

  if (post.type !== 'origin') {
    throw BadRequestError('Only origin posts can be edited');
  }

  const tags = sanitizeTags(body.tags);
  if (!tags.length) {
    throw BadRequestError('At least one tag is required');
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildPostAuditFields(body, tags),
    type: 'post',
    userId,
    targetId: post._id
  });

  if (auditResult.blocked) {
    throw buildAuditBlockedResponse(
      auditResult.matchedWords,
      '内容包含违规信息，无法保存'
    );
  }

  const { finalFields } = auditResult;
  const finalTags = finalFields.tags
    ? sanitizeTags(finalFields.tags.split(' '))
    : tags;

  const authorSkin = (await User.findById(userId).select('tagSkin').lean())?.tagSkin || 'ocean';

  const updatedPost = await Post.findByIdAndUpdate(
    postId,
    {
      title: finalFields.title || '',
      contentText: finalFields.contentText,
      contentAudio: body.audioUrl || '',
      contentLink: body.linkUrl || '',
      coverImage: body.coverImage || '',
      dynamicTag: finalFields.dynamicTag,
      tags: finalTags,
      authorSkin,
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );

  return { updatedPost, auditInfo: auditResult };
};

const deletePost = async ({ postId, userId }) => {
  if (!isValidObjectId(postId)) {
    throw BadRequestError('Invalid post id');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  if (post.author.toString() !== userId.toString()) {
    throw ForbiddenError('No permission to delete this post');
  }

  if (post.type !== 'origin') {
    throw BadRequestError('Only origin posts can be deleted');
  }

  const { Resonance, Comment } = require('../models');

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
};

const getMyPosts = async (userId) => {
  return Post.find({ author: userId })
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  createOriginPost,
  createSuperEcho,
  updatePost,
  deletePost,
  getMyPosts
};
