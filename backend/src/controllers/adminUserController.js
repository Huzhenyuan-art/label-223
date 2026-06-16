const mongoose = require('mongoose');
const { User, Post, Resonance, Comment, PaymentOrder } = require('../models');
const logger = require('../utils/logger');
const { logOperation } = require('../services/adminLogService');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

exports.getUsers = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { keyword, status, isAdmin, premium, startDate, endDate } = req.query;

    const query = {};
    if (keyword) {
      const kw = keyword.trim();
      query.$or = [
        { nickname: { $regex: kw, $options: 'i' } },
        { account: { $regex: kw, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(kw) ? new mongoose.Types.ObjectId(kw) : null }
      ].filter(Boolean);
    }
    if (status) {
      query.status = status;
    }
    if (isAdmin !== undefined && isAdmin !== '') {
      query.isAdmin = isAdmin === 'true';
    }
    if (premium === 'active') {
      query['premium.isActive'] = true;
      query['premium.expireAt'] = { $gt: new Date() };
    } else if (premium === 'expired') {
      query['premium.isActive'] = true;
      query['premium.expireAt'] = { $lte: new Date() };
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
      User.find(query)
        .select('-passwordHash -openid')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);

    const userIds = list.map((u) => u._id);
    const [postCounts, orderCounts] = await Promise.all([
      Post.aggregate([
        { $match: { author: { $in: userIds.map(toObjectId) } } },
        { $group: { _id: '$author', count: { $sum: 1 } } }
      ]),
      PaymentOrder.aggregate([
        { $match: { user: { $in: userIds.map(toObjectId) }, status: 'paid' } },
        { $group: { _id: '$user', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } }
      ])
    ]);

    const postCountMap = new Map(postCounts.map((c) => [c._id.toString(), c.count]));
    const orderMap = new Map(orderCounts.map((c) => [c._id.toString(), c]));

    const enrichedList = list.map((user) => ({
      ...user,
      postCount: postCountMap.get(user._id.toString()) || 0,
      orderCount: orderMap.get(user._id.toString())?.count || 0,
      totalSpent: orderMap.get(user._id.toString())?.totalAmount || 0
    }));

    return res.json({
      code: 0,
      data: {
        list: enrichedList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get users error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid user id' });
    }

    const user = await User.findById(id).select('-passwordHash -openid').lean();
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const [postCount, resonanceGiven, resonanceReceived, commentCount, orderCount, totalSpent] = await Promise.all([
      Post.countDocuments({ author: id }),
      Resonance.countDocuments({ user: id }),
      Post.aggregate([
        { $match: { author: toObjectId(id) } },
        { $group: { _id: null, total: { $sum: '$resonanceCount' } } }
      ]),
      Comment.countDocuments({ user: id }),
      PaymentOrder.countDocuments({ user: id, status: 'paid' }),
      PaymentOrder.aggregate([
        { $match: { user: toObjectId(id), status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const recentPosts = await Post.find({ author: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentOrders = await PaymentOrder.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      code: 0,
      data: {
        profile: user,
        stats: {
          postCount,
          resonanceGiven,
          resonanceReceived: resonanceReceived[0]?.total || 0,
          commentCount,
          orderCount,
          totalSpent: totalSpent[0]?.total || 0
        },
        recentPosts,
        recentOrders
      }
    });
  } catch (error) {
    logger.error(`Get user detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid user id' });
    }

    if (id.toString() === req.userId.toString()) {
      return res.status(400).json({ code: 1, message: '不能封禁自己' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(403).json({ code: 1, message: '不能封禁管理员账号' });
    }

    user.status = 'banned';
    user.bannedAt = new Date();
    user.bannedReason = reason;
    user.bannedBy = req.userId;
    await user.save();

    await logOperation(req, {
      module: 'user',
      action: 'ban_user',
      targetId: user._id,
      targetType: 'User',
      detail: { reason, nickname: user.nickname, account: user.account }
    });

    logger.info(`User banned: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '封禁成功' }
    });
  } catch (error) {
    logger.error(`Ban user error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.unbanUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid user id' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    user.status = 'active';
    user.bannedAt = null;
    user.bannedReason = '';
    user.bannedBy = null;
    await user.save();

    await logOperation(req, {
      module: 'user',
      action: 'unban_user',
      targetId: user._id,
      targetType: 'User',
      detail: { nickname: user.nickname, account: user.account }
    });

    logger.info(`User unbanned: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '解封成功' }
    });
  } catch (error) {
    logger.error(`Unban user error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.setAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAdmin } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid user id' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    user.isAdmin = Boolean(isAdmin);
    await user.save();

    await logOperation(req, {
      module: 'user',
      action: isAdmin ? 'set_admin' : 'remove_admin',
      targetId: user._id,
      targetType: 'User',
      detail: { nickname: user.nickname, account: user.account, isAdmin: Boolean(isAdmin) }
    });

    logger.info(`User admin status changed: ${id} -> ${isAdmin} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '权限设置成功' }
    });
  } catch (error) {
    logger.error(`Set admin error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
