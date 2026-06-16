const socket = require('./utils/socket');
const config = require('./config/index');
const request = require('./utils/request');

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    authToken: '',
    unreadCount: 0,
    unreadConversations: {},
    unreadResonanceCount: 0
  },

  _socketHandlers: {},

  onLaunch() {
    const userInfo = wx.getStorageSync('userInfo');
    const authToken = wx.getStorageSync('authToken');

    if (userInfo && userInfo.id && authToken) {
      this.globalData.isLogin = true;
      this.globalData.userInfo = userInfo;
      this.globalData.authToken = authToken;
      socket.connect(authToken);
      this._bindSocketEvents();
      return;
    }

    this.onLogout();
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

    this._socketHandlers = { onUnread, onMessage, onAuth, onResonanceNotify };

    socket.on('unread', onUnread);
    socket.on('message', onMessage);
    socket.on('auth', onAuth);
    socket.on('resonanceNotify', onResonanceNotify);
  },

  _unbindSocketEvents() {
    const { onUnread, onMessage, onAuth, onResonanceNotify } = this._socketHandlers;
    socket.off('unread', onUnread);
    socket.off('message', onMessage);
    socket.off('auth', onAuth);
    socket.off('resonanceNotify', onResonanceNotify);
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
  },

  onLogout() {
    this.globalData.isLogin = false;
    this.globalData.userInfo = null;
    this.globalData.authToken = '';
    this.globalData.unreadCount = 0;
    this.globalData.unreadConversations = {};
    this.globalData.unreadResonanceCount = 0;
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('authToken');
    wx.removeStorageSync('userId');
    wx.removeTabBarBadge({ index: 2 });
    this._unbindSocketEvents();
    socket.disconnect();
  }
});
