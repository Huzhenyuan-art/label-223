const { SensitiveWord, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { buildFilter } = require('../services/auditService');
const mongoose = require('mongoose');

const DEFAULT_WORDS = [
  { word: '傻逼', category: 'insult', level: 3 },
  { word: '操你妈', category: 'insult', level: 3 },
  { word: '色情', category: 'pornography', level: 3 },
  { word: '毒品', category: 'violence', level: 3 },
  { word: '赌博', category: 'violence', level: 3 },
  { word: '加微信', category: 'advertising', level: 2 },
  { word: '加QQ', category: 'advertising', level: 2 },
  { word: '代购', category: 'advertising', level: 1 }
];

exports.initializeDefaults = async (req, res) => {
  try {
    const count = await SensitiveWord.countDocuments();
    if (count > 0) {
      return res.status(400).json({ code: 1, message: 'Sensitive words already initialized' });
    }

    const created = await SensitiveWord.insertMany(
      DEFAULT_WORDS.map((w) => ({ ...w, createdBy: req.userId }))
    );

    await buildFilter(true);

    logger.info(`Default sensitive words initialized: ${created.length} items`);

    return res.json({ code: 0, data: { count: created.length } });
  } catch (error) {
    logger.error(`Initialize default words error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createSensitiveWord = async (req, res) => {
  try {
    const { word, category = 'other', level = 2, enabled = true } = req.body;

    if (!word || !word.trim()) {
      return res.status(400).json({ code: 1, message: 'Word is required' });
    }

    const normalizedWord = word.trim();

    const existing = await SensitiveWord.findOne({ word: normalizedWord });
    if (existing) {
      return res.status(400).json({ code: 1, message: 'Word already exists' });
    }

    const sensitiveWord = await SensitiveWord.create({
      word: normalizedWord,
      category,
      level,
      enabled,
      createdBy: req.userId
    });

    await buildFilter(true);

    logger.info(`Sensitive word created: ${sensitiveWord._id} by ${req.userId}`);

    return res.status(201).json({ code: 0, data: sensitiveWord });
  } catch (error) {
    logger.error(`Create sensitive word error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.batchCreateSensitiveWords = async (req, res) => {
  try {
    const { words } = req.body;

    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ code: 1, message: 'Words array is required' });
    }

    const normalized = words.map((w) => ({
      word: (w.word || '').trim(),
      category: w.category || 'other',
      level: w.level || 2,
      enabled: w.enabled !== false,
      createdBy: req.userId
    })).filter((w) => w.word);

    if (normalized.length === 0) {
      return res.status(400).json({ code: 1, message: 'No valid words provided' });
    }

    const existingWords = await SensitiveWord.find({
      word: { $in: normalized.map((w) => w.word) }
    }).distinct('word');

    const toCreate = normalized.filter((w) => !existingWords.includes(w.word));
    let createdCount = 0;

    if (toCreate.length > 0) {
      const result = await SensitiveWord.insertMany(toCreate, { ordered: false });
      createdCount = result.length;
    }

    await buildFilter(true);

    logger.info(`Batch create sensitive words: ${createdCount} created, ${existingWords.length} skipped`);

    return res.json({
      code: 0,
      data: {
        created: createdCount,
        skipped: existingWords.length,
        total: normalized.length
      }
    });
  } catch (error) {
    logger.error(`Batch create sensitive words error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getSensitiveWords = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const { category, enabled, keyword } = req.query;

    const query = {};
    if (category) {
      query.category = category;
    }
    if (enabled !== undefined && enabled !== '') {
      query.enabled = enabled === 'true';
    }
    if (keyword) {
      query.word = { $regex: keyword, $options: 'i' };
    }

    const [list, total] = await Promise.all([
      SensitiveWord.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SensitiveWord.countDocuments(query)
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
        }
      }
    });
  } catch (error) {
    logger.error(`Get sensitive words error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.updateSensitiveWord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid id' });
    }

    const { word, category, level, enabled } = req.body;

    const updateData = {};
    if (word !== undefined) {
      const normalized = word.trim();
      if (!normalized) {
        return res.status(400).json({ code: 1, message: 'Word cannot be empty' });
      }
      updateData.word = normalized;
    }
    if (category !== undefined) {
      updateData.category = category;
    }
    if (level !== undefined) {
      updateData.level = level;
    }
    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    const updated = await SensitiveWord.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ code: 1, message: 'Sensitive word not found' });
    }

    await buildFilter(true);

    logger.info(`Sensitive word updated: ${id} by ${req.userId}`);

    return res.json({ code: 0, data: updated });
  } catch (error) {
    logger.error(`Update sensitive word error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.deleteSensitiveWord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid id' });
    }

    const deleted = await SensitiveWord.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ code: 1, message: 'Sensitive word not found' });
    }

    await buildFilter(true);

    logger.info(`Sensitive word deleted: ${id} by ${req.userId}`);

    return res.json({ code: 0, data: { message: 'Deleted successfully' } });
  } catch (error) {
    logger.error(`Delete sensitive word error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.toggleSensitiveWord = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid id' });
    }

    const item = await SensitiveWord.findById(id);
    if (!item) {
      return res.status(404).json({ code: 1, message: 'Sensitive word not found' });
    }

    item.enabled = !item.enabled;
    await item.save();

    await buildFilter(true);

    logger.info(`Sensitive word ${id} toggled to ${item.enabled} by ${req.userId}`);

    return res.json({ code: 0, data: item });
  } catch (error) {
    logger.error(`Toggle sensitive word error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 50);
    const { type, action, userId, startDate, endDate } = req.query;

    const query = {};
    if (type) {
      query.type = type;
    }
    if (action) {
      query.action = action;
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.userId = new mongoose.Types.ObjectId(userId);
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
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'nickname avatar')
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    const stats = await AuditLog.aggregate([
      ...(Object.keys(query).length ? [{ $match: query }] : []),
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = stats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

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
        stats: {
          total,
          blocked: statsMap.blocked || 0,
          masked: statsMap.masked || 0,
          passed: statsMap.passed || 0
        }
      }
    });
  } catch (error) {
    logger.error(`Get audit logs error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getAuditStats = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const [actionStats, typeStats, dailyStats] = await Promise.all([
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } }
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            total: { $sum: 1 },
            blocked: { $sum: { $cond: [{ $eq: ['$action', 'blocked'] }, 1, 0] } },
            masked: { $sum: { $cond: [{ $eq: ['$action', 'masked'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const actionMap = actionStats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    const typeMap = typeStats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    const total = Object.values(actionMap).reduce((a, b) => a + b, 0);

    return res.json({
      code: 0,
      data: {
        periodDays: Number(days),
        overview: {
          total,
          blocked: actionMap.blocked || 0,
          masked: actionMap.masked || 0,
          passed: actionMap.passed || 0,
          blockRate: total ? ((actionMap.blocked || 0) / total * 100).toFixed(2) : 0
        },
        byType: typeMap,
        daily: dailyStats.map((d) => ({
          date: d._id,
          total: d.total,
          blocked: d.blocked,
          masked: d.masked
        }))
      }
    });
  } catch (error) {
    logger.error(`Get audit stats error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.refreshCache = async (req, res) => {
  try {
    await buildFilter(true);
    return res.json({ code: 0, data: { message: 'Cache refreshed successfully' } });
  } catch (error) {
    logger.error(`Refresh audit cache error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
