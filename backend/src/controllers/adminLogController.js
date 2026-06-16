const mongoose = require('mongoose');
const { AdminOperationLog } = require('../models');
const logger = require('../utils/logger');

exports.getOperationLogs = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { module, action, adminId, keyword, startDate, endDate } = req.query;

    const query = {};
    if (module) {
      query.module = module;
    }
    if (action) {
      query.action = { $regex: action, $options: 'i' };
    }
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      query.adminId = new mongoose.Types.ObjectId(adminId);
    }
    if (keyword) {
      const kw = keyword.trim();
      query.$or = [
        { adminName: { $regex: kw, $options: 'i' } },
        { action: { $regex: kw, $options: 'i' } },
        { targetType: { $regex: kw, $options: 'i' } }
      ];
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const [list, total] = await Promise.all([
      AdminOperationLog.find(query)
        .populate('adminId', 'nickname avatar account')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdminOperationLog.countDocuments(query)
    ]);

    const moduleStats = await AdminOperationLog.aggregate([
      ...(Object.keys(query).length ? [{ $match: query }] : []),
      { $group: { _id: '$module', count: { $sum: 1 } } }
    ]);

    return res.json({
      code: 0,
      data: {
        list,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        moduleStats: moduleStats.map((s) => ({ module: s._id, count: s.count }))
      }
    });
  } catch (error) {
    logger.error(`Get operation logs error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getOperationLogStats = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const [moduleStats, dailyStats, topAdmins] = await Promise.all([
      AdminOperationLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      AdminOperationLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      AdminOperationLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$adminName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    return res.json({
      code: 0,
      data: {
        periodDays: Number(days),
        moduleStats: moduleStats.map((s) => ({ module: s._id, count: s.count })),
        dailyStats,
        topAdmins
      }
    });
  } catch (error) {
    logger.error(`Get operation log stats error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
