const mongoose = require('mongoose');
const { BrandCampInquiry, BrandCamp, User } = require('../models');
const logger = require('../utils/logger');
const { logOperation } = require('../services/adminLogService');

exports.getInquiries = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { status, campId, userId, keyword, startDate, endDate } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (campId && mongoose.Types.ObjectId.isValid(campId)) {
      query.camp = new mongoose.Types.ObjectId(campId);
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      query.user = new mongoose.Types.ObjectId(userId);
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

    let userQuery = null;
    if (keyword) {
      const kw = keyword.trim();
      const matchedUsers = await User.find({
        $or: [
          { nickname: { $regex: kw, $options: 'i' } },
          { account: { $regex: kw, $options: 'i' } }
        ]
      }).select('_id').lean();
      if (matchedUsers.length > 0) {
        userQuery = matchedUsers.map((u) => u._id);
      } else {
        userQuery = [];
      }
    }

    if (userQuery !== null) {
      if (userQuery.length === 0) {
        return res.json({
          code: 0,
          data: {
            list: [],
            pagination: { page, limit, total: 0, totalPages: 0 }
          }
        });
      }
      query.user = { $in: userQuery };
    }

    const [list, total] = await Promise.all([
      BrandCampInquiry.find(query)
        .populate('camp', 'organization theme cycleFee cycle')
        .populate('user', 'nickname avatar account')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BrandCampInquiry.countDocuments(query)
    ]);

    const stats = await BrandCampInquiry.aggregate([
      {
        $group: {
          _id: '$status',
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
          pending: statsMap.pending || 0,
          contacted: statsMap.contacted || 0
        }
      }
    });
  } catch (error) {
    logger.error(`Get inquiries error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getInquiryDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid inquiry id' });
    }

    const inquiry = await BrandCampInquiry.findById(id)
      .populate('camp', 'organization theme description cycleFee cycle tags status')
      .populate('user', 'nickname avatar account bio premium')
      .lean();
    if (!inquiry) {
      return res.status(404).json({ code: 1, message: 'Inquiry not found' });
    }

    return res.json({
      code: 0,
      data: inquiry
    });
  } catch (error) {
    logger.error(`Get inquiry detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.markInquiryContacted = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ code: 1, message: 'Invalid inquiry id' });
    }

    const inquiry = await BrandCampInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({ code: 1, message: 'Inquiry not found' });
    }

    if (inquiry.status === 'contacted') {
      return res.status(400).json({ code: 1, message: '咨询已标记为已联系' });
    }

    inquiry.status = 'contacted';
    await inquiry.save();

    await logOperation(req, {
      module: 'camp_inquiry',
      action: 'mark_contacted',
      targetId: inquiry._id,
      targetType: 'BrandCampInquiry',
      detail: { camp: inquiry.camp.toString(), user: inquiry.user.toString() }
    });

    logger.info(`Inquiry marked as contacted: ${id} by ${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '标记成功' }
    });
  } catch (error) {
    logger.error(`Mark inquiry contacted error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getBrandCamps = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const { status, keyword } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }
    if (keyword) {
      const kw = keyword.trim();
      query.$or = [
        { organization: { $regex: kw, $options: 'i' } },
        { theme: { $regex: kw, $options: 'i' } },
        { description: { $regex: kw, $options: 'i' } }
      ];
    }

    const [list, total] = await Promise.all([
      BrandCamp.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BrandCamp.countDocuments(query)
    ]);

    const campIds = list.map((c) => c._id);
    const inquiryCounts = await BrandCampInquiry.aggregate([
      { $match: { camp: { $in: campIds } } },
      { $group: { _id: '$camp', count: { $sum: 1 }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }
    ]);
    const countMap = new Map(inquiryCounts.map((c) => [c._id.toString(), c]));

    const enrichedList = list.map((camp) => ({
      ...camp,
      inquiryCount: countMap.get(camp._id.toString())?.count || 0,
      pendingInquiryCount: countMap.get(camp._id.toString())?.pending || 0
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
    logger.error(`Get brand camps error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
