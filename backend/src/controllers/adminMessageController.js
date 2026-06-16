const mongoose = require('mongoose');
const { Message, User, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { logOperation } = require('../services/adminLogService');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

exports.getConversations = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { keyword, userId, startDate, endDate } = req.query;

    const matchQuery = {};
    if (keyword) {
      matchQuery.content = { $regex: keyword.trim(), $options: 'i' };
    }
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchQuery.createdAt.$lte = new Date(endDate);
      }
    }

    let pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $last: '$$ROOT' },
          messageCount: { $sum: 1 },
          participants: { $addToSet: '$sender' }
        }
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ];

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const userObjId = new mongoose.Types.ObjectId(userId);
      pipeline = [
        {
          $match: {
            $or: [{ sender: userObjId }, { receiver: userObjId }],
            ...matchQuery
          }
        },
        {
          $group: {
            _id: '$conversationId',
            lastMessage: { $last: '$$ROOT' },
            messageCount: { $sum: 1 },
            participants: { $addToSet: '$sender' }
          }
        },
        { $sort: { 'lastMessage.createdAt': -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      ];
    }

    const conversations = await Message.aggregate(pipeline);

    const countPipeline = userId && mongoose.Types.ObjectId.isValid(userId)
      ? [
          {
            $match: {
              $or: [{ sender: new mongoose.Types.ObjectId(userId) }, { receiver: new mongoose.Types.ObjectId(userId) }],
              ...matchQuery
            }
          },
          { $group: { _id: '$conversationId' } },
          { $count: 'total' }
        ]
      : [
          { $match: matchQuery },
          { $group: { _id: '$conversationId' } },
          { $count: 'total' }
        ];

    const countResult = await Message.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    const conversationIds = conversations.map((c) => c._id);
    const lastMessagesMap = new Map();
    const participantIds = new Set();

    for (const conv of conversations) {
      lastMessagesMap.set(conv._id, conv.lastMessage);
      const msg = conv.lastMessage;
      if (msg?.sender) participantIds.add(msg.sender.toString());
      if (msg?.receiver) participantIds.add(msg.receiver.toString());
    }

    const users = await User.find({ _id: { $in: [...participantIds].map(toObjectId) } })
      .select('nickname avatar account')
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const enrichedConversations = conversations.map((conv) => {
      const msg = conv.lastMessage;
      return {
        conversationId: conv._id,
        messageCount: conv.messageCount,
        lastMessage: {
          ...msg,
          sender: msg?.sender ? userMap.get(msg.sender.toString()) : null,
          receiver: msg?.receiver ? userMap.get(msg.receiver.toString()) : null
        },
        participants: [
          msg?.sender ? userMap.get(msg.sender.toString()) : null,
          msg?.receiver ? userMap.get(msg.receiver.toString()) : null
        ].filter(Boolean)
      };
    });

    return res.json({
      code: 0,
      data: {
        list: enrichedConversations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get conversations error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getConversationMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const { keyword } = req.query;

    if (!conversationId) {
      return res.status(400).json({ code: 1, message: 'conversationId is required' });
    }

    const query = { conversationId };
    if (keyword) {
      query.content = { $regex: keyword.trim(), $options: 'i' };
    }

    const [list, total] = await Promise.all([
      Message.find(query)
        .populate('sender', 'nickname avatar account')
        .populate('receiver', 'nickname avatar account')
        .populate('sourcePost', 'title dynamicTag')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Message.countDocuments(query)
    ]);

    const participantIds = new Set();
    for (const msg of list) {
      if (msg.sender) participantIds.add(msg.sender._id.toString());
      if (msg.receiver) participantIds.add(msg.receiver._id.toString());
    }

    return res.json({
      code: 0,
      data: {
        list: list.reverse(),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        participantIds: [...participantIds]
      }
    });
  } catch (error) {
    logger.error(`Get conversation messages error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
