const { ResonanceNotification } = require('../models');

const getResonanceNotifications = async (userId, page = 1, limit = 20) => {
  const [list, total] = await Promise.all([
    ResonanceNotification.find({ recipient: userId })
      .populate('sender', 'nickname avatar dynamicTag')
      .populate('post', 'title dynamicTag')
      .populate('superEcho', 'title dynamicTag')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ResonanceNotification.countDocuments({ recipient: userId })
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
};

const getUnreadResonanceCount = async (userId) => {
  const count = await ResonanceNotification.countDocuments({
    recipient: userId,
    read: false
  });

  return { count };
};

const markResonanceNotificationsRead = async (userId, notificationIds) => {
  const filter = { recipient: userId, read: false };

  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    filter._id = { $in: notificationIds };
  }

  const result = await ResonanceNotification.updateMany(filter, { read: true });

  return { modifiedCount: result.modifiedCount };
};

module.exports = {
  getResonanceNotifications,
  getUnreadResonanceCount,
  markResonanceNotificationsRead
};
