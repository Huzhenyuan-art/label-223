const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError, safeNavigateTo } = require('../../utils/util');

Page({
  data: {
    id: '',
    profile: null,
    posts: [],
    loading: false
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });

    try {
      const data = await request.get(`${config.API.USER_PUBLIC_PREFIX}/${this.data.id}`);
      const posts = (data.posts || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      this.setData({
        profile: data.profile,
        posts
      });
    } catch (error) {
      showFriendlyError(error, '主页加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(event) {
    safeNavigateTo(`/pages/detail/detail?id=${event.currentTarget.dataset.id}`);
  }
});
