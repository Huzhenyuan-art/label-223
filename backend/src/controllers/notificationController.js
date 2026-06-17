const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

exports.getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const type = req.query.type || null;

    const result = await notificationService.getNotifications(userId, { page, limit, type });

    return res.json({
      code: 0,
      data: result
    });
  } catch (error) {
    logger.error(`Get notifications error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.userId;
    const count = await notificationService.getUnreadCount(userId);

    return res.json({ code: 0, data: { count } });
  } catch (error) {
    logger.error(`Get notification unread count error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getUnreadCountsByType = async (req, res) => {
  try {
    const userId = req.userId;
    const counts = await notificationService.getUnreadCountsByType(userId);

    return res.json({ code: 0, data: counts });
  } catch (error) {
    logger.error(`Get notification unread counts by type error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const { notificationIds } = req.body;

    const modifiedCount = await notificationService.markAsRead(userId, notificationIds);

    return res.json({
      code: 0,
      data: { modifiedCount }
    });
  } catch (error) {
    logger.error(`Mark notifications read error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const modifiedCount = await notificationService.markAllAsRead(userId);

    return res.json({
      code: 0,
      data: { modifiedCount }
    });
  } catch (error) {
    logger.error(`Mark all notifications read error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
