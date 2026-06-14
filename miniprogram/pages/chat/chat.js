const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    conversationId: '',
    otherUserId: '',
    displayName: '同频回声',
    reveal: null,
    senderDynamicTag: '#海浪信使',
    content: '',
    list: [],
    loading: false,
    scrollAnchor: ''
  },

  onLoad(options) {
    this.setData({
      conversationId: options.conversationId || '',
      otherUserId: options.otherUserId || '',
      displayName: options.revealed === '1' ? decodeURIComponent(options.name || '同频回声') : '同频回声'
    });
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }

    if (!this.data.conversationId || !this.data.otherUserId) {
      wx.showToast({ title: '会话信息异常，请返回重试', icon: 'none' });
      return;
    }
    this.loadMessages();
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async loadMessages() {
    this.setData({ loading: true });

    try {
      const userId = wx.getStorageSync('userId');
      const data = await request.get(`${config.API.CONVERSATIONS}/${this.data.conversationId}/messages`, {
        page: 1,
        limit: 50
      });

      const list = (data.list || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt),
        mine: item.sender?._id === userId,
        sourcePostLabel: item.sourcePost ? (item.sourcePost.title || item.sourcePost.dynamicTag) : ''
      }));

      const last = list[list.length - 1];
      this.setData({
        list,
        reveal: data.reveal,
        displayName: data.reveal?.revealed ? decodeURIComponent(this.options.name || '同频回声') : '同频回声',
        scrollAnchor: last ? `msg-${last._id}` : ''
      });

      if (data.reveal?.revealed && this.data.displayName === '同频回声') {
        try {
          const publicInfo = await request.get(`${config.API.USER_PUBLIC_PREFIX}/${this.data.otherUserId}`);
          if (publicInfo?.profile?.nickname) {
            this.setData({ displayName: publicInfo.profile.nickname });
          }
        } catch (error) {
          // keep hidden name fallback
        }
      }
    } catch (error) {
      showFriendlyError(error, '对话加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  async sendMessage() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请输入消息内容', icon: 'none' });
      return;
    }

    const senderDynamicTag = this.data.senderDynamicTag.startsWith('#') || this.data.senderDynamicTag.startsWith('＃')
      ? this.data.senderDynamicTag
      : `#${this.data.senderDynamicTag}`;

    try {
      await request.post(config.API.SEND_MESSAGE, {
        receiverId: this.data.otherUserId,
        senderDynamicTag,
        content
      });
      this.setData({ content: '' });
      this.loadMessages();
    } catch (error) {
      showFriendlyError(error, '消息发送失败，请稍后重试');
    }
  },

  async requestReveal() {
    try {
      const reveal = await request.post(config.API.REQUEST_REVEAL, {
        otherUserId: this.data.otherUserId
      });
      this.setData({ reveal });
      wx.showToast({ title: reveal.revealed ? '身份已揭示' : '已发送揭示申请', icon: 'none' });
      this.loadMessages();
    } catch (error) {
      showFriendlyError(error, '揭示申请失败，请稍后重试');
    }
  },

  openPublicProfile() {
    if (!this.data.reveal?.revealed) {
      wx.showToast({ title: '双方揭示后可查看主页', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pages/publicProfile/publicProfile?id=${this.data.otherUserId}`
    });
  }
});
