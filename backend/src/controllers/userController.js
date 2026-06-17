const { asyncHandler, sendSuccess } = require('../utils/errors');
const userService = require('../services/userService');
const islandService = require('../services/islandService');
const favoriteService = require('../services/favoriteService');
const resonanceNotificationService = require('../services/resonanceNotificationService');
const insightService = require('../services/insightService');

exports.register = asyncHandler(async (req, res) => {
  const result = await userService.register({
    nickname: req.body.nickname,
    account: req.body.account,
    password: req.body.password
  });
  return res.status(201).json({ code: 0, data: result });
});

exports.login = asyncHandler(async (req, res) => {
  const result = await userService.login({
    account: req.body.account,
    password: req.body.password
  });
  return res.json({ code: 0, data: result });
});

exports.getIsland = asyncHandler(async (req, res) => {
  const result = await islandService.getIsland(req.userId);
  return sendSuccess(res, result);
});

exports.toggleFavorite = asyncHandler(async (req, res) => {
  const result = await favoriteService.toggleFavorite(req.userId, req.params.postId);
  return sendSuccess(res, result);
});

exports.getFavoritesByTag = asyncHandler(async (req, res) => {
  const result = await favoriteService.buildFavoritesByTag(req.userId);
  return sendSuccess(res, result);
});

exports.batchRemoveFavorites = asyncHandler(async (req, res) => {
  const result = await favoriteService.batchRemoveFavorites(req.userId, req.body.postIds);
  return sendSuccess(res, result);
});

exports.searchFavorites = asyncHandler(async (req, res) => {
  const result = await favoriteService.searchFavorites(
    req.userId,
    req.query.keyword,
    req.query.tag
  );
  return sendSuccess(res, result);
});

exports.getPublicProfile = asyncHandler(async (req, res) => {
  const result = await userService.getPublicProfile(req.userId, req.params.id);
  return sendSuccess(res, result);
});

exports.getInsightReport = asyncHandler(async (req, res) => {
  const result = await insightService.getInsightReport(req.userId);
  return sendSuccess(res, result);
});

exports.updateTagSkin = asyncHandler(async (req, res) => {
  const result = await userService.updateTagSkin(req.userId, req.body.skin);
  return sendSuccess(res, result);
});

exports.getResonanceNotifications = asyncHandler(async (req, res) => {
  const result = await resonanceNotificationService.getResonanceNotifications(
    req.userId,
    Number(req.query.page || 1),
    Number(req.query.limit || 20)
  );
  return sendSuccess(res, result);
});

exports.getUnreadResonanceCount = asyncHandler(async (req, res) => {
  const result = await resonanceNotificationService.getUnreadResonanceCount(req.userId);
  return sendSuccess(res, result);
});

exports.markResonanceNotificationsRead = asyncHandler(async (req, res) => {
  const result = await resonanceNotificationService.markResonanceNotificationsRead(
    req.userId,
    req.body.notificationIds
  );
  return sendSuccess(res, result);
});
