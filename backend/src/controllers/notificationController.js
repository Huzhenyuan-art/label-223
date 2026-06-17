const notificationService = require('../services/notificationService');
const { asyncHandler, sendSuccess } = require('../utils/errors');

exports.getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getNotifications(req.userId, {
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
    type: req.query.type || null
  });
  return sendSuccess(res, result);
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.userId);
  return sendSuccess(res, { count });
});

exports.getUnreadCountsByType = asyncHandler(async (req, res) => {
  const counts = await notificationService.getUnreadCountsByType(req.userId);
  return sendSuccess(res, counts);
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const modifiedCount = await notificationService.markAsRead(
    req.userId,
    req.body.notificationIds
  );
  return sendSuccess(res, { modifiedCount });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const modifiedCount = await notificationService.markAllAsRead(req.userId);
  return sendSuccess(res, { modifiedCount });
});
