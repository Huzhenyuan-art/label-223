const mongoose = require('mongoose');
const { Message, RevealDecision, User } = require('../models');
const logger = require('../utils/logger');
const {
  AppError,
  BadRequestError,
  NotFoundError,
  ForbiddenError
} = require('../utils/errors');
const { buildAuditBlockedResponse } = require('../utils/auditHelper');
const notificationService = require('./notificationService');

const _getSendToUser = () => {
  const { sendToUser } = require('../websocket');
  return sendToUser;
};

const AUTO_REVEAL_HOURS = 48;

const _normalizeTempNicknamesMap = (tempNicknamesRaw) => {
  if (tempNicknamesRaw instanceof Map) {
    return Object.fromEntries(tempNicknamesRaw);
  }
  return tempNicknamesRaw || {};
};

const _processAutoReveal = async (
  decision,
  conversationId,
  userId,
  otherUserId,
  myAgreed,
  otherAgreed,
  requestedAt
) => {
  if (decision?.revealed || !myAgreed || otherAgreed || !requestedAt) {
    return null;
  }

  const deadline = new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000);
  if (new Date() < deadline) {
    return null;
  }

  await RevealDecision.updateOne(
    { conversationId },
    {
      $addToSet: { agreedBy: otherUserId },
      $set: { revealed: true, unlockedAt: new Date() }
    }
  );

  notificationService.createRevealSuccessNotification(
    userId,
    otherUserId,
    conversationId,
    ''
  ).catch((e) => logger.error(`Auto reveal success notification error: ${e.message}`));

  notificationService.createRevealSuccessNotification(
    otherUserId,
    userId,
    conversationId,
    ''
  ).catch((e) => logger.error(`Auto reveal success notification error: ${e.message}`));

  const revealPayload = { type: 'reveal', data: { conversationId, revealed: true } };
  sendToUser(userId.toString(), revealPayload);
  sendToUser(otherUserId.toString(), revealPayload);

  return { revealed: true, unlockedAt: new Date() };
};

const getRevealStatus = async (conversationId, userId, otherUserId) => {
  const userIdStr = userId.toString();
  const otherUserIdStr = otherUserId.toString();

  const [counts, decision] = await Promise.all([
    Message.aggregate([
      { $match: { conversationId } },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]),
    RevealDecision.findOne({ conversationId }).lean()
  ]);

  const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));
  const myCount = countMap.get(userIdStr) || 0;
  const otherCount = countMap.get(otherUserIdStr) || 0;
  const eligible = myCount >= 3 && otherCount >= 3;

  const agreedBySet = new Set((decision?.agreedBy || []).map((id) => id.toString()));
  const myAgreed = agreedBySet.has(userIdStr);
  const otherAgreed = agreedBySet.has(otherUserIdStr);

  let revealed = Boolean(decision?.revealed);
  let unlockedAt = decision?.unlockedAt || null;
  const requestedAt = decision?.requestedAt || null;

  const autoResult = await _processAutoReveal(
    decision,
    conversationId,
    userId,
    otherUserId,
    myAgreed,
    otherAgreed,
    requestedAt
  );

  if (autoResult) {
    revealed = autoResult.revealed;
    unlockedAt = autoResult.unlockedAt;
  }

  const waitingForOther = myAgreed && !otherAgreed && !revealed;
  const otherRequestedReveal = otherAgreed && !myAgreed && !revealed;
  const autoRevealDeadline = (!revealed && requestedAt && waitingForOther)
    ? new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000)
    : null;

  const tempNicknames = _normalizeTempNicknamesMap(decision?.tempNicknames);

  return {
    eligible,
    myCount,
    otherCount,
    myAgreed,
    otherAgreed,
    revealed,
    unlockedAt,
    requestedAt,
    waitingForOther,
    otherRequestedReveal,
    autoRevealDeadline,
    autoRevealHours: AUTO_REVEAL_HOURS,
    tempNicknames
  };
};

const getRevealStatusBatch = async (conversationIdOtherPairs) => {
  if (!conversationIdOtherPairs.length) {
    return [];
  }

  const conversationIds = conversationIdOtherPairs.map((p) => p.conversationId);

  const [messageCountsAgg, decisions] = await Promise.all([
    Message.aggregate([
      { $match: { conversationId: { $in: conversationIds } } },
      { $group: { _id: { conversationId: '$conversationId', sender: '$sender' }, count: { $sum: 1 } } }
    ]),
    RevealDecision.find({ conversationId: { $in: conversationIds } }).lean()
  ]);

  const countsByConversation = new Map();
  messageCountsAgg.forEach((row) => {
    const cid = row._id.conversationId;
    if (!countsByConversation.has(cid)) {
      countsByConversation.set(cid, new Map());
    }
    countsByConversation.get(cid).set(row._id.sender.toString(), row.count);
  });

  const decisionsByConversation = new Map(
    decisions.map((d) => [d.conversationId, d])
  );

  const results = [];
  const autoRevealUpdates = [];

  for (const { conversationId, userId, otherUserId } of conversationIdOtherPairs) {
    const userIdStr = userId.toString();
    const otherUserIdStr = otherUserId.toString();

    const countMap = countsByConversation.get(conversationId) || new Map();
    const myCount = countMap.get(userIdStr) || 0;
    const otherCount = countMap.get(otherUserIdStr) || 0;
    const eligible = myCount >= 3 && otherCount >= 3;

    const decision = decisionsByConversation.get(conversationId);
    const agreedBySet = new Set((decision?.agreedBy || []).map((id) => id.toString()));
    const myAgreed = agreedBySet.has(userIdStr);
    const otherAgreed = agreedBySet.has(otherUserIdStr);

    let revealed = Boolean(decision?.revealed);
    let unlockedAt = decision?.unlockedAt || null;
    const requestedAt = decision?.requestedAt || null;

    if (!revealed && myAgreed && !otherAgreed && requestedAt) {
      const deadline = new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000);
      if (new Date() >= deadline) {
        revealed = true;
        unlockedAt = new Date();
        autoRevealUpdates.push({ conversationId, userId, otherUserId });
      }
    }

    const waitingForOther = myAgreed && !otherAgreed && !revealed;
    const otherRequestedReveal = otherAgreed && !myAgreed && !revealed;
    const autoRevealDeadline = (!revealed && requestedAt && waitingForOther)
      ? new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000)
      : null;

    const tempNicknames = _normalizeTempNicknamesMap(decision?.tempNicknames);

    results.push({
      eligible,
      myCount,
      otherCount,
      myAgreed,
      otherAgreed,
      revealed,
      unlockedAt,
      requestedAt,
      waitingForOther,
      otherRequestedReveal,
      autoRevealDeadline,
      autoRevealHours: AUTO_REVEAL_HOURS,
      tempNicknames
    });
  }

  if (autoRevealUpdates.length > 0) {
    for (const { conversationId, userId, otherUserId } of autoRevealUpdates) {
      try {
        await RevealDecision.updateOne(
          { conversationId },
          {
            $addToSet: { agreedBy: otherUserId },
            $set: { revealed: true, unlockedAt: new Date() }
          }
        );

        notificationService.createRevealSuccessNotification(
          userId,
          otherUserId,
          conversationId,
          ''
        ).catch((e) => logger.error(`Batch auto reveal notification error: ${e.message}`));

        notificationService.createRevealSuccessNotification(
          otherUserId,
          userId,
          conversationId,
          ''
        ).catch((e) => logger.error(`Batch auto reveal notification error: ${e.message}`));

        const revealPayload = { type: 'reveal', data: { conversationId, revealed: true } };
        sendToUser(userId.toString(), revealPayload);
        sendToUser(otherUserId.toString(), revealPayload);
      } catch (err) {
        logger.error(`Batch auto reveal update error: ${err.message}`);
      }
    }
  }

  return results;
};

const getOtherDisplayName = (reveal, otherUserId, fallback = '同频回声') => {
  if (reveal.revealed) {
    return null;
  }
  return reveal.tempNicknames?.[otherUserId.toString()] || fallback;
};

const requestReveal = async ({ userId, otherUserId }) => {
  if (userId.toString() === otherUserId.toString()) {
    throw BadRequestError('Invalid target user');
  }

  const otherUser = await User.findById(otherUserId);
  if (!otherUser) {
    throw NotFoundError('Other user not found');
  }

  const conversationId = Message.generateConversationId(userId, otherUserId);
  const status = await getRevealStatus(conversationId, userId, otherUserId);

  if (!status.eligible) {
    throw new AppError(
      'Need at least 3 messages from both users before reveal',
      1,
      400,
      status
    );
  }

  const existingDecision = await RevealDecision.findOne({ conversationId }).lean();
  const existingAgreedBy = new Set(
    (existingDecision?.agreedBy || []).map((id) => id.toString())
  );
  const userAlreadyAgreed = existingAgreedBy.has(userId.toString());
  const otherAlreadyAgreed = existingAgreedBy.has(otherUserId.toString());

  const updateOps = {
    $setOnInsert: {
      users: [userId, otherUserId],
      revealed: false,
      unlockedAt: null
    },
    $addToSet: { agreedBy: userId }
  };

  if (!existingDecision || !existingDecision.requestedAt) {
    updateOps.$set = { requestedAt: new Date() };
  }

  const decision = await RevealDecision.findOneAndUpdate(
    { conversationId },
    updateOps,
    { upsert: true, new: true }
  );

  const agreedBy = new Set(
    (decision.agreedBy || []).map((item) => item.toString())
  );
  const allAgreed = agreedBy.has(userId.toString()) && agreedBy.has(otherUserId.toString());

  if (allAgreed && !decision.revealed) {
    decision.revealed = true;
    decision.unlockedAt = new Date();
    await decision.save();

    notificationService.createRevealSuccessNotification(
      userId,
      otherUserId,
      conversationId,
      ''
    ).catch((e) => logger.error(`Create reveal success notification error: ${e.message}`));

    notificationService.createRevealSuccessNotification(
      otherUserId,
      userId,
      conversationId,
      ''
    ).catch((e) => logger.error(`Create reveal success notification error: ${e.message}`));
  } else if (!userAlreadyAgreed) {
    notificationService.createRevealRequestNotification(
      otherUserId,
      userId,
      conversationId,
      ''
    ).catch((e) => logger.error(`Create reveal request notification error: ${e.message}`));
  }

  const latest = await getRevealStatus(conversationId, userId, otherUserId);

  const sendToUser = _getSendToUser();
  if (sendToUser) {
    const revealPayload = { type: 'reveal', data: { conversationId, ...latest } };
    sendToUser(userId.toString(), revealPayload);
    sendToUser(otherUserId.toString(), revealPayload);
  }

  return latest;
};

const setTempNickname = async ({ userId, otherUserId, tempNickname, auditHelper }) => {
  if (!otherUserId) {
    throw BadRequestError('otherUserId is required');
  }

  if (userId.toString() === otherUserId.toString()) {
    throw BadRequestError('Cannot set nickname for yourself');
  }

  const trimmed = (tempNickname || '').toString().trim().slice(0, 24);
  if (!trimmed) {
    throw BadRequestError('tempNickname cannot be empty');
  }

  const conversationId = Message.generateConversationId(userId, otherUserId);
  const decision = await RevealDecision.findOne({ conversationId });

  if (decision && decision.revealed) {
    throw BadRequestError('身份已揭示，无需设置临时昵称');
  }

  let finalNickname = trimmed;

  if (auditHelper && auditHelper.processContentAudit) {
    const auditResult = await auditHelper.processContentAudit({
      fieldsMap: auditHelper.buildTempNicknameAuditFields(trimmed),
      type: 'tempNickname',
      userId,
      targetId: conversationId
    });

    if (auditResult.blocked) {
      throw buildAuditBlockedResponse(
        auditResult.matchedWords,
        '临时昵称包含违规信息'
      );
    }

    finalNickname = (auditResult.finalFields?.tempNickname || trimmed).slice(0, 24);
  }

  const updated = await RevealDecision.findOneAndUpdate(
    { conversationId },
    {
      $setOnInsert: {
        users: [userId, otherUserId],
        revealed: false,
        unlockedAt: null,
        agreedBy: []
      },
      $set: {
        [`tempNicknames.${userId.toString()}`]: finalNickname
      }
    },
    { upsert: true, new: true }
  ).lean();

  const latest = await getRevealStatus(conversationId, userId, otherUserId);

  const tempNicknamesRaw = _normalizeTempNicknamesMap(updated?.tempNicknames);

  const nicknamePayload = {
    type: 'tempNickname',
    data: {
      conversationId,
      fromUserId: userId.toString(),
      tempNickname: finalNickname,
      tempNicknames: { ...tempNicknamesRaw, [userId.toString()]: finalNickname }
    }
  };
  sendToUser(userId.toString(), nicknamePayload);
  sendToUser(otherUserId.toString(), nicknamePayload);

  return { tempNickname: finalNickname, reveal: latest };
};

module.exports = {
  AUTO_REVEAL_HOURS,
  getRevealStatus,
  getRevealStatusBatch,
  getOtherDisplayName,
  requestReveal,
  setTempNickname
};
