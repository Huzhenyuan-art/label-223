const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, parseTagsInput, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    modes: [
      { key: 'recommend', label: '海洋流' },
      { key: 'hot', label: '热点频率榜' },
      { key: 'search', label: '深海搜索' }
    ],
    activeMode: 'recommend',
    keyword: '',
    tagsInput: '',
    searchTags: [],
    posts: [],
    hotTags: [],
    radarTags: [],
    preferredTags: [],
    page: 1,
    limit: 10,
    hasMore: true,
    loading: false
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this.reload();
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
      const { activeMode, limit, keyword, searchTags } = this.data;
      let data;

      if (activeMode === 'search') {
        data = await request.get(config.API.DEEP_SEARCH, {
          page,
          limit,
          keyword,
          tags: searchTags.join(',')
        });
      } else {
        data = await request.get(config.API.OCEAN, {
          page,
          limit,
          mode: activeMode,
          keyword
        });
      }

      if (activeMode === 'hot') {
        const hot = await request.get(config.API.HOT_TAGS);
        const hotTags = hot.list || [];
        this.setData({
          hotTags,
          radarTags: this.buildRadarTags(hotTags)
        });
      } else {
        this.setData({ hotTags: [], radarTags: [] });
      }

      const list = (data.list || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      this.setData({
        posts: forceReset ? list : [...this.data.posts, ...list],
        page: page + 1,
        preferredTags: data.preferredTags || [],
        hasMore: page < (data.pagination?.pages || 1)
      });
    } catch (error) {
      showFriendlyError(error, '内容加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  buildRadarTags(hotTags) {
    const slots = [
      { x: 50, y: 10 },
      { x: 76, y: 20 },
      { x: 86, y: 44 },
      { x: 74, y: 70 },
      { x: 50, y: 82 },
      { x: 24, y: 70 },
      { x: 14, y: 44 },
      { x: 26, y: 20 }
    ];

    return hotTags.slice(0, slots.length).map((item, index) => ({
      ...item,
      style: `left:${slots[index].x}%;top:${slots[index].y}%;`
    }));
  },

  handleModeChange(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.activeMode) {
      return;
    }

    this.setData({ activeMode: mode });
    this.reload();
  },

  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  handleTagsInput(event) {
    this.setData({ tagsInput: event.detail.value });
  },

  handleSearchApply() {
    this.setData({ searchTags: parseTagsInput(this.data.tagsInput) });
    this.reload();
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
    wx.navigateTo({ url: `/pages/detail/detail?id=${postId}` });
  }
});
