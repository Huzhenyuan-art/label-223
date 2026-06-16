const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError, goToLogin } = require('../../utils/util');

const FILTER_CATEGORY_LIST = [
  '全部分类',
  '政治敏感',
  '暴力恐怖',
  '色情低俗',
  '广告推广',
  '辱骂攻击',
  '其他'
];

const FILTER_CATEGORY_KEYS = ['', 'politics', 'violence', 'pornography', 'advertising', 'insult', 'other'];

const CATEGORY_LIST = [
  '政治敏感',
  '暴力恐怖',
  '色情低俗',
  '广告推广',
  '辱骂攻击',
  '其他'
];

const CATEGORY_KEYS = ['politics', 'violence', 'pornography', 'advertising', 'insult', 'other'];

const LEVEL_LIST = [
  '低风险（打码）',
  '中风险（打码）',
  '高风险（拦截）'
];

const LEVEL_KEYS = [1, 2, 3];

Page({
  data: {
    isLoggedIn: false,
    list: [],
    loading: false,
    loadFailed: false,
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    hasMore: true,
    activeTab: 'list',
    keyword: '',
    filterCategoryIndex: 0,
    filterCategoryList: FILTER_CATEGORY_LIST,
    filterEnabled: '',
    addWord: '',
    addCategoryIndex: 5,
    addCategoryList: CATEGORY_LIST,
    addLevelIndex: 1,
    addLevelList: LEVEL_LIST,
    addingWord: false,
    batchText: '',
    batchCategoryIndex: 5,
    batchCategoryList: CATEGORY_LIST,
    batchLevelIndex: 1,
    batchLevelList: LEVEL_LIST,
    batchImporting: false
  },

  onLoad() {
    const isLoggedIn = ensureLogin({ redirect: false });
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.loadList(true);
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && this.data.activeTab === 'list') {
      this.loadList(false);
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'list' && this.data.list.length === 0) {
      this.loadList(true);
    }
  },

  bindKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  bindFilterCategoryChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ filterCategoryIndex: idx });
    this.loadList(true);
  },

  bindEnabledChange(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ filterEnabled: value === 'all' ? '' : value });
    this.loadList(true);
  },

  async loadList(reset) {
    if (this.data.loading) return;

    const page = reset ? 1 : this.data.pagination.page + 1;

    this.setData({ loading: true, loadFailed: false });

    try {
      const params = {
        page,
        limit: this.data.pagination.limit
      };
      const category = FILTER_CATEGORY_KEYS[this.data.filterCategoryIndex];
      if (category) {
        params.category = category;
      }
      if (this.data.filterEnabled !== '') {
        params.enabled = this.data.filterEnabled;
      }
      if (this.data.keyword) {
        params.keyword = this.data.keyword;
      }

      const data = await request.get(config.API.AUDIT_SENSITIVE_WORDS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        createdAtText: formatTimeAgo(item.createdAt),
        categoryText: this.getCategoryLabel(item.category),
        levelText: this.getLevelLabel(item.level)
      }));

      const newList = reset ? list : [...this.data.list, ...list];
      const hasMore = page < data.pagination.totalPages;

      this.setData({
        list: newList,
        pagination: data.pagination,
        hasMore,
        loadFailed: false
      });
    } catch (error) {
      if (reset) {
        this.setData({ loadFailed: true });
      }
      showFriendlyError(error, '加载敏感词列表失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  getCategoryLabel(category) {
    const idx = CATEGORY_KEYS.indexOf(category);
    return idx >= 0 ? CATEGORY_LIST[idx] : category;
  },

  getLevelLabel(level) {
    const idx = LEVEL_KEYS.indexOf(level);
    return idx >= 0 ? LEVEL_LIST[idx] : `${level}级`;
  },

  bindAddWordInput(e) {
    this.setData({ addWord: e.detail.value });
  },

  bindAddCategoryChange(e) {
    this.setData({ addCategoryIndex: Number(e.detail.value) });
  },

  bindAddLevelChange(e) {
    this.setData({ addLevelIndex: Number(e.detail.value) });
  },

  async addSingleWord() {
    const { addWord, addCategoryIndex, addLevelIndex } = this.data;

    if (!addWord || !addWord.trim()) {
      wx.showToast({ title: '请输入敏感词', icon: 'none' });
      return;
    }

    this.setData({ addingWord: true });

    try {
      await request.post(config.API.AUDIT_SENSITIVE_WORDS, {
        word: addWord.trim(),
        category: CATEGORY_KEYS[addCategoryIndex],
        level: LEVEL_KEYS[addLevelIndex],
        enabled: true
      });

      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ addWord: '', addCategoryIndex: 5, addLevelIndex: 1 });
      this.loadList(true);
    } catch (error) {
      showFriendlyError(error, '添加失败');
    } finally {
      this.setData({ addingWord: false });
    }
  },

  bindBatchTextInput(e) {
    this.setData({ batchText: e.detail.value });
  },

  bindBatchCategoryChange(e) {
    this.setData({ batchCategoryIndex: Number(e.detail.value) });
  },

  bindBatchLevelChange(e) {
    this.setData({ batchLevelIndex: Number(e.detail.value) });
  },

  async batchImport() {
    const { batchText, batchCategoryIndex, batchLevelIndex } = this.data;

    if (!batchText || !batchText.trim()) {
      wx.showToast({ title: '请输入批量内容', icon: 'none' });
      return;
    }

    const lines = batchText.trim().split(/[\n,，;；]/).filter((line) => line.trim());
    if (lines.length === 0) {
      wx.showToast({ title: '未检测到有效内容', icon: 'none' });
      return;
    }

    const defaultCategory = CATEGORY_KEYS[batchCategoryIndex];
    const defaultLevel = LEVEL_KEYS[batchLevelIndex];

    const words = lines.map((line) => {
      const trimmed = line.trim();
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const catIdx = CATEGORY_KEYS.indexOf(parts[1]);
        const lvl = isNaN(Number(parts[2])) ? defaultLevel : Number(parts[2]);
        return {
          word: parts[0],
          category: catIdx >= 0 ? parts[1] : defaultCategory,
          level: LEVEL_KEYS.includes(lvl) ? lvl : defaultLevel
        };
      }
      return { word: trimmed, category: defaultCategory, level: defaultLevel };
    });

    this.setData({ batchImporting: true });

    try {
      const result = await request.post(config.API.AUDIT_SENSITIVE_WORDS_BATCH, { words });
      wx.showToast({
        title: `成功${result.created || 0}条，跳过${result.skipped || 0}条`,
        icon: 'none',
        duration: 2000
      });
      this.setData({ batchText: '' });
      this.loadList(true);
    } catch (error) {
      showFriendlyError(error, '批量导入失败');
    } finally {
      this.setData({ batchImporting: false });
    }
  },

  async toggleWord(e) {
    const id = e.currentTarget.dataset.id;

    try {
      await request.post(`${config.API.AUDIT_SENSITIVE_WORDS_PREFIX}/${id}/toggle`);
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.loadList(true);
    } catch (error) {
      showFriendlyError(error, '操作失败');
    }
  },

  async deleteWord(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个敏感词吗？',
      confirmText: '删除',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.delete(`${config.API.AUDIT_SENSITIVE_WORDS_PREFIX}/${id}`);
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadList(true);
          } catch (error) {
            showFriendlyError(error, '删除失败');
          }
        }
      }
    });
  },

  async initDefaults() {
    wx.showModal({
      title: '初始化默认词库',
      content: '将添加预设的常用敏感词，是否继续？',
      confirmText: '初始化',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.post(config.API.AUDIT_SENSITIVE_WORDS_INIT);
            wx.showToast({ title: '初始化成功', icon: 'success' });
            this.loadList(true);
          } catch (error) {
            showFriendlyError(error, '初始化失败');
          }
        }
      }
    });
  },

  async refreshCache() {
    try {
      await request.post(config.API.AUDIT_CACHE_REFRESH);
      wx.showToast({ title: '缓存已刷新', icon: 'success' });
    } catch (error) {
      showFriendlyError(error, '刷新缓存失败');
    }
  },

  retryLoad() {
    this.loadList(true);
  },

  goLogin() {
    goToLogin();
  }
});
