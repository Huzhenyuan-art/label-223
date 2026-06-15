const mongoose = require('mongoose');
const { PrivateGroup, PrivateGroupPost, User } = require('../models');
const logger = require('../utils/logger');

const serializeGroup = (group, withMembers = false) => {
  const data = {
    id: group._id,
    name: group.name,
    theme: group.theme,
    description: group.description,
    owner: group.owner,
    inviteCode: group.inviteCode,
    memberCount: group.members ? group.members.length : 0,
    postCount: group.postCount || 0,
    status: group.status,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };

  if (withMembers && group.members) {
    data.members = group.members.map((m) => ({
      user: m.user,
      role: m.role,
      joinedAt: m.joinedAt
    }));
  }

  return data;
};

const serializeGroupPost = (post) => ({
  id: post._id,
  group: post.group,
  author: post.author,
  title: post.title,
  content: post.content,
  images: post.images || [],
  commentCount: post.commentCount || 0,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt
});

exports.createGroup = async (req, res) => {
  try {
    const userId = req.userId;

    const group = await PrivateGroup.create({
      name: req.body.name,
      theme: req.body.theme,
      description: req.body.description || '',
      owner: userId,
      members: [
        {
          user: userId,
          role: 'owner',
          joinedAt: new Date()
        }
      ],
      postCount: 0,
      status: 'active'
    });

    logger.info(`Private group created: ${group._id} by ${userId}`);

    return res.status(201).json({ code: 0, data: serializeGroup(group) });
  } catch (error) {
    logger.error(`Create private group error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.userId;

    const groups = await PrivateGroup.find({
      'members.user': userId,
      status: 'active'
    })
      .sort({ createdAt: -1 })
      .lean();

    const list = groups.map((g) => serializeGroup(g));

    return res.json({ code: 0, data: list });
  } catch (error) {
    logger.error(`Get my private groups error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getGroupDetail = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ code: 1, message: 'Invalid group id' });
    }

    const group = await PrivateGroup.findById(groupId)
      .populate('members.user', 'nickname avatar')
      .lean();

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.status !== 'active') {
      return res.status(403).json({ code: 1, message: '小组已归档' });
    }

    const isMember = group.members.some(
      (m) => m.user && m.user._id && m.user._id.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ code: 1, message: '你不是该小组成员' });
    }

    const myRole = group.members.find(
      (m) => m.user && m.user._id && m.user._id.toString() === userId.toString()
    )?.role;

    const data = {
      id: group._id,
      name: group.name,
      theme: group.theme,
      description: group.description,
      owner: group.owner,
      inviteCode: group.inviteCode,
      memberCount: group.members.length,
      postCount: group.postCount || 0,
      status: group.status,
      myRole,
      createdAt: group.createdAt,
      members: group.members.map((m) => ({
        user: {
          id: m.user._id,
          nickname: m.user.nickname,
          avatar: m.user.avatar
        },
        role: m.role,
        joinedAt: m.joinedAt
      }))
    };

    return res.json({ code: 0, data });
  } catch (error) {
    logger.error(`Get group detail error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.joinByInviteCode = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.userId;

    if (!inviteCode || typeof inviteCode !== 'string') {
      return res.status(400).json({ code: 1, message: '请输入邀请码' });
    }

    const group = await PrivateGroup.findOne({
      inviteCode: inviteCode.trim().toUpperCase(),
      status: 'active'
    });

    if (!group) {
      return res.status(404).json({ code: 1, message: '邀请码无效或小组已解散' });
    }

    const isMember = group.members.some(
      (m) => m.user && m.user.toString() === userId.toString()
    );

    if (isMember) {
      return res.status(400).json({ code: 1, message: '你已经是该小组成员' });
    }

    group.members.push({
      user: userId,
      role: 'member',
      joinedAt: new Date()
    });

    await group.save();

    logger.info(`User ${userId} joined group ${group._id} via invite code`);

    return res.json({ code: 0, data: serializeGroup(group) });
  } catch (error) {
    logger.error(`Join group by invite code error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.refreshInviteCode = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ code: 1, message: 'Invalid group id' });
    }

    const group = await PrivateGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.owner.toString() !== userId.toString()) {
      return res.status(403).json({ code: 1, message: '仅组长可重置邀请码' });
    }

    const crypto = require('crypto');
    group.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await group.save();

    return res.json({ code: 0, data: { inviteCode: group.inviteCode } });
  } catch (error) {
    logger.error(`Refresh invite code error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ code: 1, message: 'Invalid id' });
    }

    const group = await PrivateGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.owner.toString() !== userId.toString()) {
      return res.status(403).json({ code: 1, message: '仅组长可移除成员' });
    }

    if (group.owner.toString() === memberId.toString()) {
      return res.status(400).json({ code: 1, message: '不能移除组长' });
    }

    const initialLength = group.members.length;
    group.members = group.members.filter(
      (m) => m.user && m.user.toString() !== memberId.toString()
    );

    if (group.members.length === initialLength) {
      return res.status(404).json({ code: 1, message: '该成员不存在' });
    }

    await group.save();

    logger.info(`Member ${memberId} removed from group ${groupId} by ${userId}`);

    return res.json({ code: 0, data: { memberCount: group.members.length } });
  } catch (error) {
    logger.error(`Remove member error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ code: 1, message: 'Invalid group id' });
    }

    const group = await PrivateGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.owner.toString() === userId.toString()) {
      return res.status(400).json({ code: 1, message: '组长不能退出小组，请先转让或解散' });
    }

    const initialLength = group.members.length;
    group.members = group.members.filter(
      (m) => m.user && m.user.toString() !== userId.toString()
    );

    if (group.members.length === initialLength) {
      return res.status(400).json({ code: 1, message: '你不是该小组成员' });
    }

    await group.save();

    logger.info(`User ${userId} left group ${groupId}`);

    return res.json({ code: 0, data: { message: '已退出小组' } });
  } catch (error) {
    logger.error(`Leave group error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.createPost = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ code: 1, message: 'Invalid group id' });
    }

    const group = await PrivateGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.status !== 'active') {
      return res.status(403).json({ code: 1, message: '小组已归档' });
    }

    const isMember = group.members.some(
      (m) => m.user && m.user.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ code: 1, message: '仅小组成员可发帖' });
    }

    const post = await PrivateGroupPost.create({
      group: groupId,
      author: userId,
      title: req.body.title || '',
      content: req.body.content,
      images: req.body.images || []
    });

    group.postCount = (group.postCount || 0) + 1;
    await group.save();

    logger.info(`Group post created: ${post._id} in group ${groupId} by ${userId}`);

    return res.status(201).json({ code: 0, data: serializeGroupPost(post) });
  } catch (error) {
    logger.error(`Create group post error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getGroupPosts = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ code: 1, message: 'Invalid group id' });
    }

    const group = await PrivateGroup.findById(groupId).select('members status').lean();

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    if (group.status !== 'active') {
      return res.status(403).json({ code: 1, message: '小组已归档' });
    }

    const isMember = group.members.some(
      (m) => m.user && m.user.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ code: 1, message: '仅小组成员可查看' });
    }

    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      PrivateGroupPost.find({ group: groupId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'nickname avatar')
        .lean(),
      PrivateGroupPost.countDocuments({ group: groupId })
    ]);

    const list = posts.map((p) => ({
      ...serializeGroupPost(p),
      author: {
        id: p.author._id,
        nickname: p.author.nickname,
        avatar: p.author.avatar
      }
    }));

    return res.json({
      code: 0,
      data: {
        list,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error(`Get group posts error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.searchUsersForInvite = async (req, res) => {
  try {
    const { keyword } = req.query;
    const userId = req.userId;

    if (!keyword || typeof keyword !== 'string' || keyword.trim().length < 1) {
      return res.status(400).json({ code: 1, message: '请输入搜索关键词' });
    }

    const kw = keyword.trim();
    const regex = new RegExp(kw, 'i');

    const users = await User.find({
      $and: [
        { _id: { $ne: userId } },
        {
          $or: [{ nickname: regex }, { account: regex }]
        }
      ]
    })
      .select('_id nickname avatar account')
      .limit(20)
      .lean();

    const list = users.map((u) => ({
      id: u._id,
      nickname: u.nickname,
      avatar: u.avatar,
      account: u.account || ''
    }));

    return res.json({ code: 0, data: list });
  } catch (error) {
    logger.error(`Search users for invite error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.inviteMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: targetUserId } = req.body;
    const operatorId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({ code: 1, message: 'Invalid id' });
    }

    const group = await PrivateGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({ code: 1, message: '小组不存在' });
    }

    const isMember = group.members.some(
      (m) => m.user && m.user.toString() === operatorId.toString()
    );

    if (!isMember) {
      return res.status(403).json({ code: 1, message: '仅小组成员可邀请他人' });
    }

    const targetUser = await User.findById(targetUserId).select('_id').lean();
    if (!targetUser) {
      return res.status(404).json({ code: 1, message: '用户不存在' });
    }

    const alreadyMember = group.members.some(
      (m) => m.user && m.user.toString() === targetUserId.toString()
    );

    if (alreadyMember) {
      return res.status(400).json({ code: 1, message: '该用户已是小组成员' });
    }

    group.members.push({
      user: targetUserId,
      role: 'member',
      joinedAt: new Date()
    });

    await group.save();

    logger.info(`User ${targetUserId} invited to group ${groupId} by ${operatorId}`);

    return res.json({
      code: 0,
      data: {
        memberCount: group.members.length,
        message: '邀请成功'
      }
    });
  } catch (error) {
    logger.error(`Invite member error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};
