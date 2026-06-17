const request = require('../../utils/request');
const config = require('../../config/index');
const {
  ensureLogin,
  formatTimeAgo,
  formatDateLabel,
  parseTagsInput,
  showFriendlyError,
  safeNavigateTo,
  normalizeDynamicTag
} = require('../../utils/util');

const flattenTree = (node, depth = 0, arr = []) => {
  if (!node) {
    return arr;
  }

  arr.push({
    id: node._id,
    depth,
    dynamicTag: node.dynamicTag,
    contentText: node.contentText
  });

  (node.children || []).forEach((child) => flattenTree(child, depth + 1, arr));
  return arr;
};

Page({
  data: {
    id: '',
    post: null,
    isOwnPost: false,
    comments: [],
    superEchoes: [],
    treeLines: [],
    commentTag: '#同频回声',
    commentContent: '',
    echoTag: '#延展思考者',
    echoContent: '',
    echoTagsInput: '延展,思考',
    waveTag: '#同频访客',
    waveContent: '',
    waveTempNickname: '',
    waveSending: false,
    loading: false,
    resonanceList: [],
    resonancePage: 1,
    resonanceLimit: 20,
    resonanceTotal: 0,
    resonanceLoading: false,
    resonanceHasMore: true,
    replyingTo: null,
    replyTag: '#回响者',
    replyContent: '',
    viewerPremium: false
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this.loadDetail();
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async loadDetail() {
    const id = this.data.id;
    if (!id) {
      return;
    }

    this.setData({ loading: true });

    try {
      const detail = await request.get(`${config.API.POST_DETAIL_PREFIX}/${id}`);
      const comments = (detail.comments || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt),
        replies: (item.replies || []).map((reply) => ({
          ...reply,
          timeAgo: formatTimeAgo(reply.createdAt)
        }))
      }));

      const superEchoes = (detail.superEchoes || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      const post = detail.post;
      const updatedAt = post.updatedAt;
      const createdAt = post.createdAt;
      const hasEdited = updatedAt && createdAt && new Date(updatedAt).getTime() > new Date(createdAt).getTime() + 1000;

      this.setData({
        post: {
          ...post,
          timeAgo: formatTimeAgo(createdAt),
          updatedAtText: hasEdited ? formatDateLabel(updatedAt, true) : '',
          updatedAt,
          createdAt
        },
        isOwnPost: String(post?.author?._id) === String(wx.getStorageSync('userId')),
        comments,
        superEchoes,
        viewerPremium: detail.viewerPremium || false
      });

      await this.loadTree();
      this.loadResonanceList(true);
    } catch (error) {
      showFriendlyError(error, '详情加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  startReply(event) {
    const commentId = event.currentTarget.dataset.commentId;
    const commentTag = event.currentTarget.dataset.commentTag;
    this.setData({
      replyingTo: { commentId, commentTag },
      replyContent: ''
    });
  },

  cancelReply() {
    this.setData({
      replyingTo: null,
      replyContent: ''
    });
  },

  async submitReply() {
    const { replyingTo, replyTag, replyContent, id } = this.data;
    if (!replyingTo) {
      return;
    }

    const content = replyContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }

    const dynamicTag = normalizeDynamicTag(replyTag);

    try {
      await request.post(
        `${config.API.POST_COMMENT_REPLY_PREFIX}/${id}/comment/${replyingTo.commentId}/reply`,
        {
          dynamicTag,
          content
        }
      );
      this.setData({
        replyingTo: null,
        replyContent: ''
      });
      wx.showToast({ title: '回复已发送', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      showFriendlyError(error, '回复发送失败，请稍后重试');
    }
  },

  async loadTree() {
    try {
      const tree = await request.get(`${config.API.POST_DETAIL_PREFIX}/${this.data.id}/super-echo-tree`);
      this.setData({ treeLines: flattenTree(tree) });
    } catch (error) {
      this.setData({ treeLines: [] });
    }
  },

  async handleToggleResonance() {
    try {
      const result = await request.post(`${config.API.POST_PREFIX}/${this.data.id}/resonance`);
      const post = {
        ...this.data.post,
        isResonated: result.resonated,
        resonanceCount: result.resonanceCount
      };
      this.setData({ post });
      this.loadResonanceList(true);
    } catch (error) {
      showFriendlyError(error, '共鸣失败，请稍后重试');
    }
  },

  async loadResonanceList(reset = false) {
    const id = this.data.id;
    if (!id || this.data.resonanceLoading) {
      return;
    }

    if (reset) {
      this.setData({
        resonancePage: 1,
        resonanceList: [],
        resonanceHasMore: true
      });
    }

    if (!this.data.resonanceHasMore) {
      return;
    }

    this.setData({ resonanceLoading: true });

    try {
      const page = reset ? 1 : this.data.resonancePage;
      const result = await request.get(
        `${config.API.POST_RESONANCES_PREFIX}/${id}/resonances?page=${page}&limit=${this.data.resonanceLimit}`
      );

      const list = (result.list || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      const newList = reset ? list : [...this.data.resonanceList, ...list];
      const pagination = result.pagination || {};

      this.setData({
        resonanceList: newList,
        resonancePage: page + 1,
        resonanceTotal: pagination.total || 0,
        resonanceHasMore: page < (pagination.pages || 0),
        resonanceLoading: false
      });
    } catch (error) {
      this.setData({ resonanceLoading: false });
      showFriendlyError(error, '共鸣者列表加载失败');
    }
  },

  loadMoreResonances() {
    if (this.data.resonanceLoading || !this.data.resonanceHasMore) {
      return;
    }
    this.loadResonanceList(false);
  },

  async handleToggleFavorite() {
    try {
      const result = await request.post(`${config.API.TOGGLE_FAVORITE_PREFIX}/${this.data.id}/toggle`);
      const post = {
        ...this.data.post,
        isFavorited: result.isFavorited
      };
      this.setData({ post });
    } catch (error) {
      showFriendlyError(error, '收藏失败，请稍后重试');
    }
  },

  async submitComment() {
    const content = this.data.commentContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入回声内容', icon: 'none' });
      return;
    }

    const dynamicTag = normalizeDynamicTag(this.data.commentTag);

    try {
      await request.post(`${config.API.POST_PREFIX}/${this.data.id}/comment`, {
        dynamicTag,
        content
      });
      this.setData({ commentContent: '' });
      wx.showToast({ title: '回声已发送', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      showFriendlyError(error, '回声发送失败，请稍后重试');
    }
  },

  async submitSuperEcho() {
    const contentText = this.data.echoContent.trim();
    if (!contentText) {
      wx.showToast({ title: '请输入合鸣内容', icon: 'none' });
      return;
    }

    const tags = parseTagsInput(this.data.echoTagsInput);
    if (!tags.length) {
      wx.showToast({ title: '请填写合鸣标签', icon: 'none' });
      return;
    }

    const dynamicTag = normalizeDynamicTag(this.data.echoTag);

    try {
      await request.post(`${config.API.POST_PREFIX}/${this.data.id}/super-echo`, {
        dynamicTag,
        contentText,
        tags
      });

      this.setData({ echoContent: '' });
      wx.showToast({ title: '合鸣已加入谱系', icon: 'success' });
      this.loadDetail();
    } catch (error) {
      showFriendlyError(error, '合鸣发送失败，请稍后重试');
    }
  },

  async sendPrivateWave() {
    const { post, waveTag, waveTempNickname } = this.data;
    const content = this.data.waveContent.trim();

    if (!post?.author?._id) {
      wx.showToast({ title: '帖子作者信息缺失', icon: 'none' });
      return;
    }

    if (this.data.isOwnPost) {
      wx.showToast({ title: '不能给自己发私信', icon: 'none' });
      return;
    }

    if (!content) {
      wx.showToast({ title: '请输入私信内容', icon: 'none' });
      return;
    }

    const senderDynamicTag = normalizeDynamicTag(waveTag);

    const tempNickname = waveTempNickname.trim();
    if (tempNickname && tempNickname.length > 24) {
      wx.showToast({ title: '临时昵称最多24个字符', icon: 'none' });
      return;
    }

    this.setData({ waveSending: true });

    try {
      const payload = {
        receiverId: post.author._id,
        senderDynamicTag,
        content,
        postId: this.data.id
      };
      if (tempNickname) {
        payload.tempNickname = tempNickname;
      }

      await request.post(config.API.SEND_MESSAGE, payload);

      this.setData({ waveContent: '', waveTempNickname: '' });
      wx.showToast({ title: '私密海浪已发出', icon: 'success' });

      const userId = wx.getStorageSync('userId');
      const ids = [userId, post.author._id].sort();
      const conversationId = `${ids[0]}_${ids[1]}`;

      safeNavigateTo(`/pages/chat/chat?conversationId=${conversationId}&otherUserId=${post.author._id}&name=${encodeURIComponent(tempNickname || '同频回声')}&revealed=0`);
    } catch (error) {
      showFriendlyError(error, '私密海浪发送失败，请稍后重试');
    } finally {
      this.setData({ waveSending: false });
    }
  },

  handleEdit() {
    const post = this.data.post;
    if (!post) {
      return;
    }
    safeNavigateTo(`/pages/edit/edit?editId=${post._id}`);
  },

  goMember() {
    safeNavigateTo('/pages/member/member');
  },

  handleDelete() {
    const post = this.data.post;
    if (!post) {
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '删除后该频率及其所有共鸣、回声、合鸣都将永久消失，无法恢复。确定要删除吗？',
      confirmText: '确认删除',
      confirmColor: '#e74c3c',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          await request.delete(`${config.API.DELETE_POST}/${post._id}`);
          wx.showToast({ title: '删除成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } catch (error) {
          showFriendlyError(error, '删除失败，请稍后重试');
        }
      }
    });
  }
});
