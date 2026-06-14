const { User, PaymentOrder } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');

const createOrderNo = () => `EI${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
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

exports.getPlans = async (req, res) => {
  try {
    const plans = Object.entries(config.paymentPlans).map(([key, value]) => ({
      key,
      ...value
    }));

    return res.json({ code: 0, data: plans });
  } catch (error) {
    logger.error(`Get plans error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createCheckout = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.userId;

    const planConfig = config.paymentPlans[plan];
    if (!planConfig) {
      return res.status(400).json({ code: 1, message: 'Invalid plan' });
    }

    const order = await PaymentOrder.create({
      orderNo: createOrderNo(),
      user: userId,
      plan,
      amount: planConfig.price,
      status: 'pending'
    });

    order.status = 'paid';
    order.paidAt = new Date();
    await order.save();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const now = new Date();
    const currentExpireAt = user.premium?.expireAt && new Date(user.premium.expireAt) > now
      ? new Date(user.premium.expireAt)
      : now;

    const nextExpireAt = new Date(currentExpireAt.getTime() + planConfig.durationDays * 24 * 3600000);

    user.premium = {
      isActive: true,
      plan,
      expireAt: nextExpireAt
    };
    await user.save();

    logger.info(`Checkout success: order ${order.orderNo}, user ${userId}`);

    return res.json({
      code: 0,
      data: {
        order: decorateOrder(order.toObject()),
        premium: user.premium
      }
    });
  } catch (error) {
    logger.error(`Checkout error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const list = await PaymentOrder.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ code: 0, data: list.map(decorateOrder) });
  } catch (error) {
    logger.error(`Get orders error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
