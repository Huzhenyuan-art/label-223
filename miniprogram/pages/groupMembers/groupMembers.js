const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    groupId: '',
    group: null,
    members: [],
    isOwner: false,
    loading: true,
    showInviteModal: false,
    searchKeyword: '',
    searchResults: [],
    searching: false
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const groupId = options.id;
    if (!groupId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ groupId });
    this.loadGroup();
  },

  onShow() {
    if (this.data.groupId) {
      this.loadGroup();
    }
  },

  async loadGroup() {
    try {
      const group = await request.get(`${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}`);
      const app = getApp();
      const isOwner = group.owner && app.globalData.userInfo && group.owner.toString() === app.globalData.userInfo.id;
      this.setData({
        group,
        members: group.members || [],
        isOwner
      });
    } catch (error) {
      showFriendlyError(error, '加载成员列表失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  openInviteModal() {
    this.setData({
      showInviteModal: true,
      searchKeyword: '',
      searchResults: []
    });
  },

  closeInviteModal() {
    this.setData({ showInviteModal: false });
  },

  onSearchKeywordInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  async doSearch() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    this.setData({ searching: true });
    try {
      const list = await request.get(config.API.PRIVATE_GROUPS_SEARCH_USERS, { keyword });
      this.setData({ searchResults: list || [] });
    } catch (error) {
      showFriendlyError(error, '搜索失败');
    } finally {
      this.setData({ searching: false });
    }
  },

  async inviteUser(e) {
    const userId = e.currentTarget.dataset.id;
    try {
      await request.post(`${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}/invite`, {
        userId
      });
      wx.showToast({ title: '邀请成功', icon: 'success' });
      this.setData({ searchResults: [] });
      this.loadGroup();
    } catch (error) {
      showFriendlyError(error, '邀请失败');
    }
  },

  removeMember(e) {
    const memberId = e.currentTarget.dataset.id;
    const member = this.data.members.find((m) => m.user.id === memberId);
    if (!member) return;

    wx.showModal({
      title: '移除成员',
      content: `确定要将「${member.user.nickname}」移出小组吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request.delete(
            `${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}/members/${memberId}`
          );
          wx.showToast({ title: '已移除', icon: 'success' });
          this.loadGroup();
        } catch (error) {
          showFriendlyError(error, '移除失败');
        }
      }
    });
  }
});
