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

const ensureLogin = (options = {}) => {
  const {
    showToast = true,
    redirect = true
  } = options;

  let authToken;
  try {
    authToken = wx.getStorageSync('authToken');
  } catch (e) {
    console.error('[ensureLogin] get storage error:', e);
    authToken = null;
  }

  if (authToken) {
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
      try {
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        const currentRoute = currentPage ? currentPage.route : '';
        if (currentRoute === 'pages/login/login') {
          return;
        }
        wx.reLaunch({ url: '/pages/login/login' });
      } catch (e) {
        console.error('[ensureLogin] redirect error:', e);
        try {
          wx.redirectTo({ url: '/pages/login/login' });
        } catch (e2) {
          try {
            wx.navigateTo({ url: '/pages/login/login' });
          } catch (e3) {
            console.error('[ensureLogin] all redirect methods failed');
          }
        }
      }
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
  ensureLogin,
  showFriendlyError
};
