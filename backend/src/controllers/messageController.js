const messageService = require('../services/messageService');
const revealService = require('../services/revealService');
const { asyncHandler, sendSuccess } = require('../utils/errors');
const {
  processContentAudit,
  buildTempNicknameAuditFields
} = require('../utils/auditHelper');

const buildAuditInfo = (auditInfo) => ({
  auditInfo: {
    action: auditInfo.action,
    matchedWords: auditInfo.matchedWords
  }
});

exports.getConversations = asyncHandler(async (req, res) => {
  const result = await messageService.getConversations(req.userId);
  return sendSuccess(res, result);
});

exports.getConversationMessages = asyncHandler(async (req, res) => {
  const result = await messageService.getConversationMessages({
    conversationId: req.params.conversationId,
    userId: req.userId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50)
  });
  return sendSuccess(res, result);
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const result = await messageService.sendMessage({
    senderId: req.userId,
    receiverId: req.body.receiverId,
    senderDynamicTag: req.body.senderDynamicTag,
    content: req.body.content,
    postId: req.body.postId,
    tempNickname: req.body.tempNickname
  });

  return res.status(201).json({
    code: 0,
    data: result.message,
    ...buildAuditInfo(result.auditInfo)
  });
});

exports.requestReveal = asyncHandler(async (req, res) => {
  const result = await revealService.requestReveal({
    userId: req.userId,
    otherUserId: req.body.otherUserId
  });
  return sendSuccess(res, result);
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const result = await messageService.getUnreadCount(req.userId);
  return sendSuccess(res, result);
});

exports.setTempNickname = asyncHandler(async (req, res) => {
  const result = await revealService.setTempNickname({
    userId: req.userId,
    otherUserId: req.body.otherUserId,
    tempNickname: req.body.tempNickname,
    auditHelper: {
      processContentAudit,
      buildTempNicknameAuditFields
    }
  });
  return sendSuccess(res, result);
});
