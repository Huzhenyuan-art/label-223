const request = require('../../utils/request');
const config = require('../../config/index');
const socket = require('../../utils/socket');
const { ensureLogin, formatTimeAgo, showFriendlyError, safeNavigateTo } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    conversationId: '',
    otherUserId: '',
    displayName: '同频回声',
    myTempNickname: '',
    tempNicknameInput: '',
    showTempNicknameModal: false,
    reveal: null,
    senderDynamicTag: '#海浪信使',
    content: '',
    list: [],
    loading: false,
    scrollAnchor: '',
    wsConnected: false,
    sending: false,
    autoRevealCountdown: ''
  },

  _socketHandlers: {},
  _autoRevealTimer: null,

  onLoad(options) {
    this.setData({
      conversationId: options.conversationId || '',
      otherUserId: options.otherUserId || '',
      displayName: decodeURIComponent(options.name || '同频回声')
    });

    this._bindSocketEvents();
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
    this._sendReadAck();
    this._updateWsState();
  },

  onHide() {
    this._sendReadAck();
    this._stopAutoRevealTimer();
  },

  onUnload() {
    this._sendReadAck();
    this._unbindSocketEvents();
    this._stopAutoRevealTimer();
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  _bindSocketEvents() {
    const onMessage = (msg) => {
      if (!msg) return;

      const msgConversationId = msg.conversationId || this.data.conversationId;

      if (msgConversationId !== this.data.conversationId) return;

      const userId = wx.getStorageSync('userId');
      const formatted = {
        ...msg,
        timeAgo: formatTimeAgo(msg.createdAt),
        mine: msg.sender?._id === userId || msg.sender?.toString() === userId,
        sourcePostLabel: msg.sourcePost ? (msg.sourcePost.title || msg.sourcePost.dynamicTag) : ''
      };

      const list = this.data.list;
      const exists = list.some((item) => item._id === msg._id || (item._id && item._id === msg._id));
      if (exists) return;

      this.setData({
        list: [...list, formatted],
        scrollAnchor: `msg-${msg._id}`
      });

      this._sendReadAck();
    };

    const onStateChange = () => {
      this._updateWsState();
    };

    const onReveal = (data) => {
      if (!data || data.conversationId !== this.data.conversationId) return;
      this.setData({ reveal: data });
      if (data.revealed) {
        this._stopAutoRevealTimer();
        this.loadMessages();
      } else {
        this._updateAutoRevealTimer(data);
      }
    };

    const onReadAck = (data) => {
      if (!data || data.conversationId !== this.data.conversationId) return;
      const list = this.data.list.map((item) => {
        if (item.mine && !item.read) {
          return { ...item, read: true };
        }
        return item;
      });
      this.setData({ list });
    };

    const onTempNickname = (data) => {
      if (!data || data.conversationId !== this.data.conversationId) return;
      const userId = wx.getStorageSync('userId');
      const isMine = data.fromUserId === userId;

      if (!isMine) {
        this.setData({ displayName: data.tempNickname });
        const list = this.data.list.map((item) => {
          if (!item.mine && item.sender) {
            return { ...item, sender: { ...item.sender, nickname: data.tempNickname } };
          }
          return item;
        });
        this.setData({ list });
      }

      if (this.data.reveal) {
        this.setData({
          reveal: {
            ...this.data.reveal,
            tempNicknames: data.tempNicknames || this.data.reveal.tempNicknames
          }
        });
      }
    };

    this._socketHandlers = { onMessage, onStateChange, onReveal, onReadAck, onTempNickname };

    socket.on('message', onMessage);
    socket.on('stateChange', onStateChange);
    socket.on('reveal', onReveal);
    socket.on('readAck', onReadAck);
    socket.on('tempNickname', onTempNickname);
  },

  _unbindSocketEvents() {
    const { onMessage, onStateChange, onReveal, onReadAck, onTempNickname } = this._socketHandlers;
    socket.off('message', onMessage);
    socket.off('stateChange', onStateChange);
    socket.off('reveal', onReveal);
    socket.off('readAck', onReadAck);
    socket.off('tempNickname', onTempNickname);
    this._socketHandlers = {};
  },

  _updateWsState() {
    this.setData({
      wsConnected: socket.isConnected()
    });
  },

  _sendReadAck() {
    if (this.data.conversationId) {
      socket.sendReadAck(this.data.conversationId);
    }
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
      const otherTempName = data.reveal?.tempNicknames?.[this.data.otherUserId] || '同频回声';
      const myTempName = data.reveal?.tempNicknames?.[userId] || '';

      this.setData({
        list,
        reveal: data.reveal,
        displayName: data.reveal?.revealed
          ? decodeURIComponent(this.options.name || '同频回声')
          : otherTempName,
        myTempNickname: myTempName,
        scrollAnchor: last ? `msg-${last._id}` : ''
      });

      this._updateAutoRevealTimer(data.reveal);

      if (data.reveal?.revealed) {
        this._stopAutoRevealTimer();
        try {
          const publicInfo = await request.get(`${config.API.USER_PUBLIC_PREFIX}/${this.data.otherUserId}`);
          if (publicInfo?.profile?.nickname) {
            this.setData({ displayName: publicInfo.profile.nickname });
          }
        } catch (error) {
          // keep hidden name fallback
        }
      }

      this._sendReadAck();
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

    if (this.data.sending) return;

    const senderDynamicTag = this.data.senderDynamicTag.startsWith('#') || this.data.senderDynamicTag.startsWith('＃')
      ? this.data.senderDynamicTag
      : `#${this.data.senderDynamicTag}`;

    this.setData({ sending: true });

    const wsSent = socket.sendMessage({
      receiverId: this.data.otherUserId,
      senderDynamicTag,
      content,
      tempNickname: this.data.myTempNickname || undefined
    });

    if (wsSent) {
      this.setData({ content: '' });
      this.setData({ sending: false });
      return;
    }

    try {
      await request.post(config.API.SEND_MESSAGE, {
        receiverId: this.data.otherUserId,
        senderDynamicTag,
        content,
        tempNickname: this.data.myTempNickname || undefined
      });
      this.setData({ content: '' });
      this.loadMessages();
    } catch (error) {
      showFriendlyError(error, '消息发送失败，请稍后重试');
    } finally {
      this.setData({ sending: false });
    }
  },

  async requestReveal() {
    try {
      const reveal = await request.post(config.API.REQUEST_REVEAL, {
        otherUserId: this.data.otherUserId
      });
      this.setData({ reveal });
      this._updateAutoRevealTimer(reveal);
      wx.showToast({ title: reveal.revealed ? '身份已揭示' : '已发送揭示申请', icon: 'none' });
      if (reveal.revealed) {
        this._stopAutoRevealTimer();
        this.loadMessages();
      }
    } catch (error) {
      showFriendlyError(error, '揭示申请失败，请稍后重试');
    }
  },

  openPublicProfile() {
    if (!this.data.reveal?.revealed) {
      wx.showToast({ title: '双方揭示后可查看主页', icon: 'none' });
      return;
    }

    safeNavigateTo(`/pages/publicProfile/publicProfile?id=${this.data.otherUserId}`);
  },

  openTempNicknameModal() {
    if (this.data.reveal?.revealed) {
      wx.showToast({ title: '身份已揭示，无需设置临时昵称', icon: 'none' });
      return;
    }
    this.setData({
      tempNicknameInput: this.data.myTempNickname,
      showTempNicknameModal: true
    });
  },

  closeTempNicknameModal() {
    this.setData({ showTempNicknameModal: false });
  },

  bindTempNicknameInput(e) {
    this.setData({ tempNicknameInput: e.detail.value });
  },

  async confirmTempNickname() {
    const nickname = this.data.tempNicknameInput.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入临时昵称', icon: 'none' });
      return;
    }
    if (nickname.length > 24) {
      wx.showToast({ title: '昵称最多24个字符', icon: 'none' });
      return;
    }

    const wsSent = socket.sendTempNickname({
      otherUserId: this.data.otherUserId,
      tempNickname: nickname
    });

    if (wsSent) {
      this.setData({
        myTempNickname: nickname,
        showTempNicknameModal: false
      });
      wx.showToast({ title: '临时昵称已设置', icon: 'success' });
      return;
    }

    try {
      const result = await request.post(config.API.SET_TEMP_NICKNAME, {
        otherUserId: this.data.otherUserId,
        tempNickname: nickname
      });
      this.setData({
        myTempNickname: result.tempNickname,
        reveal: result.reveal,
        showTempNicknameModal: false
      });
      wx.showToast({ title: '临时昵称已设置', icon: 'success' });
    } catch (error) {
      showFriendlyError(error, '设置失败，请稍后重试');
    }
  },

  _formatCountdown(ms) {
    if (ms <= 0) return '';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  },

  _updateAutoRevealTimer(reveal) {
    this._stopAutoRevealTimer();

    if (!reveal || reveal.revealed || !reveal.waitingForOther || !reveal.autoRevealDeadline) {
      this.setData({ autoRevealCountdown: '' });
      return;
    }

    const deadline = new Date(reveal.autoRevealDeadline).getTime();

    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.setData({ autoRevealCountdown: '' });
        this._stopAutoRevealTimer();
        this.loadMessages();
        return;
      }
      this.setData({ autoRevealCountdown: this._formatCountdown(remaining) });
    };

    tick();
    this._autoRevealTimer = setInterval(tick, 1000);
  },

  _stopAutoRevealTimer() {
    if (this._autoRevealTimer) {
      clearInterval(this._autoRevealTimer);
      this._autoRevealTimer = null;
    }
    this.setData({ autoRevealCountdown: '' });
  }
});
