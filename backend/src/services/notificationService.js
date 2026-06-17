const { Notification, User, Post, Comment, Message } = require('../models');
const logger = require('../utils/logger');

let _sendToUser = null;
const getSendToUser = () => {
  if (!_sendToUser) {
    const websocket = require('../websocket');
    _sendToUser = websocket.sendToUser;
  }
  return _sendToUser;
};

const NOTIFICATION_TYPES = {
  RESONANCE: 'resonance',
  COMMENT: 'comment',
  SUPER_ECHO: 'super_echo',
  REVEAL_REQUEST: 'reveal_request',
  REVEAL_SUCCESS: 'reveal_success'
};

const createNotification = async (options) => {
  try {
    const {
      recipient,
      type,
      sender,
      senderDynamicTag = '',
      post = null,
      comment = null,
      superEcho = null,
      conversationId = '',
      content = '',
      extra = {}
    } = options;

    if (!recipient || !type || !sender) {
      logger.warn('Create notification missing required fields');
      return null;
    }

    if (recipient.toString() === sender.toString()) {
      return null;
    }

    const notification = await Notification.create({
      recipient,
      type,
      sender,
      senderDynamicTag,
      post,
      comment,
      superEcho,
      conversationId,
      content,
      extra
    });

    try {
      pushNotificationUnread(recipient).catch((e) =>
        logger.error(`Push notification unread error: ${e.message}`)
      );
    } catch (e) {
      logger.error(`Push notification error: ${e.message}`);
    }

    return notification;
  } catch (error) {
    logger.error(`Create notification error: ${error.message}`);
    return null;
  }
};

const getUnreadCount = async (userId) => {
  try {
    const count = await Notification.countDocuments({
      recipient: userId,
      read: false
    });
    return count;
  } catch (error) {
    logger.error(`Get unread notification count error: ${error.message}`);
    return 0;
  }
};

const getUnreadCountByType = async (userId, type) => {
  try {
    const count = await Notification.countDocuments({
      recipient: userId,
      type,
      read: false
    });
    return count;
  } catch (error) {
    logger.error(`Get unread notification count by type error: ${error.message}`);
    return 0;
  }
};

const getUnreadCountsByType = async (userId) => {
  try {
    const result = await Notification.aggregate([
      { $match: { recipient: userId, read: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const counts = {
      resonance: 0,
      comment: 0,
      super_echo: 0,
      reveal_request: 0,
      reveal_success: 0,
      total: 0
    };

    for (const item of result) {
      counts[item._id] = item.count;
      counts.total += item.count;
    }

    return counts;
  } catch (error) {
    logger.error(`Get unread notification counts by type error: ${error.message}`);
    return {
      resonance: 0,
      comment: 0,
      super_echo: 0,
      reveal_request: 0,
      reveal_success: 0,
      total: 0
    };
  }
};

const getNotifications = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 20, type = null } = options;

    const filter = { recipient: userId };
    if (type) {
      filter.type = type;
    }

    const [list, total] = await Promise.all([
      Notification.find(filter)
        .populate('sender', 'nickname avatar')
        .populate('post', 'title dynamicTag coverImage')
        .populate('comment', 'content dynamicTag')
        .populate('superEcho', 'title dynamicTag')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter)
    ]);

    return {
      list,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`Get notifications error: ${error.message}`);
    return { list: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
  }
};

const markAsRead = async (userId, notificationIds = null) => {
  try {
    const filter = { recipient: userId, read: false };

    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      filter._id = { $in: notificationIds };
    }

    const result = await Notification.updateMany(filter, { read: true });

    try {
      pushNotificationUnread(userId).catch((e) =>
        logger.error(`Push notification unread after mark read error: ${e.message}`)
      );
    } catch (e) {
      // ignore
    }

    return result.modifiedCount;
  } catch (error) {
    logger.error(`Mark notifications read error: ${error.message}`);
    return 0;
  }
};

const markAllAsRead = async (userId) => {
  return markAsRead(userId, null);
};

const pushNotificationUnread = async (userId) => {
  try {
    const counts = await getUnreadCountsByType(userId);
    const sendToUser = getSendToUser();
    if (sendToUser) {
      sendToUser(userId.toString(), {
        type: 'notification_unread',
        data: counts
      });
    }
    return counts;
  } catch (error) {
    logger.error(`Push notification unread error: ${error.message}`);
    return null;
  }
};

const createResonanceNotification = async (recipientId, senderId, postId, senderDynamicTag = '') => {
  return createNotification({
    recipient: recipientId,
    type: NOTIFICATION_TYPES.RESONANCE,
    sender: senderId,
    senderDynamicTag,
    post: postId
  });
};

const createCommentNotification = async (recipientId, senderId, postId, commentId, senderDynamicTag = '', content = '') => {
  return createNotification({
    recipient: recipientId,
    type: NOTIFICATION_TYPES.COMMENT,
    sender: senderId,
    senderDynamicTag,
    post: postId,
    comment: commentId,
    content
  });
};

const createSuperEchoNotification = async (recipientId, senderId, postId, superEchoId, senderDynamicTag = '') => {
  return createNotification({
    recipient: recipientId,
    type: NOTIFICATION_TYPES.SUPER_ECHO,
    sender: senderId,
    senderDynamicTag,
    post: postId,
    superEcho: superEchoId
  });
};

const createRevealRequestNotification = async (recipientId, senderId, conversationId, senderDynamicTag = '') => {
  return createNotification({
    recipient: recipientId,
    type: NOTIFICATION_TYPES.REVEAL_REQUEST,
    sender: senderId,
    senderDynamicTag,
    conversationId
  });
};

const createRevealSuccessNotification = async (recipientId, senderId, conversationId, senderDynamicTag = '') => {
  return createNotification({
    recipient: recipientId,
    type: NOTIFICATION_TYPES.REVEAL_SUCCESS,
    sender: senderId,
    senderDynamicTag,
    conversationId
  });
};

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  getUnreadCount,
  getUnreadCountByType,
  getUnreadCountsByType,
  getNotifications,
  markAsRead,
  markAllAsRead,
  pushNotificationUnread,
  createResonanceNotification,
  createCommentNotification,
  createSuperEchoNotification,
  createRevealRequestNotification,
  createRevealSuccessNotification
};
