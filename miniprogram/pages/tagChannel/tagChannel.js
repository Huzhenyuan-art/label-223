const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError, safeNavigateTo } = require('../../utils/util');

Page({
  data: {
    tag: '',
    displayName: '',
    description: '',
    subscriberCount: 0,
    postCount: 0,
    isSubscribed: false,
    posts: [],
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    const tag = decodeURIComponent(options.tag || '');
    this.setData({ tag });
    if (!ensureLogin()) {
      return;
    }
    this.reload();
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadPosts(false);
  },

  async reload() {
    this.setData({
      page: 1,
      posts: [],
      hasMore: true
    });
    await this.loadPosts(true);
  },

  async loadPosts(forceReset) {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }

    this.setData({ loading: true });

    try {
      const page = forceReset ? 1 : this.data.page;
      const { tag, limit } = this.data;

      const data = await request.get(`${config.API.TAG_POSTS_PREFIX}/${encodeURIComponent(tag)}/posts`, {
        page,
        limit
      });

      const list = (data.list || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      this.setData({
        tag: data.tag || tag,
        displayName: data.displayName || tag,
        description: data.description || '',
        subscriberCount: data.subscriberCount || 0,
        postCount: data.postCount || 0,
        isSubscribed: data.isSubscribed || false,
        posts: forceReset ? list : [...this.data.posts, ...list],
        page: page + 1,
        hasMore: page < (data.pagination?.pages || 1)
      });
    } catch (error) {
      showFriendlyError(error, '内容加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  async handleSubscribe() {
    const { tag } = this.data;
    try {
      await request.post(`${config.API.TAG_SUBSCRIBE_PREFIX}/subscribe`, { tag });
      this.setData({
        isSubscribed: true,
        subscriberCount: this.data.subscriberCount + 1
      });
      wx.showToast({ title: '订阅成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '订阅失败', icon: 'none' });
    }
  },

  async handleUnsubscribe() {
    const { tag } = this.data;
    try {
      await request.post(`${config.API.TAG_SUBSCRIBE_PREFIX}/unsubscribe`, { tag });
      this.setData({
        isSubscribed: false,
        subscriberCount: Math.max(0, this.data.subscriberCount - 1)
      });
      wx.showToast({ title: '已取消订阅', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async handleToggleResonance(event) {
    const postId = event.currentTarget.dataset.id;
    try {
      const result = await request.post(`${config.API.POST_PREFIX}/${postId}/resonance`);
      const posts = this.data.posts.map((item) => {
        if (item._id !== postId) {
          return item;
        }
        return {
          ...item,
          isResonated: result.resonated,
          resonanceCount: result.resonanceCount
        };
      });
      this.setData({ posts });
    } catch (error) {
      showFriendlyError(error, '共鸣失败，请稍后重试');
    }
  },

  async handleToggleFavorite(event) {
    const postId = event.currentTarget.dataset.id;
    try {
      const result = await request.post(`${config.API.TOGGLE_FAVORITE_PREFIX}/${postId}/toggle`);
      const posts = this.data.posts.map((item) => {
        if (item._id !== postId) {
          return item;
        }
        return {
          ...item,
          isFavorited: result.isFavorited
        };
      });
      this.setData({ posts });
    } catch (error) {
      showFriendlyError(error, '收藏失败，请稍后重试');
    }
  },

  goDetail(event) {
    const postId = event.currentTarget.dataset.id;
    safeNavigateTo(`/pages/detail/detail?id=${postId}`);
  }
});
