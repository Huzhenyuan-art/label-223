const mongoose = require('mongoose');
const { Message, User, Post, Resonance, RevealDecision } = require('../models');
const logger = require('../utils/logger');
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError
} = require('../utils/errors');
const {
  processContentAudit,
  buildMessageAuditFields,
  buildTempNicknameAuditFields,
  buildAuditBlockedResponse
} = require('../utils/auditHelper');
const revealService = require('./revealService');

const _getPushUnread = () => {
  const { pushUnread } = require('../websocket');
  return pushUnread;
};

const _validateFirstMessage = async ({ senderId, receiverId, postId }) => {
  if (!postId) {
    throw BadRequestError('First private wave must be initiated from a resonated post');
  }

  const post = await Post.findById(postId).select('author').lean();
  if (!post) {
    throw NotFoundError('Referenced post not found');
  }

  if (post.author.toString() !== receiverId.toString()) {
    throw BadRequestError('First private wave must target the author of the resonated post');
  }

  const resonated = await Resonance.exists({ post: post._id, user: senderId });
  if (!resonated) {
    throw BadRequestError('Please resonate with the post before sending private wave');
  }

  return post._id;
};

const _setTempNicknameIfProvided = async ({
  senderId,
  receiverId,
  conversationId,
  tempNickname
}) => {
  if (!tempNickname || typeof tempNickname !== 'string') {
    return;
  }

  const trimmed = tempNickname.trim().slice(0, 24);
  if (!trimmed) {
    return;
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildTempNicknameAuditFields(trimmed),
    type: 'tempNickname',
    userId: senderId,
    targetId: conversationId
  });

  if (auditResult.blocked) {
    return;
  }

  const finalNickname = (auditResult.finalFields?.tempNickname || trimmed).slice(0, 24);

  await RevealDecision.findOneAndUpdate(
    { conversationId },
    {
      $setOnInsert: {
        users: [senderId, receiverId],
        revealed: false,
        unlockedAt: null,
        agreedBy: []
      },
      $set: {
        [`tempNicknames.${senderId.toString()}`]: finalNickname
      }
    },
    { upsert: true, new: true }
  );
};

const sendMessage = async ({
  senderId,
  receiverId,
  senderDynamicTag,
  content,
  postId,
  tempNickname
}) => {
  if (senderId.toString() === receiverId.toString()) {
    throw BadRequestError('Cannot message yourself');
  }

  const conversationId = Message.generateConversationId(senderId, receiverId);

  const [receiver, messageCount] = await Promise.all([
    User.findById(receiverId).select('_id').lean(),
    Message.countDocuments({ conversationId })
  ]);

  if (!receiver) {
    throw NotFoundError('Receiver not found');
  }

  let sourcePost = null;

  if (messageCount === 0) {
    sourcePost = await _validateFirstMessage({ senderId, receiverId, postId });
  } else if (postId) {
    const post = await Post.findById(postId).select('author').lean();
    if (post) {
      sourcePost = post._id;
    }
  }

  const auditResult = await processContentAudit({
    fieldsMap: buildMessageAuditFields({ senderDynamicTag, content }),
    type: 'message',
    userId: senderId,
    targetId: conversationId
  });

  if (auditResult.blocked) {
    throw buildAuditBlockedResponse(
      auditResult.matchedWords,
      '消息包含违规信息，无法发送'
    );
  }

  const { finalFields } = auditResult;

  const message = await Message.create({
    conversationId,
    sender: senderId,
    receiver: receiverId,
    senderDynamicTag: finalFields.senderDynamicTag,
    content: finalFields.content,
    sourcePost
  });

  await message.populate([
    { path: 'sender', select: 'nickname avatar' },
    { path: 'receiver', select: 'nickname avatar' },
    { path: 'sourcePost', select: 'title dynamicTag' }
  ]);

  await _setTempNicknameIfProvided({
    senderId,
    receiverId,
    conversationId,
    tempNickname
  });

  logger.info(`Message sent: ${message._id}, auditAction: ${auditResult.action}`);

  const pushUnread = _getPushUnread();
  if (pushUnread) {
    pushUnread(receiverId).catch((e) =>
      logger.error(`Push unread on HTTP send error: ${e.message}`)
    );
  }

  return { message, auditInfo: auditResult, isNewConversation: messageCount === 0 };
};

const getUnreadCount = async (userId) => {
  const count = await Message.countDocuments({
    receiver: userId,
    read: false
  });

  return { count };
};

const getConversations = async (userId) => {
  const conversations = await Message.aggregate([
    {
      $match: {
        $or: [{ sender: userId }, { receiver: userId }]
      }
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$receiver', userId] },
                  { $eq: ['$read', false] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { 'lastMessage.createdAt': -1 } }
  ]);

  if (!conversations.length) {
    return [];
  }

  const userIdStr = userId.toString();
  const conversationPairs = new Array(conversations.length);
  const otherUserIdSet = new Set();

  for (let i = 0; i < conversations.length; i++) {
    const item = conversations[i];
    const isSender = item.lastMessage.sender.toString() === userIdStr;
    const otherUserId = isSender ? item.lastMessage.receiver : item.lastMessage.sender;
    const otherUserIdStr = otherUserId.toString();

    conversationPairs[i] = {
      conversationId: item._id,
      userId,
      otherUserId
    };

    otherUserIdSet.add(otherUserIdStr);
  }

  const otherUserIds = [...otherUserIdSet].map((id) => new mongoose.Types.ObjectId(id));

  const [otherUsers, revealStatuses] = await Promise.all([
    User.find({ _id: { $in: otherUserIds } }).select('nickname avatar').lean(),
    revealService.getRevealStatusBatch(conversationPairs)
  ]);

  const userMap = new Map(otherUsers.map((u) => [u._id.toString(), u]));

  const result = new Array(conversations.length);
  for (let i = 0; i < conversations.length; i++) {
    const item = conversations[i];
    const { otherUserId } = conversationPairs[i];
    const otherUserIdStr = otherUserId.toString();
    const otherUser = userMap.get(otherUserIdStr);
    const reveal = revealStatuses[i];

    const otherDisplayName = revealService.getOtherDisplayName(reveal, otherUserId);
    const userView = reveal.revealed
      ? {
          _id: otherUserId,
          nickname: otherUser?.nickname || '同频回声',
          avatar: otherUser?.avatar || ''
        }
      : {
          _id: otherUserId,
          nickname: otherDisplayName || '同频回声',
          avatar: ''
        };

    result[i] = {
      conversationId: item._id,
      unreadCount: item.unreadCount,
      lastMessage: item.lastMessage,
      user: userView,
      reveal
    };
  }

  return result;
};

const getConversationMessages = async ({ conversationId, userId, page, limit }) => {
  const userIdStr = userId.toString();

  if (!conversationId.includes(userIdStr)) {
    throw ForbiddenError('Forbidden conversation');
  }

  const [idA, idB] = conversationId.split('_');
  const otherUserId = idA === userIdStr ? idB : idA;

  const [list, reveal] = await Promise.all([
    Message.find({ conversationId })
      .populate('sender', 'nickname avatar')
      .populate('receiver', 'nickname avatar')
      .populate('sourcePost', 'title dynamicTag')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    revealService.getRevealStatus(conversationId, userId, otherUserId)
  ]);

  await Message.updateMany(
    { conversationId, receiver: userId, read: false },
    { read: true }
  );

  const pushUnread = _getPushUnread();
  if (pushUnread) {
    pushUnread(userId).catch((e) =>
      logger.error(`Push unread on get messages error: ${e.message}`)
    );
  }

  const otherTempName = reveal.tempNicknames?.[otherUserId] || '同频回声';
  let maskedList;

  if (reveal.revealed) {
    maskedList = list;
  } else {
    maskedList = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const senderId = item.sender?._id?.toString?.() || '';
      const receiverId = item.receiver?._id?.toString?.() || '';
      const mine = senderId === userIdStr || receiverId === userIdStr;

      if (!mine) {
        maskedList[i] = item;
        continue;
      }

      const maskedSender = senderId === userIdStr
        ? item.sender
        : { ...item.sender, nickname: otherTempName, avatar: '' };
      const maskedReceiver = receiverId === userIdStr
        ? item.receiver
        : { ...item.receiver, nickname: otherTempName, avatar: '' };

      maskedList[i] = {
        ...item,
        sender: maskedSender,
        receiver: maskedReceiver
      };
    }
  }

  return {
    list: maskedList.reverse(),
    reveal
  };
};

module.exports = {
  sendMessage,
  getUnreadCount,
  getConversations,
  getConversationMessages
};
