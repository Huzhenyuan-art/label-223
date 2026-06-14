const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatTimeAgo, parseTagsInput, showFriendlyError } = require('../../utils/util');

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
    waveSending: false,
    loading: false
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
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      const superEchoes = (detail.superEchoes || []).map((item) => ({
        ...item,
        timeAgo: formatTimeAgo(item.createdAt)
      }));

      this.setData({
        post: {
          ...detail.post,
          timeAgo: formatTimeAgo(detail.post?.createdAt)
        },
        isOwnPost: detail.post?.author?._id === wx.getStorageSync('userId'),
        comments,
        superEchoes
      });

      await this.loadTree();
    } catch (error) {
      showFriendlyError(error, '详情加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
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
    } catch (error) {
      showFriendlyError(error, '共鸣失败，请稍后重试');
    }
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

    const dynamicTag = this.data.commentTag.startsWith('#') || this.data.commentTag.startsWith('＃')
      ? this.data.commentTag
      : `#${this.data.commentTag}`;

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

    const dynamicTag = this.data.echoTag.startsWith('#') || this.data.echoTag.startsWith('＃')
      ? this.data.echoTag
      : `#${this.data.echoTag}`;

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
    const { post, waveTag } = this.data;
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

    const senderDynamicTag = waveTag.startsWith('#') || waveTag.startsWith('＃')
      ? waveTag
      : `#${waveTag}`;

    this.setData({ waveSending: true });

    try {
      await request.post(config.API.SEND_MESSAGE, {
        receiverId: post.author._id,
        senderDynamicTag,
        content,
        postId: this.data.id
      });

      this.setData({ waveContent: '' });
      wx.showToast({ title: '私密海浪已发出', icon: 'success' });

      const userId = wx.getStorageSync('userId');
      const ids = [userId, post.author._id].sort();
      const conversationId = `${ids[0]}_${ids[1]}`;

      wx.navigateTo({
        url: `/pages/chat/chat?conversationId=${conversationId}&otherUserId=${post.author._id}&name=${encodeURIComponent('同频回声')}&revealed=0`
      });
    } catch (error) {
      showFriendlyError(error, '私密海浪发送失败，请稍后重试');
    } finally {
      this.setData({ waveSending: false });
    }
  }
});
