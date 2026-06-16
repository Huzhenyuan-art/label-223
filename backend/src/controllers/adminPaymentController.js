const mongoose = require('mongoose');
const { PaymentOrder, User } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const { logOperation } = require('../services/adminLogService');

const ORDER_STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付',
  failed: '支付失败'
};

const decorateOrder = (order) => ({
  ...order,
  planName: config.paymentPlans[order.plan]?.name || order.plan,
  statusLabel: ORDER_STATUS_LABEL[order.status] || order.status
});

exports.getOrders = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { keyword, status, plan, userId, startDate, endDate } = req.query;

    const query = {};
    if (keyword) {
      const kw = keyword.trim();
      query.$or = [
        { orderNo: { $regex: kw, $options: 'i' } }
      ];
      if (mongoose.Types.ObjectId.isValid(kw)) {
        query.$or.push({ _id: new mongoose.Types.ObjectId(kw) });
      }
    }
    if (status) {
      query.status = status;
    }
    if (plan) {
      query.plan = plan;
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.user = new mongoose.Types.ObjectId(userId);
    }
    if (startDate || endDate) {
      const dateField = status === 'paid' ? 'paidAt' : 'createdAt';
      query[dateField] = {};
      if (startDate) {
        query[dateField].$gte = new Date(startDate);
      }
      if (endDate) {
        query[dateField].$lte = new Date(endDate);
      }
    }

    const [list, total] = await Promise.all([
      PaymentOrder.find(query)
        .populate('user', 'nickname avatar account')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PaymentOrder.countDocuments(query)
    ]);

    const [stats] = await Promise.all([
      PaymentOrder.aggregate([
        ...(Object.keys(query).length ? [{ $match: query }] : []),
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            totalOrders: { $sum: 1 },
            paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
            paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } }
          }
        }
      ])
    ]);

    return res.json({
      code: 0,
      data: {
        list: list.map(decorateOrder),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        stats: {
          totalAmount: stats[0]?.totalAmount || 0,
          totalOrders: stats[0]?.totalOrders || 0,
          paidOrders: stats[0]?.paidOrders || 0,
          paidAmount: stats[0]?.paidAmount || 0
        }
      }
    });
  } catch (error) {
    logger.error(`Get orders error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getOrderDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid order id' });
    }

    const order = await PaymentOrder.findById(id)
      .populate('user', 'nickname avatar account premium')
      .lean();
    if (!order) {
      return res.status(404).json({ code: 1, message: 'Order not found' });
    }

    return res.json({
      code: 0,
      data: decorateOrder(order)
    });
  } catch (error) {
    logger.error(`Get order detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.manualConfirmOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid order id' });
    }

    const order = await PaymentOrder.findById(id);
    if (!order) {
      return res.status(404).json({ code: 1, message: 'Order not found' });
    }

    if (order.status === 'paid') {
      return res.status(400).json({ code: 1, message: '订单已支付' });
    }

    const user = await User.findById(order.user);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const now = new Date();
    const planConfig = config.paymentPlans[order.plan];
    const currentExpireAt = user.premium?.expireAt && new Date(user.premium.expireAt) > now
      ? new Date(user.premium.expireAt)
      : now;
    const nextExpireAt = planConfig
      ? new Date(currentExpireAt.getTime() + planConfig.durationDays * 24 * 3600000)
      : currentExpireAt;

    order.status = 'paid';
    order.paidAt = now;
    await order.save();

    user.premium = {
      isActive: true,
      plan: order.plan,
      expireAt: nextExpireAt
    };
    await user.save();

    await logOperation(req, {
      module: 'order',
      action: 'manual_confirm_order',
      targetId: order._id,
      targetType: 'PaymentOrder',
      detail: { orderNo: order.orderNo, plan: order.plan, amount: order.amount, userId: user._id.toString() }
    });

    logger.info(`Order manually confirmed: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '确认成功，会员已开通' }
    });
  } catch (error) {
    logger.error(`Manual confirm order error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
