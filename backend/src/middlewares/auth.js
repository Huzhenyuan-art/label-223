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

module.exports = {
  auth,
  optionalAuth
};
