const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    isLoggedIn: false,
    profile: null,
    metrics: null,
    interestMap: [],
    favoritesByTag: [],
    myPosts: [],
    resonanceNotifications: [],
    unreadResonanceCount: 0,
    resonanceNotifyLoading: false,
    loading: false,
    loadFailed: false
  },

  onShow() {
    const isLoggedIn = ensureLogin({ redirect: false });
    this.setData({ isLoggedIn });

    if (!isLoggedIn) {
      this.setData({
        profile: null,
        metrics: null,
        interestMap: [],
        favoritesByTag: [],
        myPosts: [],
        resonanceNotifications: [],
        unreadResonanceCount: 0,
        resonanceNotifyLoading: false,
        loading: false,
        loadFailed: false
      });
      return;
    }
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true, loadFailed: false });

    try {
      const island = await request.get(config.API.ISLAND);
      let myPosts = [];

      try {
        myPosts = await request.get(config.API.MY_POSTS);
      } catch (error) {
        showFriendlyError(error, '我的频率加载失败，已展示基础岛屿信息');
      }

      const interestMap = (island.interestMap || []).map((item) => ({
        ...item,
        size: Math.min(52, 24 + item.score * 1.4)
      }));

      this.setData({
        profile: island.profile,
        metrics: island.metrics,
        interestMap,
        favoritesByTag: island.favoritesByTag || [],
        unreadResonanceCount: island.unreadResonanceNotificationCount || 0,
        myPosts: (myPosts || []).map((item) => ({
          ...item,
          timeAgo: formatTimeAgo(item.createdAt)
        })),
        loadFailed: false
      });

      if (island.unreadResonanceNotificationCount > 0) {
        this.loadResonanceNotifications();
      }

      const app = getApp();
      app.globalData.unreadResonanceCount = island.unreadResonanceNotificationCount || 0;
    } catch (error) {
      const authExpired = error?.statusCode === 401 || (error?.statusCode === 404 && error?.message === 'User not found');
      if (authExpired) {
        const app = getApp();
        app.onLogout();
        this.setData({
          isLoggedIn: false,
          profile: null,
          metrics: null,
          interestMap: [],
          favoritesByTag: [],
          myPosts: [],
          loadFailed: false
        });
        if (!error?.toastShown) {
          wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
        }
        return;
      }

      this.setData({ loadFailed: true });
      showFriendlyError(error, '岛屿数据加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  goMemberPage() {
    wx.navigateTo({ url: '/pages/member/member' });
  },

  goFavorites() {
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  goGroups() {
    wx.navigateTo({ url: '/pages/groups/groups' });
  },

  goAuditLogs() {
    wx.navigateTo({ url: '/pages/auditLogs/auditLogs' });
  },

  goSensitiveWords() {
    wx.navigateTo({ url: '/pages/sensitiveWords/sensitiveWords' });
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` });
  },

  async loadResonanceNotifications() {
    this.setData({ resonanceNotifyLoading: true });

    try {
      const data = await request.get(config.API.RESONANCE_NOTIFICATIONS, { limit: 20 });
      const list = (data.list || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));
      this.setData({ resonanceNotifications: list });
    } catch (error) {
      showFriendlyError(error, '合鸣通知加载失败');
    } finally {
      this.setData({ resonanceNotifyLoading: false });
    }
  },

  async goResonanceNotification(event) {
    const { postid, notificationid } = event.currentTarget.dataset;

    if (notificationid) {
      try {
        await request.post(config.API.RESONANCE_NOTIFICATIONS_READ, {
          notificationIds: [notificationid]
        });
      } catch (e) {
        // ignore
      }
    }

    const newCount = Math.max(0, this.data.unreadResonanceCount - 1);
    this.setData({ unreadResonanceCount: newCount });

    const app = getApp();
    app.globalData.unreadResonanceCount = newCount;

    wx.navigateTo({ url: `/pages/detail/detail?id=${postid}` });
  },

  async markAllResonanceRead() {
    try {
      await request.post(config.API.RESONANCE_NOTIFICATIONS_READ, {});
      this.setData({ unreadResonanceCount: 0 });
      const app = getApp();
      app.globalData.unreadResonanceCount = 0;

      const notifications = this.data.resonanceNotifications.map((item) => ({
        ...item,
        read: true
      }));
      this.setData({ resonanceNotifications: notifications });

      wx.showToast({ title: '已全部标记为已读', icon: 'success' });
    } catch (error) {
      showFriendlyError(error, '标记失败，请稍后重试');
    }
  },

  retryLoad() {
    if (!this.data.isLoggedIn) {
      this.goLogin();
      return;
    }
    this.loadData();
  },

  logout() {
    const app = getApp();
    app.onLogout();
    this.setData({
      isLoggedIn: false,
      profile: null,
      metrics: null,
      interestMap: [],
      favoritesByTag: [],
      myPosts: [],
      resonanceNotifications: [],
      unreadResonanceCount: 0,
      resonanceNotifyLoading: false,
      loadFailed: false
    });
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  }
});
