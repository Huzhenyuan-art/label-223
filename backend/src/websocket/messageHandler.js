const mongoose = require('mongoose');
const { Message } = require('../models');
const logger = require('../utils/logger');
const { sendToUser, pushUnread } = require('./wsHelpers');
const messageService = require('../services/messageService');
const revealService = require('../services/revealService');
const {
  processContentAudit,
  buildTempNicknameAuditFields
} = require('../utils/auditHelper');

const _sendError = (ws, message, extra = {}) => {
  ws.send(JSON.stringify({ type: 'error', message, ...extra }));
};

const handleSendMessage = async (ws, authedUserId, msg) => {
  try {
    const result = await messageService.sendMessage({
      senderId: authedUserId,
      receiverId: msg.receiverId,
      senderDynamicTag: msg.senderDynamicTag,
      content: msg.content,
      postId: msg.postId,
      tempNickname: msg.tempNickname
    });

    const payload = {
      type: 'message',
      data: result.message,
      auditInfo: {
        action: result.auditInfo.action,
        matchedWords: result.auditInfo.matchedWords
      }
    };

    ws.send(JSON.stringify(payload));
    sendToUser(msg.receiverId, payload);
    pushUnread(msg.receiverId).catch((e) =>
      logger.error(`Push unread on WS message error: ${e.message}`)
    );

    if (result.isNewConversation) {
      return;
    }

    const conversationId = result.message.conversationId;
    const messageCount = await Message.countDocuments({ conversationId });
    if (messageCount >= 6) {
      const [idA, idB] = conversationId.split('_');
      const otherUserId = idA === authedUserId ? idB : idA;
      const counts = await Message.aggregate([
        { $match: { conversationId } },
        { $group: { _id: '$sender', count: { $sum: 1 } } }
      ]);
      const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));
      const myCount = countMap.get(authedUserId) || 0;
      const otherCount = countMap.get(otherUserId) || 0;
      if (myCount >= 3 && otherCount >= 3) {
        const revealPayload = {
          type: 'reveal',
          data: {
            conversationId,
            eligible: true,
            myCount,
            otherCount,
            revealed: false
          }
        };
        ws.send(JSON.stringify(revealPayload));
        sendToUser(otherUserId, revealPayload);
      }
    }
  } catch (error) {
    logger.error(`WS handleSendMessage error: ${error.message}`);
    _sendError(ws, error.message || '消息发送失败', {
      matchedWords: error.details?.matchedWords
    });
  }
};

const handleReadAck = async (ws, authedUserId, msg) => {
  if (!msg.conversationId) {
    return;
  }

  const result = await Message.updateMany(
    { conversationId: msg.conversationId, receiver: authedUserId, read: false },
    { read: true }
  );

  const [idA, idB] = msg.conversationId.split('_');
  const otherUserId = idA === authedUserId ? idB : idA;

  sendToUser(otherUserId, {
    type: 'read_ack',
    data: {
      conversationId: msg.conversationId,
      readCount: result.modifiedCount
    }
  });

  pushUnread(authedUserId).catch((e) =>
    logger.error(`Push unread on read_ack error: ${e.message}`)
  );
  pushUnread(otherUserId).catch((e) =>
    logger.error(`Push unread on read_ack other error: ${e.message}`)
  );
};

const handleTempNickname = async (ws, authedUserId, msg) => {
  const otherUserId = msg.otherUserId;
  if (!otherUserId || authedUserId === otherUserId.toString()) {
    _sendError(ws, 'Invalid target user');
    return;
  }

  const { User } = require('../models');
  const otherUser = await User.findById(otherUserId);
  if (!otherUser) {
    _sendError(ws, 'Other user not found');
    return;
  }

  const trimmed = (msg.tempNickname || '').toString().trim().slice(0, 24);
  if (!trimmed) {
    _sendError(ws, 'tempNickname cannot be empty');
    return;
  }

  try {
    await revealService.setTempNickname({
      userId: authedUserId,
      otherUserId,
      tempNickname: trimmed,
      auditHelper: {
        processContentAudit,
        buildTempNicknameAuditFields
      }
    });
  } catch (error) {
    _sendError(ws, error.message || '设置临时昵称失败', {
      matchedWords: error.details?.matchedWords
    });
  }
};

module.exports = {
  handleSendMessage,
  handleReadAck,
  handleTempNickname
};
