const jwt = require('jsonwebtoken');
const config = require('../config');

const signToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString()
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn
    }
  );

const verifyToken = (token) => jwt.verify(token, config.jwtSecret);

const extractBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return '';
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (!/^Bearer$/i.test(scheme) || !token) {
    return '';
  }

  return token;
};

module.exports = {
  signToken,
  verifyToken,
  extractBearerToken
};
