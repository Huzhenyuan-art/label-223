const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, formatDateLabel, formatTimeAgo, showFriendlyError } = require('../../utils/util');

const CYCLE_LABELS = {
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度'
};

Page({
  data: {
    plans: [],
    orders: [],
    derivatives: [],
    camps: [],
    premium: null,
    payingPlan: '',
    submittingDerivativeId: '',
    submittingCampId: '',

    skins: [
      { key: 'ocean', label: '海蓝' },
      { key: 'sunset', label: '晚霞' },
      { key: 'mint', label: '薄荷' },
      { key: 'ink', label: '墨夜' }
    ],
    selectedSkin: 'ocean',
    applyingSkin: false,

    insight: null,
    privateGroups: [],
    isPremiumActive: false,
    creatingGroup: false,
    groupName: '',
    groupTheme: '',
    groupDesc: ''
  },

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this.loadData();
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async loadData() {
    try {
      const [plans, orders, island, derivatives, camps] = await Promise.all([
        request.get(config.API.PAYMENT_PLANS),
        request.get(config.API.MY_ORDERS),
        request.get(config.API.ISLAND),
        request.get(config.API.COMMERCE_DERIVATIVES),
        request.get(config.API.COMMERCE_CAMPS)
      ]);
      const planNameMap = new Map((plans || []).map((item) => [item.key, item.name]));

      const isPremiumActive = Boolean(island.profile?.premium?.isActive);

      let insight = null;
      let privateGroups = [];
      if (isPremiumActive) {
        try {
          const [insightData, groupsData] = await Promise.all([
            request.get(config.API.INSIGHT_REPORT),
            request.get(config.API.PRIVATE_GROUPS)
          ]);
          insight = insightData || null;
          privateGroups = groupsData || [];
        } catch (error) {
          if (!error.isPremiumRequired) {
            showFriendlyError(error, '会员数据加载失败');
          }
        }
      }

      this.setData({
        plans: plans || [],
        orders: (orders || []).map((item) => ({
          ...item,
          planText: item.planName || item.plan,
          statusText: item.statusLabel || item.status,
          timeAgo: formatTimeAgo(item.createdAt)
        })),
        derivatives: (derivatives || []).map((item) => ({
          ...item,
          waitlistCount: item.waitlistCount || 0
        })),
        camps: (camps || []).map((item) => ({
          ...item,
          cycleText: CYCLE_LABELS[item.cycle] || item.cycle,
          inquiryCount: item.inquiryCount || 0
        })),
        insight,
        privateGroups,
        selectedSkin: island.profile?.tagSkin || 'ocean',
        isPremiumActive,
        premium: island.profile?.premium?.isActive
          ? {
            ...island.profile.premium,
            planText: planNameMap.get(island.profile.premium.plan) || island.profile.premium.plan,
            expireAtText: formatDateLabel(island.profile.premium.expireAt)
          }
          : null
      });
    } catch (error) {
      showFriendlyError(error, '会员中心加载失败，请稍后重试');
    }
  },

  async pay(event) {
    const plan = event.currentTarget.dataset.plan;
    if (!plan || this.data.payingPlan) {
      return;
    }

    this.setData({ payingPlan: plan });

    try {
      await request.post(config.API.CHECKOUT, { plan });
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.loadData();
    } catch (error) {
      showFriendlyError(error, '支付失败，请稍后重试');
    } finally {
      this.setData({ payingPlan: '' });
    }
  },

  selectSkin(event) {
    this.setData({ selectedSkin: event.currentTarget.dataset.skin });
  },

  async applySkin() {
    if (!this.data.isPremiumActive) {
      wx.showModal({
        title: '会员专属功能',
        content: '标签皮肤为会员专属，请先开通会员',
        confirmText: '去开通',
        cancelText: '暂不',
        success: (res) => {
          if (res.confirm) {
            this.scrollToPlans();
          }
        }
      });
      return;
    }

    if (this.data.applyingSkin) {
      return;
    }

    this.setData({ applyingSkin: true });

    try {
      await request.request({
        url: config.API.TAG_SKIN,
        method: 'PUT',
        data: { skin: this.data.selectedSkin }
      });
      wx.showToast({ title: '标签皮肤已更新', icon: 'success' });
      this.loadData();
    } catch (error) {
      showFriendlyError(error, '标签皮肤更新失败，请稍后重试');
    } finally {
      this.setData({ applyingSkin: false });
    }
  },

  async createPrivateGroup() {
    if (!this.data.isPremiumActive) {
      wx.showModal({
        title: '会员专属功能',
        content: '私人小组为会员专属，请先开通会员',
        confirmText: '去开通',
        cancelText: '暂不',
        success: (res) => {
          if (res.confirm) {
            this.scrollToPlans();
          }
        }
      });
      return;
    }

    if (this.data.creatingGroup) {
      return;
    }

    const name = this.data.groupName.trim();
    const theme = this.data.groupTheme.trim();
    const description = this.data.groupDesc.trim();

    if (name.length < 2 || theme.length < 2) {
      wx.showToast({ title: '小组名和主题至少2个字', icon: 'none' });
      return;
    }

    this.setData({ creatingGroup: true });

    try {
      await request.post(config.API.PRIVATE_GROUPS, {
        name,
        theme,
        description
      });

      wx.showToast({ title: '私人小组已创建', icon: 'success' });
      this.setData({ groupName: '', groupTheme: '', groupDesc: '' });
      this.loadData();
    } catch (error) {
      showFriendlyError(error, '私人小组创建失败，请稍后重试');
    } finally {
      this.setData({ creatingGroup: false });
    }
  },

  async joinDerivativeWaitlist(event) {
    const derivativeId = event.currentTarget.dataset.id;
    if (!derivativeId || this.data.submittingDerivativeId) {
      return;
    }

    const target = this.data.derivatives.find((item) => item._id === derivativeId);
    if (!target || target.joined) {
      return;
    }

    this.setData({ submittingDerivativeId: derivativeId });

    try {
      const result = await request.post(`${config.API.DERIVATIVE_WAITLIST_PREFIX}/${derivativeId}/waitlist`);
      this.setData({
        derivatives: this.data.derivatives.map((item) => (
          item._id === derivativeId
            ? {
              ...item,
              joined: true,
              waitlistCount: result.waitlistCount || item.waitlistCount
            }
            : item
        ))
      });
      wx.showToast({
        title: result.alreadyJoined ? '已在待购清单中' : '已加入待购清单',
        icon: 'success'
      });
    } catch (error) {
      showFriendlyError(error, '加入待购清单失败，请稍后重试');
    } finally {
      this.setData({ submittingDerivativeId: '' });
    }
  },

  async createCampInquiry(event) {
    const campId = event.currentTarget.dataset.id;
    if (!campId || this.data.submittingCampId) {
      return;
    }

    const target = this.data.camps.find((item) => item._id === campId);
    if (!target || target.inquired) {
      return;
    }

    this.setData({ submittingCampId: campId });

    try {
      const result = await request.post(`${config.API.CAMP_INQUIRY_PREFIX}/${campId}/inquiries`);
      this.setData({
        camps: this.data.camps.map((item) => (
          item._id === campId
            ? {
              ...item,
              inquired: true,
              inquiryCount: result.inquiryCount || item.inquiryCount
            }
            : item
        ))
      });
      wx.showToast({
        title: result.alreadyInquired ? '咨询已提交' : '入驻咨询已提交',
        icon: 'success'
      });
    } catch (error) {
      showFriendlyError(error, '提交入驻咨询失败，请稍后重试');
    } finally {
      this.setData({ submittingCampId: '' });
    }
  },

  scrollToPlans() {
    wx.pageScrollTo({ selector: '.plans-section', duration: 300 });
  }
});
