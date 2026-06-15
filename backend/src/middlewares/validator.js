const { body, param, query, validationResult } = require('express-validator');

const TAG_REGEX = /^[#＃][\u4e00-\u9fa5a-zA-Z0-9_]{1,20}$/;
const ACCOUNT_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{3,23}$/;
const hasStrongPassword = (value) =>
  typeof value === 'string' &&
  value.length >= 8 &&
  value.length <= 64 &&
  /[a-zA-Z]/.test(value) &&
  /\d/.test(value);

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      code: 1,
      message: '请求参数错误',
      errors: errors.array()
    });
  }
  return next();
};

const loginValidator = [
  body('account').notEmpty().isString().trim().matches(ACCOUNT_REGEX),
  body('password').notEmpty().custom(hasStrongPassword),
  validate
];

const registerValidator = [
  body('nickname').notEmpty().isString().trim().isLength({ min: 2, max: 20 }),
  body('account').notEmpty().isString().trim().matches(ACCOUNT_REGEX),
  body('password').notEmpty().custom(hasStrongPassword),
  validate
];

const createPostValidator = [
  body('title').optional().isString().trim().isLength({ max: 80 }),
  body('contentText').notEmpty().isString().trim().isLength({ min: 2, max: 2000 }),
  body('audioUrl').optional().isString().trim().isLength({ max: 500 }),
  body('linkUrl').optional().isString().trim().isLength({ max: 500 }),
  body('coverImage').optional().isString().trim().isLength({ max: 500 }),
  body('dynamicTag').notEmpty().isString().trim().matches(TAG_REGEX),
  body('tags').isArray({ min: 1, max: 5 }),
  body('tags.*').isString().trim().isLength({ min: 1, max: 20 }),
  validate
];

const superEchoValidator = [
  param('id').isMongoId(),
  body('contentText').notEmpty().isString().trim().isLength({ min: 2, max: 2000 }),
  body('dynamicTag').notEmpty().isString().trim().matches(TAG_REGEX),
  body('tags').isArray({ min: 1, max: 5 }),
  body('tags.*').isString().trim().isLength({ min: 1, max: 20 }),
  body('linkUrl').optional().isString().trim().isLength({ max: 500 }),
  validate
];

const postIdValidator = [
  param('id').isMongoId(),
  validate
];

const commentValidator = [
  param('id').isMongoId(),
  body('content').notEmpty().isString().trim().isLength({ min: 1, max: 500 }),
  body('dynamicTag').notEmpty().isString().trim().matches(TAG_REGEX),
  validate
];

const sendMessageValidator = [
  body('receiverId').notEmpty().isMongoId(),
  body('senderDynamicTag').notEmpty().isString().trim().matches(TAG_REGEX),
  body('content').notEmpty().isString().trim().isLength({ min: 1, max: 500 }),
  body('postId').optional().isMongoId(),
  validate
];

const revealValidator = [
  body('otherUserId').notEmpty().isMongoId(),
  validate
];

const tagSkinValidator = [
  body('skin').notEmpty().isIn(['ocean', 'sunset', 'mint', 'ink']),
  validate
];

const createPrivateGroupValidator = [
  body('name').notEmpty().isString().trim().isLength({ min: 2, max: 40 }),
  body('theme').notEmpty().isString().trim().isLength({ min: 2, max: 40 }),
  body('description').optional().isString().trim().isLength({ max: 200 }),
  validate
];

const checkoutValidator = [
  body('plan').notEmpty().isIn(['monthly', 'quarterly', 'yearly']),
  validate
];

const paginationValidator = [
  query('page').optional().isInt({ min: 1, max: 1000 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  validate
];

const updatePostValidator = [
  param('id').isMongoId(),
  body('title').optional().isString().trim().isLength({ max: 80 }),
  body('contentText').notEmpty().isString().trim().isLength({ min: 2, max: 2000 }),
  body('audioUrl').optional().isString().trim().isLength({ max: 500 }),
  body('linkUrl').optional().isString().trim().isLength({ max: 500 }),
  body('coverImage').optional().isString().trim().isLength({ max: 500 }),
  body('dynamicTag').notEmpty().isString().trim().matches(TAG_REGEX),
  body('tags').isArray({ min: 1, max: 5 }),
  body('tags.*').isString().trim().isLength({ min: 1, max: 20 }),
  validate
];

module.exports = {
  loginValidator,
  registerValidator,
  createPostValidator,
  updatePostValidator,
  superEchoValidator,
  postIdValidator,
  commentValidator,
  sendMessageValidator,
  revealValidator,
  tagSkinValidator,
  createPrivateGroupValidator,
  checkoutValidator,
  paginationValidator
};
