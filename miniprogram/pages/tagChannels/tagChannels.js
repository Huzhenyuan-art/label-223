Page({
  data: {
    activeTab: 'recommend',
    tabs: [
      { key: 'recommend', label: '推荐订阅' },
      { key: 'all', label: '全部标签' },
      { key: 'subscribed', label: '我的订阅' }
    ],
    keyword: '',
    recommendTags: [],
    allTags: [],
    subscribedTags: [],
    page: 1,
    limit: 50,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadInitialData();
  },

  onPullDownRefresh() {
    this.loadInitialData().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.activeTab === 'all') {
      this.loadAllTags(false);
    }
  },

  async loadInitialData() {
    try {
      await Promise.all([
        this.loadRecommendTags(),
        this.loadSubscribedTags(),
        this.loadAllTags(true)
      ]);
    } catch (error) {
      // 静默处理
    }
  },

  async loadRecommendTags() {
    const request = require('../../utils/request');
    const config = require('../../config/index');

    try {
      const data = await request.get(config.API.TAG_CHANNELS_RECOMMEND, { limit: 20 });
      const subscribedTags = this.data.subscribedTags.map((t) => t.tag);
      const list = (data.list || []).map((item) => ({
        ...item,
        isSubscribed: subscribedTags.includes(item.tag)
      }));
      this.setData({ recommendTags: list });
    } catch (error) {
      // 静默处理
    }
  },

  async loadSubscribedTags() {
    const request = require('../../utils/request');
    const config = require('../../config/index');

    try {
      const data = await request.get(config.API.TAG_MY_SUBSCRIBED);
      this.setData({ subscribedTags: data.list || [] });
    } catch (error) {
      // 静默处理
    }
  },

  async loadAllTags(forceReset) {
    if (this.data.loading || (!forceReset && !this.data.hasMore)) {
      return;
    }

    const request = require('../../utils/request');
    const config = require('../../config/index');

    this.setData({ loading: true });

    try {
      const page = forceReset ? 1 : this.data.page;
      const { keyword, limit, subscribedTags } = this.data;
      const subscribedSet = new Set(subscribedTags.map((t) => t.tag));

      const data = await request.get(config.API.TAG_CHANNELS, {
        page,
        limit,
        keyword
      });

      const list = (data.list || []).map((item) => ({
        ...item,
        isSubscribed: subscribedSet.has(item.tag)
      }));

      this.setData({
        allTags: forceReset ? list : [...this.data.allTags, ...list],
        page: page + 1,
        hasMore: page < (data.pagination?.pages || 1)
      });
    } catch (error) {
      // 静默处理
    } finally {
      this.setData({ loading: false });
    }
  },

  handleTabChange(event) {
    const tab = event.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  handleSearch() {
    this.setData({ page: 1, allTags: [], hasMore: true });
    this.loadAllTags(true);
  },

  async handleSubscribe(event) {
    const tag = event.currentTarget.dataset.tag;
    const request = require('../../utils/request');
    const config = require('../../config/index');

    try {
      await request.post(`${config.API.TAG_SUBSCRIBE_PREFIX}/subscribe`, { tag });
      this.syncSubscribeState(tag, true);
      wx.showToast({ title: '订阅成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: '订阅失败', icon: 'none' });
    }
  },

  async handleUnsubscribe(event) {
    const tag = event.currentTarget.dataset.tag;
    const request = require('../../utils/request');
    const config = require('../../config/index');

    try {
      await request.post(`${config.API.TAG_SUBSCRIBE_PREFIX}/unsubscribe`, { tag });
      this.syncSubscribeState(tag, false);
      wx.showToast({ title: '已取消订阅', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  syncSubscribeState(tag, isSubscribed) {
    const subscribedTags = isSubscribed
      ? [...this.data.subscribedTags, { tag, displayName: tag, isSubscribed: true }]
      : this.data.subscribedTags.filter((t) => t.tag !== tag);

    const allTags = this.data.allTags.map((item) =>
      item.tag === tag ? { ...item, isSubscribed } : item
    );
    const recommendTags = this.data.recommendTags.map((item) =>
      item.tag === tag ? { ...item, isSubscribed } : item
    );

    this.setData({ subscribedTags, allTags, recommendTags });
  },

  goTagChannel(event) {
    const tag = event.currentTarget.dataset.tag;
    wx.navigateTo({ url: `/pages/tagChannel/tagChannel?tag=${encodeURIComponent(tag)}` });
  }
});
