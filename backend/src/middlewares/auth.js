const { User } = require('../models');
const logger = require('../utils/logger');
const { extractBearerToken, verifyToken } = require('../utils/auth');

const resolveUser = async (req) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload?.sub) {
    return null;
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    return null;
  }

  return user;
};

const auth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ code: 1, message: 'Unauthorized' });
    }

    req.userId = user._id;
    req.user = user;
    return next();
  } catch (error) {
    logger.error(`Auth error: ${error.message}`);
    return res.status(401).json({ code: 1, message: 'Unauthorized' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (user) {
      req.userId = user._id;
      req.user = user;
    }

    return next();
  } catch (error) {
    return next();
  }
};

const isPremiumActive = (premium) => {
  if (!premium || !premium.isActive || !premium.expireAt) {
    return false;
  }
  return new Date(premium.expireAt).getTime() > Date.now();
};

const requirePremium = (req, res, next) => {
  const user = req.user;
  if (!user || !isPremiumActive(user.premium)) {
    return res.status(403).json({
      code: 2,
      message: '该功能为会员专属，请先开通会员'
    });
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  const user = req.user;
  if (!user || !user.isAdmin) {
    return res.status(403).json({
      code: 3,
      message: '需要管理员权限'
    });
  }
  return next();
};

module.exports = {
  auth,
  optionalAuth,
  requirePremium,
  requireAdmin
};
