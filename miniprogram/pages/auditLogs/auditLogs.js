const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError } = require('../../utils/util');

const TYPE_LIST = ['全部类型', '帖子', '超级回声', '评论', '评论回复', '私信'];
const TYPE_KEYS = ['', 'post', 'super_echo', 'comment', 'comment_reply', 'message'];

const ACTION_LIST = ['全部处理', '已拦截', '已打码', '已通过'];
const ACTION_KEYS = ['', 'blocked', 'masked', 'passed'];

const DAYS_LIST = ['近7天', '近30天', '近90天'];
const DAYS_KEYS = [7, 30, 90];

Page({
  data: {
    isLoggedIn: false,
    activeTab: 'stats',
    stats: null,
    statsLoading: false,
    daysIndex: 0,
    daysList: DAYS_LIST,
    list: [],
    listLoading: false,
    listLoadFailed: false,
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    hasMore: true,
    typeIndex: 0,
    typeList: TYPE_LIST,
    actionIndex: 0,
    actionList: ACTION_LIST,
    byTypeList: []
  },

  onLoad() {
    const isLoggedIn = ensureLogin({ redirect: false });
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.loadStats();
    }
  },

  onPullDownRefresh() {
    if (this.data.activeTab === 'stats') {
      this.loadStats().finally(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      this.loadList(true).finally(() => {
        wx.stopPullDownRefresh();
      });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.listLoading && this.data.activeTab === 'logs') {
      this.loadList(false);
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'stats' && !this.data.stats) {
      this.loadStats();
    }
    if (tab === 'logs' && this.data.list.length === 0) {
      this.loadList(true);
    }
  },

  changeDays(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ daysIndex: idx });
    this.loadStats();
  },

  bindTypeChange(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
    this.loadList(true);
  },

  bindActionChange(e) {
    this.setData({ actionIndex: Number(e.detail.value) });
    this.loadList(true);
  },

  async loadStats() {
    this.setData({ statsLoading: true });

    try {
      const days = DAYS_KEYS[this.data.daysIndex];
      const stats = await request.get(config.API.AUDIT_STATS, { days });

      const byTypeList = [];
      if (stats.byType) {
        for (const [key, value] of Object.entries(stats.byType)) {
          byTypeList.push({
            key,
            label: this.getTypeLabel(key),
            count: value
          });
        }
      }

      this.setData({ stats, byTypeList });
    } catch (error) {
      showFriendlyError(error, '加载统计数据失败');
    } finally {
      this.setData({ statsLoading: false });
    }
  },

  async loadList(reset) {
    if (this.data.listLoading) return;

    const page = reset ? 1 : this.data.pagination.page + 1;

    this.setData({ listLoading: true, listLoadFailed: false });

    try {
      const params = {
        page,
        limit: this.data.pagination.limit
      };
      const type = TYPE_KEYS[this.data.typeIndex];
      const action = ACTION_KEYS[this.data.actionIndex];
      if (type) {
        params.type = type;
      }
      if (action) {
        params.action = action;
      }

      const data = await request.get(config.API.AUDIT_LOGS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        createdAtText: formatTimeAgo(item.createdAt),
        typeText: this.getTypeLabel(item.type),
        actionText: this.getActionLabel(item.action),
        matchedWordsPreview: (item.matchedWords || []).slice(0, 3).map((w) => w.word).join('、')
      }));

      const newList = reset ? list : [...this.data.list, ...list];
      const hasMore = page < data.pagination.totalPages;

      this.setData({
        list: newList,
        pagination: data.pagination,
        hasMore,
        listLoadFailed: false
      });
    } catch (error) {
      if (reset) {
        this.setData({ listLoadFailed: true });
      }
      showFriendlyError(error, '加载审核记录失败');
    } finally {
      this.setData({ listLoading: false });
    }
  },

  getTypeLabel(type) {
    const idx = TYPE_KEYS.indexOf(type);
    return idx >= 0 ? TYPE_LIST[idx] : type;
  },

  getActionLabel(action) {
    const idx = ACTION_KEYS.indexOf(action);
    return idx >= 0 ? ACTION_LIST[idx] : action;
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((i) => i._id === id);
    if (!item) return;

    const matchedWords = (item.matchedWords || []).map((w) => `${w.word}（${w.category}，L${w.level}）`).join('\n');
    const content = `内容：${item.content}\n\n命中敏感词：\n${matchedWords || '无'}\n\n处理结果：${item.actionText}\n时间：${item.createdAtText}`;

    wx.showModal({
      title: '审核详情',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  retryLoad() {
    if (this.data.activeTab === 'stats') {
      this.loadStats();
    } else {
      this.loadList(true);
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  }
});
