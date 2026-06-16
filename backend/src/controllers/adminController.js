const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, Post, Message, PaymentOrder, BrandCampInquiry, AuditLog } = require('../models');
const logger = require('../utils/logger');
const { signToken } = require('../utils/auth');
const { logOperation } = require('../services/adminLogService');

const normalizeAccount = (value) => String(value || '').trim().toLowerCase();

exports.login = async (req, res) => {
  try {
    const account = normalizeAccount(req.body.account);
    const password = String(req.body.password || '');

    const user = await User.findOne({ account });
    if (!user || user.authProvider !== 'password' || !user.passwordHash) {
      return res.status(401).json({ code: 1, message: '账号或密码错误' });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ code: 3, message: '无管理员权限' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ code: 4, message: '账号已被封禁' });
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      return res.status(401).json({ code: 1, message: '账号或密码错误' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    await logOperation(req, {
      module: 'system',
      action: 'admin_login',
      targetId: user._id,
      targetType: 'User',
      detail: { account: user.account }
    });

    logger.info(`Admin login: ${user._id}`);

    return res.json({
      code: 0,
      data: {
        token: signToken(user),
        user: {
          id: user._id,
          account: user.account,
          nickname: user.nickname,
          avatar: user.avatar,
          isAdmin: user.isAdmin
        }
      }
    });
  } catch (error) {
    logger.error(`Admin login error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      totalPosts,
      postsToday,
      postsWeek,
      totalOrders,
      ordersToday,
      ordersWeek,
      pendingInquiries,
      totalRevenue,
      bannedUsers,
      removedPosts
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      Post.countDocuments({ status: 'published' }),
      Post.countDocuments({ status: 'published', createdAt: { $gte: todayStart } }),
      Post.countDocuments({ status: 'published', createdAt: { $gte: weekAgo } }),
      PaymentOrder.countDocuments({ status: 'paid' }),
      PaymentOrder.countDocuments({ status: 'paid', paidAt: { $gte: todayStart } }),
      PaymentOrder.countDocuments({ status: 'paid', paidAt: { $gte: weekAgo } }),
      BrandCampInquiry.countDocuments({ status: 'pending' }),
      PaymentOrder.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.countDocuments({ status: 'banned' }),
      Post.countDocuments({ status: 'removed' })
    ]);

    const dailyUserTrend = await User.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dailyPostTrend = await Post.aggregate([
      { $match: { createdAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dailyOrderTrend = await PaymentOrder.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%m-%d', date: '$paidAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return res.json({
      code: 0,
      data: {
        overview: {
          totalUsers,
          newUsersToday,
          newUsersWeek,
          totalPosts,
          postsToday,
          postsWeek,
          totalOrders,
          ordersToday,
          ordersWeek,
          pendingInquiries,
          totalRevenue: totalRevenue[0]?.total || 0,
          bannedUsers,
          removedPosts
        },
        trends: {
          dailyUserTrend,
          dailyPostTrend,
          dailyOrderTrend
        }
      }
    });
  } catch (error) {
    logger.error(`Get dashboard stats error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getCurrentAdmin = async (req, res) => {
  try {
    const user = req.user;
    return res.json({
      code: 0,
      data: {
        id: user._id,
        account: user.account,
        nickname: user.nickname,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    logger.error(`Get current admin error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
