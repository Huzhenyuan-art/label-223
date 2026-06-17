const socket = require('./utils/socket');
const config = require('./config/index');
const request = require('./utils/request');
const { isAuthenticated, readAuthSession, redirectToLogin, safeReLaunch, preloadSubPages } = require('./utils/util');

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    authToken: '',
    unreadCount: 0,
    unreadConversations: {},
    unreadResonanceCount: 0,
    unreadNotificationCount: 0,
    unreadNotificationsByType: {
      resonance: 0,
      comment: 0,
      super_echo: 0,
      reveal_request: 0,
      reveal_success: 0,
      total: 0
    },
    authBootstrapped: false
  },

  _socketHandlers: {},

  onLaunch() {
    try {
      const session = readAuthSession();

      if (isAuthenticated(session)) {
        this.globalData.isLogin = true;
        this.globalData.userInfo = session.userInfo;
        this.globalData.authToken = session.authToken;
        this.globalData.authBootstrapped = true;
        socket.connect(session.authToken);
        this._bindSocketEvents();
        safeReLaunch('/pages/index/index');
        preloadSubPages({ delay: 500 });
        return;
      }

      // 登录页已是入口页，仅需清理本地状态，无需 reLaunch
      this.onLogout({ redirect: false });
      preloadSubPages({ delay: 800 });
    } catch (error) {
      console.error('[app] onLaunch error:', error);
      this.onLogout({ redirect: false });
      preloadSubPages({ delay: 800 });
    }
  },

  _bindSocketEvents() {
    const onUnread = (data) => {
      this._applyUnread(data);
    };

    const onMessage = () => {
      this.refreshUnreadCount();
    };

    const onAuth = (result) => {
      if (!result.success) {
        console.error('[app] socket auth failed');
      }
    };

    const onResonanceNotify = () => {
      this.refreshResonanceCount();
    };

    const onNotificationUnread = (data) => {
      this._applyNotificationUnread(data);
    };

    this._socketHandlers = { onUnread, onMessage, onAuth, onResonanceNotify, onNotificationUnread };

    socket.on('unread', onUnread);
    socket.on('message', onMessage);
    socket.on('auth', onAuth);
    socket.on('resonanceNotify', onResonanceNotify);
    socket.on('notification_unread', onNotificationUnread);
  },

  _unbindSocketEvents() {
    const { onUnread, onMessage, onAuth, onResonanceNotify, onNotificationUnread } = this._socketHandlers;
    socket.off('unread', onUnread);
    socket.off('message', onMessage);
    socket.off('auth', onAuth);
    socket.off('resonanceNotify', onResonanceNotify);
    socket.off('notification_unread', onNotificationUnread);
    this._socketHandlers = {};
  },

  _applyUnread(data) {
    if (!data) return;
    const total = data.total || 0;
    const conversations = data.conversations || {};
    this.globalData.unreadCount = total;
    this.globalData.unreadConversations = conversations;
    this._updateTabBadge(total);
  },

  _updateTabBadge(count) {
    if (count > 0) {
      wx.setTabBarBadge({ index: 2, text: String(count > 99 ? '99+' : count) });
    } else {
      wx.removeTabBarBadge({ index: 2 });
    }
  },

  async refreshUnreadCount() {
    try {
      const data = await request.get(config.API.UNREAD_COUNT);
      const count = data?.count || 0;
      this.globalData.unreadCount = count;
      this._updateTabBadge(count);
      return count;
    } catch (e) {
      return 0;
    }
  },

  async refreshResonanceCount() {
    try {
      const data = await request.get(config.API.RESONANCE_NOTIFICATIONS_UNREAD);
      const count = data?.count || 0;
      this.globalData.unreadResonanceCount = count;
      return count;
    } catch (e) {
      return 0;
    }
  },

  _applyNotificationUnread(data) {
    if (!data) return;
    this.globalData.unreadNotificationCount = data.total || 0;
    this.globalData.unreadNotificationsByType = {
      resonance: data.resonance || 0,
      comment: data.comment || 0,
      super_echo: data.super_echo || 0,
      reveal_request: data.reveal_request || 0,
      reveal_success: data.reveal_success || 0,
      total: data.total || 0
    };
  },

  async refreshNotificationCount() {
    try {
      const data = await request.get(config.API.NOTIFICATIONS_UNREAD_BY_TYPE);
      if (data) {
        this._applyNotificationUnread(data);
      }
      return data?.total || 0;
    } catch (e) {
      return 0;
    }
  },

  onLoginSuccess(session) {
    const userInfo = session?.user;
    const authToken = session?.token;
    if (!userInfo || !userInfo.id || !authToken) {
      return;
    }

    this.globalData.isLogin = true;
    this.globalData.userInfo = userInfo;
    this.globalData.authToken = authToken;
    wx.setStorageSync('userInfo', userInfo);
    wx.setStorageSync('authToken', authToken);
    wx.setStorageSync('userId', userInfo.id);
    socket.connect(authToken);
    this._bindSocketEvents();
    preloadSubPages({ delay: 200 });
  },

  onLogout(options = {}) {
    const { redirect = false } = options;

    this.globalData.isLogin = false;
    this.globalData.userInfo = null;
    this.globalData.authToken = '';
    this.globalData.unreadCount = 0;
    this.globalData.unreadConversations = {};
    this.globalData.unreadResonanceCount = 0;
    this.globalData.unreadNotificationCount = 0;
    this.globalData.unreadNotificationsByType = {
      resonance: 0,
      comment: 0,
      super_echo: 0,
      reveal_request: 0,
      reveal_success: 0,
      total: 0
    };
    this.globalData.authBootstrapped = true;

    try {
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('authToken');
      wx.removeStorageSync('userId');
    } catch (e) {
      console.error('[app] remove storage error:', e);
    }

    try {
      wx.removeTabBarBadge({ index: 2 });
    } catch (e) {
      // ignore
    }

    this._unbindSocketEvents();
    socket.disconnect();

    if (redirect) {
      redirectToLogin({ replace: true });
    }
  }
});
