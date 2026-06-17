const STORAGE_KEY = 'post_drafts';
const AUTO_SAVE_KEY = 'current_auto_save_draft';
const AUTO_SAVE_INTERVAL_MS = 5000;
const MAX_DRAFTS = 50;

const generateId = () => {
  return 'draft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

const getUserId = () => {
  try {
    return wx.getStorageSync('userId') || 'guest';
  } catch (e) {
    return 'guest';
  }
};

const readAllDrafts = () => {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    if (!data || typeof data !== 'object') {
      return {};
    }
    return data;
  } catch (e) {
    console.error('[draft] read storage error:', e);
    return {};
  }
};

const writeAllDrafts = (allDrafts) => {
  try {
    wx.setStorageSync(STORAGE_KEY, allDrafts);
    return true;
  } catch (e) {
    console.error('[draft] write storage error:', e);
    return false;
  }
};

const getUserDrafts = () => {
  const userId = getUserId();
  const allDrafts = readAllDrafts();
  return allDrafts[userId] || [];
};

const setUserDrafts = (drafts) => {
  const userId = getUserId();
  const allDrafts = readAllDrafts();
  allDrafts[userId] = drafts;
  return writeAllDrafts(allDrafts);
};

const sortDraftsByTime = (drafts) => {
  return [...drafts].sort((a, b) => {
    const ta = a.updatedAt || a.createdAt || 0;
    const tb = b.updatedAt || b.createdAt || 0;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
};

const listDrafts = () => {
  return sortDraftsByTime(getUserDrafts());
};

const getDraft = (id) => {
  if (!id) return null;
  const drafts = getUserDrafts();
  return drafts.find((d) => d._id === id) || null;
};

const buildDraft = (fields = {}) => {
  const now = new Date().toISOString();
  return {
    _id: fields._id || generateId(),
    title: fields.title || '',
    contentText: fields.contentText || '',
    dynamicTag: fields.dynamicTag || '#深夜哲学家',
    tagsInput: fields.tagsInput || '',
    audioUrl: fields.audioUrl || '',
    audioName: fields.audioName || '',
    audioSize: fields.audioSize || '',
    linkUrl: fields.linkUrl || '',
    coverImage: fields.coverImage || '',
    coverImageName: fields.coverImageName || '',
    coverImageSize: fields.coverImageSize || '',
    createdAt: fields.createdAt || now,
    updatedAt: now,
    isAutoSaved: fields.isAutoSaved || false
  };
};

const isDraftEmpty = (draft) => {
  if (!draft) return true;
  const hasContent = (draft.contentText || '').trim().length > 0;
  const hasTitle = (draft.title || '').trim().length > 0;
  const hasMedia = !!(draft.coverImage || draft.audioUrl);
  return !hasContent && !hasTitle && !hasMedia;
};

const saveDraft = (fields) => {
  const draft = buildDraft(fields);
  const drafts = getUserDrafts();
  const idx = drafts.findIndex((d) => d._id === draft._id);

  if (idx >= 0) {
    draft.createdAt = drafts[idx].createdAt;
    drafts[idx] = draft;
  } else {
    if (isDraftEmpty(draft)) {
      return { saved: false, reason: 'empty' };
    }
    drafts.unshift(draft);
  }

  const sorted = sortDraftsByTime(drafts);
  const trimmed = sorted.slice(0, MAX_DRAFTS);
  setUserDrafts(trimmed);

  return { saved: true, draft };
};

const deleteDraft = (id) => {
  if (!id) return false;
  const drafts = getUserDrafts();
  const filtered = drafts.filter((d) => d._id !== id);
  setUserDrafts(filtered);
  return drafts.length !== filtered.length;
};

const clearAllDrafts = () => {
  setUserDrafts([]);
  return true;
};

const getAutoSaveDraft = () => {
  try {
    const data = wx.getStorageSync(AUTO_SAVE_KEY);
    if (!data || typeof data !== 'object') return null;
    const userId = getUserId();
    if (data.userId !== userId) return null;
    return data.draft || null;
  } catch (e) {
    console.error('[draft] read autosave error:', e);
    return null;
  }
};

const setAutoSaveDraft = (draft) => {
  try {
    const userId = getUserId();
    wx.setStorageSync(AUTO_SAVE_KEY, { userId, draft, savedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error('[draft] write autosave error:', e);
    return false;
  }
};

const clearAutoSaveDraft = () => {
  try {
    wx.removeStorageSync(AUTO_SAVE_KEY);
    return true;
  } catch (e) {
    return false;
  }
};

const getDraftPreview = (draft) => {
  if (!draft) return { title: '无标题草稿', summary: '（空）', tag: '' };
  const title = (draft.title || '').trim();
  const content = (draft.contentText || '').trim();
  const tag = draft.dynamicTag || '';
  return {
    title: title || (content ? content.slice(0, 20) : '无标题草稿'),
    summary: content ? content.slice(0, 50) : '（暂无内容）',
    tag
  };
};

module.exports = {
  AUTO_SAVE_INTERVAL_MS,
  listDrafts,
  getDraft,
  saveDraft,
  deleteDraft,
  clearAllDrafts,
  isDraftEmpty,
  buildDraft,
  getDraftPreview,
  getAutoSaveDraft,
  setAutoSaveDraft,
  clearAutoSaveDraft
};
