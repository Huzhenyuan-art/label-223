const request = require('../../utils/request');
const config = require('../../config/index');
const util = require('../../utils/util');

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
    userHasMore: true,
    postList: [],
    postPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    postLoading: false,
    postKeyword: '',
    postStatusIndex: 0,
    postListLoading: false,
    postHasMore: true,
    conversationList: [],
    conversationPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    conversationLoading: false,
    conversationKeyword: '',
    conversationListLoading: false,
    conversationHasMore: true,
    orderList: [],
    orderPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    orderLoading: false,
    orderStatusIndex: 0,
    orderListLoading: false,
    orderHasMore: true,
    orderStats: null,
    inquiryList: [],
    inquiryPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    inquiryLoading: false,
    inquiryStatusIndex: 0,
    inquiryListLoading: false,
    inquiryHasMore: true,
    inquiryStats: null,
    logList: [],
    logPagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    logLoading: false,
    logModuleIndex: 0,
    logListLoading: false,
    logHasMore: true
  },

  onLoad: function() {
    var isLoggedIn = util.ensureLogin({ redirect: false });
    this.setData({ isLoggedIn: isLoggedIn });
    if (isLoggedIn) {
      this.loadDashboard();
    }
  },

  onShow: function() {
    var isLoggedIn = util.ensureLogin({ redirect: false });
    this.setData({ isLoggedIn: isLoggedIn });
  },

  onPullDownRefresh: function() {
    var tab = this.data.activeTab;
    var that = this;
    if (tab === 'dashboard') {
      this.loadDashboard().then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'users') {
      this.loadUsers(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'posts') {
      this.loadPosts(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'messages') {
      this.loadConversations(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'orders') {
      this.loadOrders(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'inquiries') {
      this.loadInquiries(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    } else if (tab === 'logs') {
      this.loadLogs(true).then(function() { wx.stopPullDownRefresh(); }).catch(function() { wx.stopPullDownRefresh(); });
    }
  },

  onReachBottom: function() {
    var tab = this.data.activeTab;
    if (tab === 'users' && this.data.userHasMore) this.loadUsers(false);
    else if (tab === 'posts' && this.data.postHasMore) this.loadPosts(false);
    else if (tab === 'messages' && this.data.conversationHasMore) this.loadConversations(false);
    else if (tab === 'orders' && this.data.orderHasMore) this.loadOrders(false);
    else if (tab === 'inquiries' && this.data.inquiryHasMore) this.loadInquiries(false);
    else if (tab === 'logs' && this.data.logHasMore) this.loadLogs(false);
  },

  switchAdminTab: function(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'dashboard' && !this.data.dashboard) this.loadDashboard();
    else if (tab === 'users' && this.data.userList.length === 0) this.loadUsers(true);
    else if (tab === 'posts' && this.data.postList.length === 0) this.loadPosts(true);
    else if (tab === 'messages' && this.data.conversationList.length === 0) this.loadConversations(true);
    else if (tab === 'orders' && this.data.orderList.length === 0) this.loadOrders(true);
    else if (tab === 'inquiries' && this.data.inquiryList.length === 0) this.loadInquiries(true);
    else if (tab === 'logs' && this.data.logList.length === 0) this.loadLogs(true);
  },

  loadDashboard: function() {
    var that = this;
    this.setData({ dashboardLoading: true });
    return new Promise(function(resolve, reject) {
      request.get(config.API.ADMIN_DASHBOARD).then(function(data) {
        that.setData({ dashboard: data });
        that.setData({ dashboardLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载仪表盘失败');
        that.setData({ dashboardLoading: false });
        reject(error);
      });
    });
  },

  loadUsers: function(reset) {
    if (this.data.userListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.userPagination.page + 1;
    this.setData({ userListLoading: true });
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      if (that.data.userKeyword) params.keyword = that.data.userKeyword;
      if (that.data.userStatusIndex === 1) params.status = 'active';
      if (that.data.userStatusIndex === 2) params.status = 'banned';
      request.get(config.API.ADMIN_USERS, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var premiumText = '普通';
          if (item.premium && item.premium.isActive && new Date(item.premium.expireAt) > new Date()) {
            premiumText = '会员';
          }
          return {
            _id: item._id,
            nickname: item.nickname,
            account: item.account,
            avatar: item.avatar,
            status: item.status,
            statusText: item.status === 'banned' ? '已封禁' : '正常',
            statusClass: item.status === 'banned' ? 'status-banned' : 'status-active',
            premiumText: premiumText,
            postCount: item.postCount || 0,
            createdAtText: util.formatTimeAgo(item.createdAt)
          };
        });
        var newList = reset ? list : that.data.userList.concat(list);
        that.setData({
          userList: newList,
          userPagination: data.pagination,
          userHasMore: page < data.pagination.totalPages
        });
        that.setData({ userListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载用户列表失败');
        that.setData({ userListLoading: false });
        reject(error);
      });
    });
  },

  onUserKeywordInput: function(e) {
    this.setData({ userKeyword: e.detail.value });
  },

  searchUsers: function() {
    this.loadUsers(true);
  },

  bindUserStatusChange: function(e) {
    this.setData({ userStatusIndex: Number(e.detail.value) });
    this.loadUsers(true);
  },

  banUser: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var nickname = e.currentTarget.dataset.nickname;
    wx.showModal({
      title: '确认封禁',
      content: '确定要封禁用户「' + (nickname || id) + '」吗？',
      success: function(res) {
        if (!res.confirm) return;
        wx.showModal({
          title: '封禁原因',
          editable: true,
          placeholderText: '请输入封禁原因',
          success: function(r) {
            if (!r.confirm) return;
            request.post(config.API.ADMIN_USERS + '/' + id + '/ban', { reason: r.content || '' }).then(function() {
              wx.showToast({ title: '已封禁', icon: 'success' });
              that.loadUsers(true);
            }).catch(function(error) {
              util.showFriendlyError(error, '封禁失败');
            });
          }
        });
      }
    });
  },

  unbanUser: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var nickname = e.currentTarget.dataset.nickname;
    wx.showModal({
      title: '确认解封',
      content: '确定要解封用户「' + (nickname || id) + '」吗？',
      success: function(res) {
        if (!res.confirm) return;
        request.post(config.API.ADMIN_USERS + '/' + id + '/unban').then(function() {
          wx.showToast({ title: '已解封', icon: 'success' });
          that.loadUsers(true);
        }).catch(function(error) {
          util.showFriendlyError(error, '解封失败');
        });
      }
    });
  },

  loadPosts: function(reset) {
    if (this.data.postListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.postPagination.page + 1;
    this.setData({ postListLoading: true });
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      if (that.data.postKeyword) params.keyword = that.data.postKeyword;
      if (that.data.postStatusIndex === 1) params.status = 'published';
      if (that.data.postStatusIndex === 2) params.status = 'removed';
      request.get(config.API.ADMIN_POSTS, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var authorName = '未知';
          if (item.author && item.author.nickname) authorName = item.author.nickname;
          return {
            _id: item._id,
            title: item.title,
            contentText: item.contentText,
            dynamicTag: item.dynamicTag,
            status: item.status,
            statusText: item.status === 'removed' ? '已下架' : '已发布',
            statusClass: item.status === 'removed' ? 'status-banned' : 'status-active',
            resonanceCount: item.resonanceCount || 0,
            commentCount: item.commentCount || 0,
            authorName: authorName,
            createdAtText: util.formatTimeAgo(item.createdAt)
          };
        });
        var newList = reset ? list : that.data.postList.concat(list);
        that.setData({
          postList: newList,
          postPagination: data.pagination,
          postHasMore: page < data.pagination.totalPages
        });
        that.setData({ postListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载帖子列表失败');
        that.setData({ postListLoading: false });
        reject(error);
      });
    });
  },

  onPostKeywordInput: function(e) {
    this.setData({ postKeyword: e.detail.value });
  },

  searchPosts: function() {
    this.loadPosts(true);
  },

  bindPostStatusChange: function(e) {
    this.setData({ postStatusIndex: Number(e.detail.value) });
    this.loadPosts(true);
  },

  removePost: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '下架原因',
      editable: true,
      placeholderText: '请输入下架原因',
      success: function(r) {
        if (!r.confirm) return;
        request.post(config.API.ADMIN_POSTS + '/' + id + '/remove', { reason: r.content || '' }).then(function() {
          wx.showToast({ title: '已下架', icon: 'success' });
          that.loadPosts(true);
        }).catch(function(error) {
          util.showFriendlyError(error, '下架失败');
        });
      }
    });
  },

  restorePost: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认恢复',
      content: '确定要恢复该帖子吗？',
      success: function(res) {
        if (!res.confirm) return;
        request.post(config.API.ADMIN_POSTS + '/' + id + '/restore').then(function() {
          wx.showToast({ title: '已恢复', icon: 'success' });
          that.loadPosts(true);
        }).catch(function(error) {
          util.showFriendlyError(error, '恢复失败');
        });
      }
    });
  },

  loadConversations: function(reset) {
    if (this.data.conversationListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.conversationPagination.page + 1;
    this.setData({ conversationListLoading: true });
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      if (that.data.conversationKeyword) params.keyword = that.data.conversationKeyword;
      request.get(config.API.ADMIN_CONVERSATIONS, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var lastMsgContent = '';
          var lastMsgTime = '';
          var participantNames = [];
          if (item.lastMessage) {
            lastMsgContent = item.lastMessage.content || '';
            lastMsgTime = util.formatTimeAgo(item.lastMessage.createdAt);
          }
          if (item.participants && item.participants.length) {
            participantNames = item.participants.map(function(p) { return p.nickname || '未知'; });
          }
          return {
            conversationId: item.conversationId,
            messageCount: item.messageCount || 0,
            lastMessageContent: lastMsgContent,
            lastMessageTime: lastMsgTime,
            participantNames: participantNames.join(' ↔ ')
          };
        });
        var newList = reset ? list : that.data.conversationList.concat(list);
        that.setData({
          conversationList: newList,
          conversationPagination: data.pagination,
          conversationHasMore: page < data.pagination.totalPages
        });
        that.setData({ conversationListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载会话列表失败');
        that.setData({ conversationListLoading: false });
        reject(error);
      });
    });
  },

  onConversationKeywordInput: function(e) {
    this.setData({ conversationKeyword: e.detail.value });
  },

  searchConversations: function() {
    this.loadConversations(true);
  },

  loadOrders: function(reset) {
    if (this.data.orderListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.orderPagination.page + 1;
    this.setData({ orderListLoading: true });
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      if (that.data.orderStatusIndex === 1) params.status = 'pending';
      if (that.data.orderStatusIndex === 2) params.status = 'paid';
      if (that.data.orderStatusIndex === 3) params.status = 'failed';
      request.get(config.API.ADMIN_ORDERS, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var statusText = '未知';
          var statusClass = 'status-active';
          if (item.status === 'paid') { statusText = '已支付'; statusClass = 'status-active'; }
          else if (item.status === 'pending') { statusText = '待支付'; statusClass = 'status-pending'; }
          else { statusText = '失败'; statusClass = 'status-banned'; }
          var userName = '未知';
          if (item.user && item.user.nickname) userName = item.user.nickname;
          return {
            _id: item._id,
            orderNo: item.orderNo,
            planName: item.planName || item.plan,
            amount: item.amount,
            status: item.status,
            statusText: statusText,
            statusClass: statusClass,
            userName: userName,
            createdAtText: util.formatTimeAgo(item.createdAt)
          };
        });
        var newList = reset ? list : that.data.orderList.concat(list);
        that.setData({
          orderList: newList,
          orderPagination: data.pagination,
          orderHasMore: page < data.pagination.totalPages,
          orderStats: data.stats || null
        });
        that.setData({ orderListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载订单列表失败');
        that.setData({ orderListLoading: false });
        reject(error);
      });
    });
  },

  bindOrderStatusChange: function(e) {
    this.setData({ orderStatusIndex: Number(e.detail.value) });
    this.loadOrders(true);
  },

  confirmOrder: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    var orderno = e.currentTarget.dataset.orderno;
    wx.showModal({
      title: '确认订单',
      content: '确定要手动确认订单「' + (orderno || id) + '」吗？确认后将开通会员。',
      success: function(res) {
        if (!res.confirm) return;
        request.post(config.API.ADMIN_ORDERS + '/' + id + '/confirm').then(function() {
          wx.showToast({ title: '确认成功', icon: 'success' });
          that.loadOrders(true);
        }).catch(function(error) {
          util.showFriendlyError(error, '确认失败');
        });
      }
    });
  },

  loadInquiries: function(reset) {
    if (this.data.inquiryListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.inquiryPagination.page + 1;
    this.setData({ inquiryListLoading: true });
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      if (that.data.inquiryStatusIndex === 1) params.status = 'pending';
      if (that.data.inquiryStatusIndex === 2) params.status = 'contacted';
      request.get(config.API.ADMIN_INQUIRIES, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var statusText = '待处理';
          var statusClass = 'status-pending';
          if (item.status === 'contacted') { statusText = '已联系'; statusClass = 'status-active'; }
          var campName = '未知营地';
          if (item.camp) {
            if (item.camp.organization) campName = item.camp.organization;
            else if (item.camp.theme) campName = item.camp.theme;
          }
          var userName = '未知';
          if (item.user && item.user.nickname) userName = item.user.nickname;
          return {
            _id: item._id,
            status: item.status,
            statusText: statusText,
            statusClass: statusClass,
            campName: campName,
            userName: userName,
            message: item.message || '',
            contactInfo: item.contactInfo || '',
            createdAtText: util.formatTimeAgo(item.createdAt)
          };
        });
        var newList = reset ? list : that.data.inquiryList.concat(list);
        that.setData({
          inquiryList: newList,
          inquiryPagination: data.pagination,
          inquiryHasMore: page < data.pagination.totalPages,
          inquiryStats: data.stats || null
        });
        that.setData({ inquiryListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载咨询列表失败');
        that.setData({ inquiryListLoading: false });
        reject(error);
      });
    });
  },

  bindInquiryStatusChange: function(e) {
    this.setData({ inquiryStatusIndex: Number(e.detail.value) });
    this.loadInquiries(true);
  },

  markInquiryContacted: function(e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    request.post(config.API.ADMIN_INQUIRIES + '/' + id + '/contacted').then(function() {
      wx.showToast({ title: '已标记', icon: 'success' });
      that.loadInquiries(true);
    }).catch(function(error) {
      util.showFriendlyError(error, '标记失败');
    });
  },

  loadLogs: function(reset) {
    if (this.data.logListLoading) return Promise.resolve();
    var that = this;
    var page = reset ? 1 : this.data.logPagination.page + 1;
    this.setData({ logListLoading: true });
    var moduleMap = { user: '用户管理', post: '帖子管理', message: '私信管理', order: '订单管理', camp_inquiry: '营地咨询', sensitive_word: '敏感词', system: '系统' };
    var moduleKeys = ['', 'user', 'post', 'message', 'order', 'camp_inquiry', 'system'];
    return new Promise(function(resolve, reject) {
      var params = { page: page, limit: 20 };
      var mod = moduleKeys[that.data.logModuleIndex];
      if (mod) params.module = mod;
      request.get(config.API.ADMIN_LOGS, params).then(function(data) {
        var list = (data.list || []).map(function(item) {
          var adminName = '未知';
          if (item.adminId && item.adminId.nickname) adminName = item.adminId.nickname;
          else if (item.adminName) adminName = item.adminName;
          var moduleText = moduleMap[item.module] || item.module;
          return {
            _id: item._id,
            module: item.module,
            moduleText: moduleText,
            action: item.action,
            adminName: adminName,
            detail: item.detail || {},
            createdAtText: util.formatTimeAgo(item.createdAt)
          };
        });
        var newList = reset ? list : that.data.logList.concat(list);
        that.setData({
          logList: newList,
          logPagination: data.pagination,
          logHasMore: page < data.pagination.totalPages
        });
        that.setData({ logListLoading: false });
        resolve();
      }).catch(function(error) {
        util.showFriendlyError(error, '加载操作日志失败');
        that.setData({ logListLoading: false });
        reject(error);
      });
    });
  },

  bindLogModuleChange: function(e) {
    this.setData({ logModuleIndex: Number(e.detail.value) });
    this.loadLogs(true);
  },

  goLogin: function() {
    util.goToLogin();
  }
});
