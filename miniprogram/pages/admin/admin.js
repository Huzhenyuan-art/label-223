const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError, goToLogin, safeNavigateTo } = require('../../utils/util');

const MODULE_MAP = {
  user: '用户管理',
  post: '帖子管理',
  message: '私信管理',
  order: '订单管理',
  camp_inquiry: '营地咨询',
  sensitive_word: '敏感词',
  system: '系统'
};

Page({
  data: {
    isLoggedIn: false,
    activeTab: 'dashboard',
    loading: false,

    dashboard: null,
    dashboardLoading: false,

    userList: [],
    userPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    userLoading: false,
    userKeyword: '',
    userStatusIndex: 0,
    userListLoading: false,

    postList: [],
    postPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    postLoading: false,
    postKeyword: '',
    postStatusIndex: 0,
    postListLoading: false,

    conversationList: [],
    conversationPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    conversationLoading: false,
    conversationKeyword: '',
    conversationListLoading: false,

    orderList: [],
    orderPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    orderLoading: false,
    orderStatusIndex: 0,
    orderListLoading: false,
    orderStats: null,

    inquiryList: [],
    inquiryPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    inquiryLoading: false,
    inquiryStatusIndex: 0,
    inquiryListLoading: false,
    inquiryStats: null,

    logList: [],
    logPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    logLoading: false,
    logModuleIndex: 0,
    logListLoading: false
  },

  onLoad() {
    const isLoggedIn = ensureLogin({ redirect: false });
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.loadDashboard();
    }
  },

  onShow() {
    const isLoggedIn = ensureLogin({ redirect: false });
    this.setData({ isLoggedIn });
  },

  onPullDownRefresh() {
    const tab = this.data.activeTab;
    if (tab === 'dashboard') {
      this.loadDashboard().finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'users') {
      this.loadUsers(true).finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'posts') {
      this.loadPosts(true).finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'messages') {
      this.loadConversations(true).finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'orders') {
      this.loadOrders(true).finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'inquiries') {
      this.loadInquiries(true).finally(() => wx.stopPullDownRefresh());
    } else if (tab === 'logs') {
      this.loadLogs(true).finally(() => wx.stopPullDownRefresh());
    }
  },

  onReachBottom() {
    const tab = this.data.activeTab;
    if (tab === 'users' && this.data.userHasMore) this.loadUsers(false);
    else if (tab === 'posts' && this.data.postHasMore) this.loadPosts(false);
    else if (tab === 'messages' && this.data.conversationHasMore) this.loadConversations(false);
    else if (tab === 'orders' && this.data.orderHasMore) this.loadOrders(false);
    else if (tab === 'inquiries' && this.data.inquiryHasMore) this.loadInquiries(false);
    else if (tab === 'logs' && this.data.logHasMore) this.loadLogs(false);
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'dashboard' && !this.data.dashboard) this.loadDashboard();
    else if (tab === 'users' && this.data.userList.length === 0) this.loadUsers(true);
    else if (tab === 'posts' && this.data.postList.length === 0) this.loadPosts(true);
    else if (tab === 'messages' && this.data.conversationList.length === 0) this.loadConversations(true);
    else if (tab === 'orders' && this.data.orderList.length === 0) this.loadOrders(true);
    else if (tab === 'inquiries' && this.data.inquiryList.length === 0) this.loadInquiries(true);
    else if (tab === 'logs' && this.data.logList.length === 0) this.loadLogs(true);
  },

  async loadDashboard() {
    this.setData({ dashboardLoading: true });
    try {
      const data = await request.get(config.API.ADMIN_DASHBOARD);
      this.setData({ dashboard: data });
    } catch (error) {
      showFriendlyError(error, '加载仪表盘失败');
    } finally {
      this.setData({ dashboardLoading: false });
    }
  },

  async loadUsers(reset) {
    if (this.data.userListLoading) return;
    const page = reset ? 1 : this.data.userPagination.page + 1;
    this.setData({ userListLoading: true });

    try {
      const params = { page, limit: 20 };
      if (this.data.userKeyword) params.keyword = this.data.userKeyword;
      if (this.data.userStatusIndex === 1) params.status = 'active';
      if (this.data.userStatusIndex === 2) params.status = 'banned';

      const data = await request.get(config.API.ADMIN_USERS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        statusText: item.status === 'banned' ? '已封禁' : '正常',
        statusClass: item.status === 'banned' ? 'status-banned' : 'status-active',
        premiumText: item.premium?.isActive && new Date(item.premium.expireAt) > new Date() ? '会员' : '普通',
        createdAtText: formatTimeAgo(item.createdAt)
      }));
      this.setData({
        userList: reset ? list : [...this.data.userList, ...list],
        userPagination: data.pagination,
        userHasMore: page < data.pagination.totalPages
      });
    } catch (error) {
      showFriendlyError(error, '加载用户列表失败');
    } finally {
      this.setData({ userListLoading: false });
    }
  },

  onUserKeywordInput(e) {
    this.setData({ userKeyword: e.detail.value });
  },

  searchUsers() {
    this.loadUsers(true);
  },

  bindUserStatusChange(e) {
    this.setData({ userStatusIndex: Number(e.detail.value) });
    this.loadUsers(true);
  },

  async banUser(e) {
    const { id, nickname } = e.currentTarget.dataset;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认封禁',
        content: `确定要封禁用户「${nickname || id}」吗？`,
        success: resolve
      });
    });
    if (!res.confirm) return;

    const reason = await new Promise((resolve) => {
      wx.showModal({
        title: '封禁原因',
        editable: true,
        placeholderText: '请输入封禁原因',
        success: (r) => resolve(r.confirm ? r.content || '' : null),
        fail: () => resolve(null)
      });
    });
    if (reason === null) return;

    try {
      await request.post(`${config.API.ADMIN_USERS}/${id}/ban`, { reason });
      wx.showToast({ title: '已封禁', icon: 'success' });
      this.loadUsers(true);
    } catch (error) {
      showFriendlyError(error, '封禁失败');
    }
  },

  async unbanUser(e) {
    const { id, nickname } = e.currentTarget.dataset;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认解封',
        content: `确定要解封用户「${nickname || id}」吗？`,
        success: resolve
      });
    });
    if (!res.confirm) return;

    try {
      await request.post(`${config.API.ADMIN_USERS}/${id}/unban`);
      wx.showToast({ title: '已解封', icon: 'success' });
      this.loadUsers(true);
    } catch (error) {
      showFriendlyError(error, '解封失败');
    }
  },

  async loadPosts(reset) {
    if (this.data.postListLoading) return;
    const page = reset ? 1 : this.data.postPagination.page + 1;
    this.setData({ postListLoading: true });

    try {
      const params = { page, limit: 20 };
      if (this.data.postKeyword) params.keyword = this.data.postKeyword;
      if (this.data.postStatusIndex === 1) params.status = 'published';
      if (this.data.postStatusIndex === 2) params.status = 'removed';

      const data = await request.get(config.API.ADMIN_POSTS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        statusText: item.status === 'removed' ? '已下架' : '已发布',
        statusClass: item.status === 'removed' ? 'status-banned' : 'status-active',
        createdAtText: formatTimeAgo(item.createdAt),
        authorName: item.author?.nickname || '未知'
      }));
      this.setData({
        postList: reset ? list : [...this.data.postList, ...list],
        postPagination: data.pagination,
        postHasMore: page < data.pagination.totalPages
      });
    } catch (error) {
      showFriendlyError(error, '加载帖子列表失败');
    } finally {
      this.setData({ postListLoading: false });
    }
  },

  onPostKeywordInput(e) {
    this.setData({ postKeyword: e.detail.value });
  },

  searchPosts() {
    this.loadPosts(true);
  },

  bindPostStatusChange(e) {
    this.setData({ postStatusIndex: Number(e.detail.value) });
    this.loadPosts(true);
  },

  async removePost(e) {
    const { id, title } = e.currentTarget.dataset;
    const reason = await new Promise((resolve) => {
      wx.showModal({
        title: '下架原因',
        editable: true,
        placeholderText: '请输入下架原因',
        success: (r) => resolve(r.confirm ? r.content || '' : null),
        fail: () => resolve(null)
      });
    });
    if (reason === null) return;

    try {
      await request.post(`${config.API.ADMIN_POSTS}/${id}/remove`, { reason });
      wx.showToast({ title: '已下架', icon: 'success' });
      this.loadPosts(true);
    } catch (error) {
      showFriendlyError(error, '下架失败');
    }
  },

  async restorePost(e) {
    const { id } = e.currentTarget.dataset;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认恢复',
        content: '确定要恢复该帖子吗？',
        success: resolve
      });
    });
    if (!res.confirm) return;

    try {
      await request.post(`${config.API.ADMIN_POSTS}/${id}/restore`);
      wx.showToast({ title: '已恢复', icon: 'success' });
      this.loadPosts(true);
    } catch (error) {
      showFriendlyError(error, '恢复失败');
    }
  },

  async loadConversations(reset) {
    if (this.data.conversationListLoading) return;
    const page = reset ? 1 : this.data.conversationPagination.page + 1;
    this.setData({ conversationListLoading: true });

    try {
      const params = { page, limit: 20 };
      if (this.data.conversationKeyword) params.keyword = this.data.conversationKeyword;

      const data = await request.get(config.API.ADMIN_CONVERSATIONS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        lastMessageContent: item.lastMessage?.content || '',
        lastMessageTime: item.lastMessage ? formatTimeAgo(item.lastMessage.createdAt) : '',
        participantNames: (item.participants || []).map((p) => p.nickname || '未知').join(' ↔ ')
      }));
      this.setData({
        conversationList: reset ? list : [...this.data.conversationList, ...list],
        conversationPagination: data.pagination,
        conversationHasMore: page < data.pagination.totalPages
      });
    } catch (error) {
      showFriendlyError(error, '加载会话列表失败');
    } finally {
      this.setData({ conversationListLoading: false });
    }
  },

  onConversationKeywordInput(e) {
    this.setData({ conversationKeyword: e.detail.value });
  },

  searchConversations() {
    this.loadConversations(true);
  },

  async loadOrders(reset) {
    if (this.data.orderListLoading) return;
    const page = reset ? 1 : this.data.orderPagination.page + 1;
    this.setData({ orderListLoading: true });

    try {
      const params = { page, limit: 20 };
      if (this.data.orderStatusIndex === 1) params.status = 'pending';
      if (this.data.orderStatusIndex === 2) params.status = 'paid';
      if (this.data.orderStatusIndex === 3) params.status = 'failed';

      const data = await request.get(config.API.ADMIN_ORDERS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        statusText: item.status === 'paid' ? '已支付' : item.status === 'pending' ? '待支付' : '失败',
        statusClass: item.status === 'paid' ? 'status-active' : item.status === 'pending' ? 'status-pending' : 'status-banned',
        userName: item.user?.nickname || '未知',
        createdAtText: formatTimeAgo(item.createdAt)
      }));
      this.setData({
        orderList: reset ? list : [...this.data.orderList, ...list],
        orderPagination: data.pagination,
        orderHasMore: page < data.pagination.totalPages,
        orderStats: data.stats || null
      });
    } catch (error) {
      showFriendlyError(error, '加载订单列表失败');
    } finally {
      this.setData({ orderListLoading: false });
    }
  },

  bindOrderStatusChange(e) {
    this.setData({ orderStatusIndex: Number(e.detail.value) });
    this.loadOrders(true);
  },

  async confirmOrder(e) {
    const { id, orderno } = e.currentTarget.dataset;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认订单',
        content: `确定要手动确认订单「${orderno || id}」吗？确认后将开通会员。`,
        success: resolve
      });
    });
    if (!res.confirm) return;

    try {
      await request.post(`${config.API.ADMIN_ORDERS}/${id}/confirm`);
      wx.showToast({ title: '确认成功', icon: 'success' });
      this.loadOrders(true);
    } catch (error) {
      showFriendlyError(error, '确认失败');
    }
  },

  async loadInquiries(reset) {
    if (this.data.inquiryListLoading) return;
    const page = reset ? 1 : this.data.inquiryPagination.page + 1;
    this.setData({ inquiryListLoading: true });

    try {
      const params = { page, limit: 20 };
      if (this.data.inquiryStatusIndex === 1) params.status = 'pending';
      if (this.data.inquiryStatusIndex === 2) params.status = 'contacted';

      const data = await request.get(config.API.ADMIN_INQUIRIES, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        statusText: item.status === 'contacted' ? '已联系' : '待处理',
        statusClass: item.status === 'contacted' ? 'status-active' : 'status-pending',
        campName: item.camp?.organization || item.camp?.theme || '未知营地',
        userName: item.user?.nickname || '未知',
        createdAtText: formatTimeAgo(item.createdAt)
      }));
      this.setData({
        inquiryList: reset ? list : [...this.data.inquiryList, ...list],
        inquiryPagination: data.pagination,
        inquiryHasMore: page < data.pagination.totalPages,
        inquiryStats: data.stats || null
      });
    } catch (error) {
      showFriendlyError(error, '加载咨询列表失败');
    } finally {
      this.setData({ inquiryListLoading: false });
    }
  },

  bindInquiryStatusChange(e) {
    this.setData({ inquiryStatusIndex: Number(e.detail.value) });
    this.loadInquiries(true);
  },

  async markInquiryContacted(e) {
    const { id } = e.currentTarget.dataset;
    try {
      await request.post(`${config.API.ADMIN_INQUIRIES}/${id}/contacted`);
      wx.showToast({ title: '已标记', icon: 'success' });
      this.loadInquiries(true);
    } catch (error) {
      showFriendlyError(error, '标记失败');
    }
  },

  async loadLogs(reset) {
    if (this.data.logListLoading) return;
    const page = reset ? 1 : this.data.logPagination.page + 1;
    this.setData({ logListLoading: true });

    try {
      const params = { page, limit: 20 };
      const moduleKeys = ['', 'user', 'post', 'message', 'order', 'camp_inquiry', 'system'];
      const mod = moduleKeys[this.data.logModuleIndex];
      if (mod) params.module = mod;

      const data = await request.get(config.API.ADMIN_LOGS, params);
      const list = (data.list || []).map((item) => ({
        ...item,
        moduleText: MODULE_MAP[item.module] || item.module,
        adminName: item.adminId?.nickname || item.adminName || '未知',
        createdAtText: formatTimeAgo(item.createdAt)
      }));
      this.setData({
        logList: reset ? list : [...this.data.logList, ...list],
        logPagination: data.pagination,
        logHasMore: page < data.pagination.totalPages
      });
    } catch (error) {
      showFriendlyError(error, '加载操作日志失败');
    } finally {
      this.setData({ logListLoading: false });
    }
  },

  bindLogModuleChange(e) {
    this.setData({ logModuleIndex: Number(e.detail.value) });
    this.loadLogs(true);
  },

  goLogin() {
    goToLogin();
  }
});
