const socket = require('./utils/socket');

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    authToken: ''
  },

  onLaunch() {
    const userInfo = wx.getStorageSync('userInfo');
    const authToken = wx.getStorageSync('authToken');

    if (userInfo && userInfo.id && authToken) {
      this.globalData.isLogin = true;
      this.globalData.userInfo = userInfo;
      this.globalData.authToken = authToken;
      socket.connect(authToken);
      return;
    }

    this.onLogout();
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
  },

  onLogout() {
    this.globalData.isLogin = false;
    this.globalData.userInfo = null;
    this.globalData.authToken = '';
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('authToken');
    wx.removeStorageSync('userId');
    socket.disconnect();
  }
});
