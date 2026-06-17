const { AppError, ERROR_CODES } = require('./errors');
const { auditMultipleFields } = require('../services/auditService');

const buildAuditBlockedResponse = (matchedWords, message) =>
  new AppError(message, ERROR_CODES.GENERIC, 400, { matchedWords });

const buildAuditInfo = (auditInfo) => ({
  auditInfo: {
    action: auditInfo.action,
    matchedWords: auditInfo.matchedWords
  }
});

const processContentAudit = async ({ fieldsMap, type, userId, targetId }) => {
  const auditResult = await auditMultipleFields({ fieldsMap, type, userId, targetId });

  if (auditResult.blocked) {
    return {
      blocked: true,
      matchedWords: auditResult.matchedWords,
      action: auditResult.action,
      finalFields: null
    };
  }

  const finalFields = auditResult.maskedFieldsMap || Object.fromEntries(
    Object.keys(fieldsMap).map((k) => [k, fieldsMap[k]])
  );

  return {
    blocked: false,
    matchedWords: auditResult.matchedWords,
    action: auditResult.action,
    finalFields
  };
};

const buildPostAuditFields = (body, tags) => ({
  title: body.title || '',
  contentText: body.contentText,
  dynamicTag: body.dynamicTag,
  tags: (tags || []).join(' ')
});

const buildCommentAuditFields = (body) => ({
  dynamicTag: body.dynamicTag,
  content: body.content
});

const buildMessageAuditFields = (body) => ({
  senderDynamicTag: body.senderDynamicTag,
  content: body.content
});

const buildTempNicknameAuditFields = (tempNickname) => ({
  tempNickname
});

module.exports = {
  buildAuditBlockedResponse,
  buildAuditInfo,
  processContentAudit,
  buildPostAuditFields,
  buildCommentAuditFields,
  buildMessageAuditFields,
  buildTempNicknameAuditFields
};
