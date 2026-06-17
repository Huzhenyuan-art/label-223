const logger = require('../utils/logger');
const { AppError, ERROR_CODES } = require('../utils/errors');

const notFoundHandler = (req, res) => {
  res.status(404).json({ code: ERROR_CODES.GENERIC, message: 'Not Found' });
};

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    logger.warn(
      `[AppError] ${req.method} ${req.path} - code: ${err.code}, status: ${err.httpStatus}, message: ${err.message}`
    );
    return res.status(err.httpStatus).json(err.toJSON());
  }

  if (err?.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      code: ERROR_CODES.VALIDATION,
      message: messages.length ? messages.join('; ') : 'Validation error'
    });
  }

  if (err?.name === 'CastError' && err?.kind === 'ObjectId') {
    return res.status(400).json({
      code: ERROR_CODES.VALIDATION,
      message: 'Invalid ID format'
    });
  }

  if (err?.code === 11000) {
    return res.status(409).json({
      code: ERROR_CODES.CONFLICT,
      message: 'Duplicate entry'
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      code: ERROR_CODES.VALIDATION,
      message: 'Invalid JSON payload'
    });
  }

  logger.error(
    `[UnhandledError] ${req.method} ${req.path} - ${err.message}\n${err.stack}`
  );

  return res.status(500).json({
    code: ERROR_CODES.GENERIC,
    message: 'Internal server error'
  });
};

module.exports = {
  notFoundHandler,
  globalErrorHandler
};
