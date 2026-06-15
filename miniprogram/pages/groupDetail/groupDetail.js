const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, showFriendlyError, formatTimeAgo } = require('../../utils/util');

Page({
  data: {
    groupId: '',
    group: null,
    posts: [],
    page: 1,
    limit: 20,
    hasMore: true,
    loading: true,
    loadingPosts: false,
    showPostModal: false,
    postTitle: '',
    postContent: '',
    submittingPost: false,
    isOwner: false
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const groupId = options.id;
    if (!groupId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ groupId });
    this.loadGroupDetail();
  },

  onShow() {
    if (!ensureLogin()) return;
    if (this.data.groupId) {
      this.loadGroupDetail();
    }
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadPosts(false);
  },

  async reload() {
    this.setData({ page: 1, posts: [], hasMore: true });
    await Promise.all([this.loadGroupDetail(), this.loadPosts(true)]);
  },

  async loadGroupDetail() {
    try {
      const group = await request.get(`${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}`);
      const app = getApp();
      const isOwner = group.owner && app.globalData.userInfo && group.owner.toString() === app.globalData.userInfo.id;
      this.setData({ group, isOwner });
    } catch (error) {
      showFriendlyError(error, '加载小组信息失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadPosts(forceReset) {
    if (this.data.loadingPosts || (!forceReset && !this.data.hasMore)) {
      return;
    }

    this.setData({ loadingPosts: true });
    try {
      const page = forceReset ? 1 : this.data.page;
      const result = await request.get(
        `${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}/posts`,
        { page, limit: this.data.limit }
      );

      const list = (result.list || []).map((p) => ({
        ...p,
        timeAgo: formatTimeAgo(p.createdAt)
      }));

      this.setData({
        posts: forceReset ? list : [...this.data.posts, ...list],
        page: page + 1,
        hasMore: page < (result.pagination?.pages || 1)
      });
    } catch (error) {
      showFriendlyError(error, '加载帖子失败');
    } finally {
      this.setData({ loadingPosts: false });
    }
  },

  openPostModal() {
    this.setData({ showPostModal: true, postTitle: '', postContent: '' });
  },

  closePostModal() {
    this.setData({ showPostModal: false });
  },

  preventBubble() {},

  onPostTitleInput(e) {
    this.setData({ postTitle: e.detail.value });
  },

  onPostContentInput(e) {
    this.setData({ postContent: e.detail.value });
  },

  async submitPost() {
    const { postTitle, postContent, groupId } = this.data;

    if (!postContent || !postContent.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    this.setData({ submittingPost: true });
    try {
      await request.post(`${config.API.PRIVATE_GROUPS_PREFIX}/${groupId}/posts`, {
        title: (postTitle || '').trim(),
        content: postContent.trim()
      });
      wx.showToast({ title: '发布成功', icon: 'success' });
      this.setData({ showPostModal: false });
      this.reload();
    } catch (error) {
      this.setData({ submittingPost: false });
      showFriendlyError(error, '发布失败');
    }
  },

  goMembers() {
    wx.navigateTo({
      url: `/pages/groupMembers/groupMembers?id=${this.data.groupId}`
    });
  },

  async refreshInviteCode() {
    if (!this.data.isOwner) return;

    wx.showModal({
      title: '重置邀请码',
      content: '重置后旧邀请码将失效，确定吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const data = await request.post(
            `${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}/invite-code/refresh`
          );
          const group = { ...this.data.group, inviteCode: data.inviteCode };
          this.setData({ group });
          wx.showToast({ title: '邀请码已重置', icon: 'success' });
        } catch (error) {
          showFriendlyError(error, '重置失败');
        }
      }
    });
  },

  copyInviteCode() {
    const code = this.data.group?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' });
      }
    });
  },

  async leaveGroup() {
    if (this.data.isOwner) {
      wx.showToast({ title: '组长不能退出小组', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '退出小组',
      content: '确定要退出该小组吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request.post(`${config.API.PRIVATE_GROUPS_PREFIX}/${this.data.groupId}/leave`);
          wx.showToast({ title: '已退出', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 800);
        } catch (error) {
          showFriendlyError(error, '退出失败');
        }
      }
    });
  }
});
