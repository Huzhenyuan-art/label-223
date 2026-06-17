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

const PRELOAD_SETTLE_MS = 150;
const NAV_RETRY_TIMES = 5;
const NAV_RETRY_DELAY_MS = 120;

// 非 TabBar 子页面：启动后批量预加载，避免按需注入导致 Page 未注册
const SUB_PAGES = [
  '/pages/detail/detail',
  '/pages/member/member',
  '/pages/favorites/favorites',
  '/pages/groups/groups',
  '/pages/chat/chat',
  '/pages/edit/edit',
  '/pages/sensitiveWords/sensitiveWords',
  '/pages/auditLogs/auditLogs',
  '/pages/admin/admin',
  '/pages/publicProfile/publicProfile',
  '/pages/groupCreate/groupCreate',
  '/pages/groupDetail/groupDetail',
  '/pages/groupMembers/groupMembers',
  '/pages/myItems/myItems',
  '/pages/transactions/transactions',
  '/pages/tagChannels/tagChannels',
  '/pages/tagChannel/tagChannel',
  '/pages/drafts/drafts'
];

const getPagePath = (url) => url.split('?')[0].replace(/^\//, '');

const isPageNotRegisteredError = (error) => {
  const msg = (error && error.errMsg) || '';
  return /not been registered/i.test(msg) || /timeout/i.test(msg);
};

const preloadPage = (url, callback) => {
  const run = () => {
    setTimeout(() => {
      try {
        callback();
      } catch (error) {
        console.error('[nav] navigation callback failed:', url, error);
      }
    }, TAB_BAR_ROUTES.has(getPagePath(url)) ? 0 : PRELOAD_SETTLE_MS);
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

const runNavigation = (url, wxMethod, extra, retriesLeft) => {
  const { fail, ...rest } = extra;

  wxMethod({
    url,
    ...rest,
    fail: (error) => {
      if (isPageNotRegisteredError(error) && retriesLeft > 0) {
        console.warn(`[nav] page not ready, retry (${retriesLeft} left):`, url);
        setTimeout(() => {
          preloadPage(url, () => {
            runNavigation(url, wxMethod, extra, retriesLeft - 1);
          });
        }, NAV_RETRY_DELAY_MS);
        return;
      }

      console.error('[nav] navigation failed:', url, error);
      if (typeof fail === 'function') {
        fail(error);
      }
    }
  });
};

const safeNavigateTo = (url, extra = {}) => {
  preloadPage(url, () => runNavigation(url, wx.navigateTo, extra, NAV_RETRY_TIMES));
};

const safeRedirectTo = (url, extra = {}) => {
  preloadPage(url, () => runNavigation(url, wx.redirectTo, extra, NAV_RETRY_TIMES));
};

const safeReLaunch = (url, extra = {}) => {
  preloadPage(url, () => runNavigation(url, wx.reLaunch, extra, NAV_RETRY_TIMES));
};

const preloadSubPages = (options = {}) => {
  const { delay = 300 } = options;

  if (typeof wx.preloadPage !== 'function') {
    return;
  }

  setTimeout(() => {
    SUB_PAGES.forEach((pageUrl, index) => {
      setTimeout(() => {
        wx.preloadPage({ url: pageUrl, fail: () => {} });
      }, index * 40);
    });
  }, delay);
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

const normalizeDynamicTag = (tag) => {
  if (!tag) return '';
  return tag.startsWith('#') || tag.startsWith('＃')
    ? tag
    : `#${tag}`;
};

const formatCountdown = (ms) => {
  if (ms <= 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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
  preloadSubPages,
  ensureLogin,
  showFriendlyError,
  normalizeDynamicTag,
  formatCountdown
};
