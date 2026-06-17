const { User } = require('../models');
const logger = require('../utils/logger');
const { extractBearerToken, verifyToken } = require('../utils/auth');
const {
  BannedError,
  AdminRequiredError,
  PremiumRequiredError,
  UnauthorizedError
} = require('../utils/errors');
const { isPremiumActive } = require('../utils/common');

const resolveUser = async (req) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return null;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    return null;
  }

  if (!payload?.sub) {
    return null;
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return null;
  }

  return user;
};

const attachUserToRequest = (req, user) => {
  req.userId = user._id;
  req.user = user;
};

const auth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      throw UnauthorizedError();
    }

    if (user.status === 'banned') {
      throw BannedError();
    }

    attachUserToRequest(req, user);
    return next();
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    return next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user && user.status !== 'banned') {
      attachUserToRequest(req, user);
    }
    return next();
  } catch (error) {
    return next();
  }
};

const requirePremium = (req, res, next) => {
  if (!req.user || !isPremiumActive(req.user.premium)) {
    return next(PremiumRequiredError());
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(AdminRequiredError());
  }
  return next();
};

const adminAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      throw UnauthorizedError('请先登录');
    }

    if (!user.isAdmin) {
      throw AdminRequiredError();
    }

    if (user.status === 'banned') {
      throw BannedError();
    }

    attachUserToRequest(req, user);
    return next();
  } catch (error) {
    logger.error(`Admin auth error: ${error.message}`);
    return next(error);
  }
};

module.exports = {
  resolveUser,
  attachUserToRequest,
  auth,
  optionalAuth,
  requirePremium,
  requireAdmin,
  adminAuth
};
