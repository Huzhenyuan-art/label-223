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

const TAB_BAR_ROUTES = new Set([
  'pages/index/index',
  'pages/publish/publish',
  'pages/messages/messages',
  'pages/profile/profile'
]);

const getPagePath = (url) => url.split('?')[0].replace(/^\//, '');

const preloadPage = (url, callback) => {
  const run = () => {
    try {
      callback();
    } catch (error) {
      console.error('[nav] navigation callback failed:', url, error);
    }
  };

  if (TAB_BAR_ROUTES.has(getPagePath(url))) {
    run();
    return;
  }

  if (typeof wx.preloadPage === 'function') {
    wx.preloadPage({ url, success: run, fail: run });
    return;
  }

  run();
};

const safeNavigateTo = (url, extra = {}) => {
  const { fail, ...rest } = extra;
  preloadPage(url, () => {
    wx.navigateTo({
      url,
      ...rest,
      fail: (error) => {
        console.error('[nav] navigateTo failed:', url, error);
        if (typeof fail === 'function') {
          fail(error);
        }
      }
    });
  });
};

const safeRedirectTo = (url, extra = {}) => {
  const { fail, ...rest } = extra;
  preloadPage(url, () => {
    wx.redirectTo({
      url,
      ...rest,
      fail: (error) => {
        console.error('[nav] redirectTo failed:', url, error);
        if (typeof fail === 'function') {
          fail(error);
        }
      }
    });
  });
};

const safeReLaunch = (url, extra = {}) => {
  const { fail, ...rest } = extra;
  preloadPage(url, () => {
    wx.reLaunch({
      url,
      ...rest,
      fail: (error) => {
        console.error('[nav] reLaunch failed:', url, error);
        if (typeof fail === 'function') {
          fail(error);
        }
      }
    });
  });
};

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

  if (replace) {
    safeReLaunch(LOGIN_PAGE_URL);
    return;
  }

  safeNavigateTo(LOGIN_PAGE_URL, {
    fail: () => safeReLaunch(LOGIN_PAGE_URL)
  });
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
  safeNavigateTo,
  safeRedirectTo,
  safeReLaunch,
  ensureLogin,
  showFriendlyError
};
