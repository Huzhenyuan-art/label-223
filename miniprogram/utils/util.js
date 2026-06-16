const formatTimeAgo = (value) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const diff = Date.now() - date.getTime();

  if (diff < 60000) {
    return '刚刚';
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`;
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateLabel = (value, withTime = false) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  if (!withTime) {
    return `${y}-${m}-${d}`;
  }

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const parseTagsInput = (value) => {
  return [...new Set(
    String(value || '')
      .split(/[，,\s]+/)
      .map((item) => item.trim().replace(/^[#＃]/, ''))
      .filter(Boolean)
  )].slice(0, 5);
};

const LOGIN_PAGE_ROUTE = 'pages/login/login';
const LOGIN_PAGE_URL = '/pages/login/login';

const readAuthSession = () => {
  try {
    const userInfo = wx.getStorageSync('userInfo');
    const authToken = wx.getStorageSync('authToken');
    return { userInfo, authToken };
  } catch (e) {
    console.error('[auth] read storage error:', e);
    return { userInfo: null, authToken: '' };
  }
};

const isAuthenticated = (session) => {
  const { userInfo, authToken } = session || readAuthSession();
  return !!(userInfo && userInfo.id && authToken);
};

const getCurrentRoute = () => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  return currentPage ? currentPage.route : '';
};

const redirectToLogin = (options = {}) => {
  const { replace = true } = options;

  if (getCurrentRoute() === LOGIN_PAGE_ROUTE) {
    return;
  }

  const launch = () => {
    if (getCurrentRoute() === LOGIN_PAGE_ROUTE) {
      return;
    }

    if (replace) {
      wx.reLaunch({
        url: LOGIN_PAGE_URL,
        fail: (error) => {
          console.error('[auth] reLaunch login failed:', error);
          wx.redirectTo({
            url: LOGIN_PAGE_URL,
            fail: (error2) => {
              console.error('[auth] redirectTo login failed:', error2);
              wx.navigateTo({ url: LOGIN_PAGE_URL });
            }
          });
        }
      });
      return;
    }

    wx.navigateTo({
      url: LOGIN_PAGE_URL,
      fail: () => wx.reLaunch({ url: LOGIN_PAGE_URL })
    });
  };

  // 先预加载登录页脚本，避免「Page has not been registered yet」超时白屏
  if (typeof wx.preloadPage === 'function') {
    wx.preloadPage({
      url: LOGIN_PAGE_URL,
      success: launch,
      fail: launch
    });
    return;
  }

  launch();
};

const goToLogin = () => {
  redirectToLogin({ replace: false });
};

const ensureLogin = (options = {}) => {
  const {
    showToast = true,
    redirect = true
  } = options;

  if (isAuthenticated()) {
    return true;
  }

  if (showToast) {
    try {
      wx.showToast({ title: '请先登录', icon: 'none' });
    } catch (e) {
      // ignore
    }
  }

  if (redirect) {
    setTimeout(() => {
      redirectToLogin({ replace: true });
    }, showToast ? 500 : 0);
  }

  return false;
};

const showFriendlyError = (error, fallbackMessage = '操作失败，请稍后重试') => {
  if (error && error.toastShown) {
    return;
  }

  if (error) {
    console.error(error);
  }

  wx.showToast({ title: fallbackMessage, icon: 'none' });
};

module.exports = {
  formatTimeAgo,
  formatDateLabel,
  parseTagsInput,
  readAuthSession,
  isAuthenticated,
  goToLogin,
  redirectToLogin,
  ensureLogin,
  showFriendlyError
};
