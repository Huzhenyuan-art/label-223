const ERROR_CODES = {
  SUCCESS: 0,
  GENERIC: 1,
  PREMIUM_REQUIRED: 2,
  ADMIN_REQUIRED: 3,
  BANNED: 4,
  VALIDATION: 5,
  NOT_FOUND: 6,
  FORBIDDEN: 7,
  CONFLICT: 8
};

const HTTP_STATUS = {
  [ERROR_CODES.SUCCESS]: 200,
  [ERROR_CODES.GENERIC]: 500,
  [ERROR_CODES.PREMIUM_REQUIRED]: 403,
  [ERROR_CODES.ADMIN_REQUIRED]: 403,
  [ERROR_CODES.BANNED]: 403,
  [ERROR_CODES.VALIDATION]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.CONFLICT]: 409
};

class AppError extends Error {
  constructor(message, code = ERROR_CODES.GENERIC, httpStatus = null, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus || HTTP_STATUS[code] || 500;
    this.details = details;
    this.isAppError = true;
  }

  toJSON() {
    const result = { code: this.code, message: this.message };
    if (this.details !== null) {
      result.data = this.details;
    }
    return result;
  }
}

const BadRequestError = (message = '请求参数错误', details = null) =>
  new AppError(message, ERROR_CODES.VALIDATION, 400, details);

const UnauthorizedError = (message = 'Unauthorized') =>
  new AppError(message, ERROR_CODES.GENERIC, 401);

const ForbiddenError = (message = '无权限访问', code = ERROR_CODES.GENERIC) =>
  new AppError(message, code, 403);

const NotFoundError = (message = '资源不存在') =>
  new AppError(message, ERROR_CODES.NOT_FOUND, 404);

const ConflictError = (message = '资源冲突') =>
  new AppError(message, ERROR_CODES.GENERIC, 409);

const ServerError = (message = '服务器内部错误') =>
  new AppError(message, ERROR_CODES.GENERIC, 500);

const BannedError = (message = '账号已被封禁') =>
  new AppError(message, ERROR_CODES.BANNED, 403);

const PremiumRequiredError = (message = '该功能为会员专属，请先开通会员') =>
  new AppError(message, ERROR_CODES.PREMIUM_REQUIRED, 403);

const AdminRequiredError = (message = '需要管理员权限') =>
  new AppError(message, ERROR_CODES.ADMIN_REQUIRED, 403);

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const sendSuccess = (res, data = null, extra = {}) => {
  const payload = { code: ERROR_CODES.SUCCESS };
  if (data !== null && data !== undefined) {
    payload.data = data;
  }
  Object.assign(payload, extra);
  res.json(payload);
};

module.exports = {
  ERROR_CODES,
  HTTP_STATUS,
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServerError,
  BannedError,
  PremiumRequiredError,
  AdminRequiredError,
  asyncHandler,
  sendSuccess
};
