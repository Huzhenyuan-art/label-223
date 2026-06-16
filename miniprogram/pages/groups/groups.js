const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, showFriendlyError, formatTimeAgo, safeNavigateTo } = require('../../utils/util');

Page({
  data: {
    groups: [],
    loading: true,
    inviteCode: '',
    showJoinModal: false
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadGroups();
  },

  onPullDownRefresh() {
    this.loadGroups().finally(() => wx.stopPullDownRefresh());
  },

  async loadGroups() {
    this.setData({ loading: true });
    try {
      const list = await request.get(config.API.PRIVATE_GROUPS_MY);
      const groups = (list || []).map((g) => ({
        ...g,
        timeAgo: formatTimeAgo(g.createdAt)
      }));
      this.setData({ groups });
    } catch (error) {
      showFriendlyError(error, '加载小组列表失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  goCreate() {
    safeNavigateTo('/pages/groupCreate/groupCreate');
  },

  openJoinModal() {
    this.setData({ showJoinModal: true, inviteCode: '' });
  },

  closeJoinModal() {
    this.setData({ showJoinModal: false });
  },

  preventBubble() {},

  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  async submitJoin() {
    const { inviteCode } = this.data;
    if (!inviteCode || !inviteCode.trim()) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }

    try {
      await request.post(config.API.PRIVATE_GROUPS_JOIN, {
        inviteCode: inviteCode.trim()
      });
      wx.showToast({ title: '加入成功', icon: 'success' });
      this.setData({ showJoinModal: false });
      this.loadGroups();
    } catch (error) {
      showFriendlyError(error, '加入失败');
    }
  },

  goDetail(e) {
    const groupId = e.currentTarget.dataset.id;
    safeNavigateTo(`/pages/groupDetail/groupDetail?id=${groupId}`);
  }
});
