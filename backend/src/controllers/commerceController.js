const { DerivativeProduct, BrandCamp, DerivativeWaitlist, BrandCampInquiry } = require('../models');
const logger = require('../utils/logger');

exports.getDerivativeProducts = async (req, res) => {
  try {
    const list = await DerivativeProduct.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .lean();

    const derivativeIds = list.map((item) => item._id);
    const [joinedRows, joinedCounts] = await Promise.all([
      DerivativeWaitlist.find({ user: req.userId, derivative: { $in: derivativeIds } })
        .select('derivative')
        .lean(),
      DerivativeWaitlist.aggregate([
        { $match: { derivative: { $in: derivativeIds } } },
        { $group: { _id: '$derivative', count: { $sum: 1 } } }
      ])
    ]);

    const joinedSet = new Set(joinedRows.map((item) => item.derivative.toString()));
    const countMap = new Map(joinedCounts.map((item) => [item._id.toString(), item.count]));

    return res.json({
      code: 0,
      data: list.map((item) => ({
        ...item,
        joined: joinedSet.has(item._id.toString()),
        waitlistCount: countMap.get(item._id.toString()) || 0
      }))
    });
  } catch (error) {
    logger.error(`Get derivative products error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getBrandCamps = async (req, res) => {
  try {
    const list = await BrandCamp.find({ status: 'online' })
      .sort({ createdAt: -1 })
      .lean();

    const campIds = list.map((item) => item._id);
    const [inquiryRows, inquiryCounts] = await Promise.all([
      BrandCampInquiry.find({ user: req.userId, camp: { $in: campIds } })
        .select('camp')
        .lean(),
      BrandCampInquiry.aggregate([
        { $match: { camp: { $in: campIds } } },
        { $group: { _id: '$camp', count: { $sum: 1 } } }
      ])
    ]);

    const inquirySet = new Set(inquiryRows.map((item) => item.camp.toString()));
    const countMap = new Map(inquiryCounts.map((item) => [item._id.toString(), item.count]));

    return res.json({
      code: 0,
      data: list.map((item) => ({
        ...item,
        inquired: inquirySet.has(item._id.toString()),
        inquiryCount: countMap.get(item._id.toString()) || 0
      }))
    });
  } catch (error) {
    logger.error(`Get brand camps error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.joinDerivativeWaitlist = async (req, res) => {
  try {
    const derivativeId = req.params.id;
    const derivative = await DerivativeProduct.findOne({ _id: derivativeId, status: 'published' }).lean();
    if (!derivative) {
      return res.status(404).json({ code: 1, message: '内容衍生品不存在' });
    }

    const existing = await DerivativeWaitlist.findOne({
      derivative: derivativeId,
      user: req.userId
    }).lean();

    if (!existing) {
      await DerivativeWaitlist.create({
        derivative: derivativeId,
        user: req.userId
      });
    }

    const waitlistCount = await DerivativeWaitlist.countDocuments({ derivative: derivativeId });

    return res.json({
      code: 0,
      data: {
        derivativeId,
        joined: true,
        alreadyJoined: Boolean(existing),
        waitlistCount
      }
    });
  } catch (error) {
    logger.error(`Join derivative waitlist error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createCampInquiry = async (req, res) => {
  try {
    const campId = req.params.id;
    const camp = await BrandCamp.findOne({ _id: campId, status: 'online' }).lean();
    if (!camp) {
      return res.status(404).json({ code: 1, message: '营地项目不存在' });
    }

    const existing = await BrandCampInquiry.findOne({
      camp: campId,
      user: req.userId
    }).lean();

    if (!existing) {
      await BrandCampInquiry.create({
        camp: campId,
        user: req.userId
      });
    }

    const inquiryCount = await BrandCampInquiry.countDocuments({ camp: campId });

    return res.json({
      code: 0,
      data: {
        campId,
        inquired: true,
        alreadyInquired: Boolean(existing),
        inquiryCount
      }
    });
  } catch (error) {
    logger.error(`Create camp inquiry error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
