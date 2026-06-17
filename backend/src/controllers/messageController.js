const { Message, User, RevealDecision, Post, Resonance } = require('../models');
const logger = require('../utils/logger');
const { sendToUser, pushUnread } = require('../websocket');
const { auditMultipleFields } = require('../services/auditService');
const notificationService = require('../services/notificationService');

const AUTO_REVEAL_HOURS = 48;

const getRevealStatus = async (conversationId, userId, otherUserId) => {
  const [counts, decision] = await Promise.all([
    Message.aggregate([
      { $match: { conversationId } },
      { $group: { _id: '$sender', count: { $sum: 1 } } }
    ]),
    RevealDecision.findOne({ conversationId }).lean()
  ]);

  const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));
  const myCount = countMap.get(userId.toString()) || 0;
  const otherCount = countMap.get(otherUserId.toString()) || 0;
  const eligible = myCount >= 3 && otherCount >= 3;

  const agreedBy = new Set((decision?.agreedBy || []).map((id) => id.toString()));
  const myAgreed = agreedBy.has(userId.toString());
  const otherAgreed = agreedBy.has(otherUserId.toString());

  let revealed = Boolean(decision?.revealed);
  let unlockedAt = decision?.unlockedAt || null;
  const requestedAt = decision?.requestedAt || null;

  if (!revealed && myAgreed && !otherAgreed && requestedAt) {
    const deadline = new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000);
    if (new Date() >= deadline) {
      await RevealDecision.updateOne(
        { conversationId },
        { $addToSet: { agreedBy: otherUserId }, $set: { revealed: true, unlockedAt: new Date() } }
      );
      revealed = true;
      unlockedAt = new Date();

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
    }
  }

  const waitingForOther = myAgreed && !otherAgreed && !revealed;
  const otherRequestedReveal = otherAgreed && !myAgreed && !revealed;
  const autoRevealDeadline = (!revealed && requestedAt && waitingForOther)
    ? new Date(requestedAt.getTime() + AUTO_REVEAL_HOURS * 60 * 60 * 1000)
    : null;

  const tempNicknamesRaw = decision?.tempNicknames instanceof Map
    ? Object.fromEntries(decision.tempNicknames)
    : decision?.tempNicknames || {};
  const tempNicknames = {};
  Object.keys(tempNicknamesRaw).forEach((k) => {
    tempNicknames[k] = tempNicknamesRaw[k];
  });

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

const getOtherDisplayName = (reveal, otherUserId, fallback = '同频回声') => {
  if (reveal.revealed) {
    return null;
  }
  return reveal.tempNicknames?.[otherUserId.toString()] || fallback;
};

exports.getConversations = async (req, res) => {
  try {
    const userId = req.userId;

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiver', userId] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } }
    ]);

    const result = await Promise.all(
      conversations.map(async (item) => {
        const isSender = item.lastMessage.sender.toString() === userId.toString();
        const otherUserId = isSender ? item.lastMessage.receiver : item.lastMessage.sender;
        const otherUser = await User.findById(otherUserId).select('nickname avatar').lean();
        const reveal = await getRevealStatus(item._id, userId, otherUserId);

        const otherDisplayName = getOtherDisplayName(reveal, otherUserId);
        const userView = reveal.revealed
          ? {
            _id: otherUserId,
            nickname: otherUser?.nickname || '同频回声',
            avatar: otherUser?.avatar || ''
          }
          : {
            _id: otherUserId,
            nickname: otherDisplayName || '同频回声',
            avatar: ''
          };

        return {
          conversationId: item._id,
          unreadCount: item.unreadCount,
          lastMessage: item.lastMessage,
          user: userView,
          reveal
        };
      })
    );

    return res.json({ code: 0, data: result });
  } catch (error) {
    logger.error(`Get conversations error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const userId = req.userId.toString();

    if (!conversationId.includes(userId)) {
      return res.status(403).json({ code: 1, message: 'Forbidden conversation' });
    }

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);

    const list = await Message.find({ conversationId })
      .populate('sender', 'nickname avatar')
      .populate('receiver', 'nickname avatar')
      .populate('sourcePost', 'title dynamicTag')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    await Message.updateMany(
      { conversationId, receiver: req.userId, read: false },
      { read: true }
    );

    pushUnread(req.userId).catch((e) => logger.error(`Push unread on get messages error: ${e.message}`));

    const [idA, idB] = conversationId.split('_');
    const otherUserId = idA === userId ? idB : idA;
    const reveal = await getRevealStatus(conversationId, req.userId, otherUserId);

    const otherTempName = reveal.tempNicknames?.[otherUserId] || '同频回声';
    const maskedList = reveal.revealed
      ? list
      : list.map((item) => {
        const senderId = item.sender?._id?.toString?.() || '';
        const receiverId = item.receiver?._id?.toString?.() || '';
        const mine = senderId === userId || receiverId === userId;

        if (!mine) {
          return item;
        }

        const maskedSender = senderId === userId
          ? item.sender
          : { ...item.sender, nickname: otherTempName, avatar: '' };
        const maskedReceiver = receiverId === userId
          ? item.receiver
          : { ...item.receiver, nickname: otherTempName, avatar: '' };

        return {
          ...item,
          sender: maskedSender,
          receiver: maskedReceiver
        };
      });

    return res.json({
      code: 0,
      data: {
        list: maskedList.reverse(),
        reveal
      }
    });
  } catch (error) {
    logger.error(`Get conversation messages error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.userId;
    const { receiverId, senderDynamicTag, content, postId, tempNickname } = req.body;

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ code: 1, message: 'Cannot message yourself' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ code: 1, message: 'Receiver not found' });
    }

    const conversationId = Message.generateConversationId(senderId, receiverId);
    const messageCount = await Message.countDocuments({ conversationId });

    let sourcePost = null;
    if (postId) {
      const post = await Post.findById(postId).select('author');
      if (!post) {
        return res.status(404).json({ code: 1, message: 'Referenced post not found' });
      }
      sourcePost = post._id;
    }

    if (messageCount === 0) {
      if (!postId) {
        return res.status(400).json({
          code: 1,
          message: 'First private wave must be initiated from a resonated post'
        });
      }

      const post = await Post.findById(postId).select('author');
      if (!post) {
        return res.status(404).json({ code: 1, message: 'Referenced post not found' });
      }

      if (post.author.toString() !== receiverId) {
        return res.status(400).json({
          code: 1,
          message: 'First private wave must target the author of the resonated post'
        });
      }

      const resonated = await Resonance.exists({ post: post._id, user: senderId });
      if (!resonated) {
        return res.status(400).json({
          code: 1,
          message: 'Please resonate with the post before sending private wave'
        });
      }
    }

    const auditResult = await auditMultipleFields({
      fieldsMap: {
        senderDynamicTag,
        content
      },
      type: 'message',
      userId: senderId,
      targetId: conversationId
    });

    if (auditResult.blocked) {
      return res.status(400).json({
        code: 1,
        message: '消息包含违规信息，无法发送',
        data: {
          matchedWords: auditResult.matchedWords
        }
      });
    }

    const finalFields = auditResult.maskedFieldsMap || {
      senderDynamicTag,
      content
    };

    const message = await Message.create({
      conversationId,
      sender: senderId,
      receiver: receiverId,
      senderDynamicTag: finalFields.senderDynamicTag,
      content: finalFields.content,
      sourcePost
    });

    await message.populate([
      { path: 'sender', select: 'nickname avatar' },
      { path: 'receiver', select: 'nickname avatar' },
      { path: 'sourcePost', select: 'title dynamicTag' }
    ]);

    if (tempNickname && typeof tempNickname === 'string') {
      const trimmed = tempNickname.trim().slice(0, 24);
      if (trimmed) {
        await RevealDecision.findOneAndUpdate(
          { conversationId },
          {
            $setOnInsert: {
              users: [senderId, receiverId],
              revealed: false,
              unlockedAt: null,
              agreedBy: []
            },
            $set: {
              [`tempNicknames.${senderId.toString()}`]: trimmed
            }
          },
          { upsert: true, new: true }
        );
      }
    }

    logger.info(`Message sent: ${message._id}, auditAction: ${auditResult.action}`);

    pushUnread(receiverId).catch((e) => logger.error(`Push unread on HTTP send error: ${e.message}`));

    return res.status(201).json({
      code: 0,
      data: message,
      auditInfo: {
        action: auditResult.action,
        matchedWords: auditResult.matchedWords
      }
    });
  } catch (error) {
    logger.error(`Send message error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.requestReveal = async (req, res) => {
  try {
    const userId = req.userId;
    const { otherUserId } = req.body;

    if (userId.toString() === otherUserId) {
      return res.status(400).json({ code: 1, message: 'Invalid target user' });
    }

    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ code: 1, message: 'Other user not found' });
    }

    const conversationId = Message.generateConversationId(userId, otherUserId);
    const status = await getRevealStatus(conversationId, userId, otherUserId);

    if (!status.eligible) {
      return res.status(400).json({
        code: 1,
        message: 'Need at least 3 messages from both users before reveal',
        data: status
      });
    }

    const existingDecision = await RevealDecision.findOne({ conversationId }).lean();
    const existingAgreedBy = new Set((existingDecision?.agreedBy || []).map((id) => id.toString()));
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

    const agreedBy = new Set((decision.agreedBy || []).map((item) => item.toString()));
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

    const revealPayload = { type: 'reveal', data: { conversationId, ...latest } };
    sendToUser(userId.toString(), revealPayload);
    sendToUser(otherUserId.toString(), revealPayload);

    return res.json({
      code: 0,
      data: latest
    });
  } catch (error) {
    logger.error(`Request reveal error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.userId,
      read: false
    });

    return res.json({ code: 0, data: { count } });
  } catch (error) {
    logger.error(`Get unread count error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.setTempNickname = async (req, res) => {
  try {
    const userId = req.userId;
    const { otherUserId, tempNickname } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ code: 1, message: 'otherUserId is required' });
    }

    if (userId.toString() === otherUserId.toString()) {
      return res.status(400).json({ code: 1, message: 'Cannot set nickname for yourself' });
    }

    const trimmed = (tempNickname || '').toString().trim().slice(0, 24);
    if (!trimmed) {
      return res.status(400).json({ code: 1, message: 'tempNickname cannot be empty' });
    }

    const conversationId = Message.generateConversationId(userId, otherUserId);
    const decision = await RevealDecision.findOne({ conversationId });

    if (decision && decision.revealed) {
      return res.status(400).json({
        code: 1,
        message: '身份已揭示，无需设置临时昵称'
      });
    }

    const auditResult = await auditMultipleFields({
      fieldsMap: { tempNickname: trimmed },
      type: 'tempNickname',
      userId,
      targetId: conversationId
    });

    if (auditResult.blocked) {
      return res.status(400).json({
        code: 1,
        message: '临时昵称包含违规信息',
        data: { matchedWords: auditResult.matchedWords }
      });
    }

    const finalNickname = (auditResult.maskedFieldsMap?.tempNickname || trimmed).slice(0, 24);

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

    const tempNicknamesRaw = updated?.tempNicknames instanceof Map
      ? Object.fromEntries(updated.tempNicknames)
      : updated?.tempNicknames || {};

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

    return res.json({
      code: 0,
      data: {
        tempNickname: finalNickname,
        reveal: latest
      }
    });
  } catch (error) {
    logger.error(`Set temp nickname error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
