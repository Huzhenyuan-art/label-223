const { SensitiveWord, AuditLog } = require('../models');
const logger = require('../utils/logger');

class DFAFilter {
  constructor() {
    this.root = new Map();
    this.isBuilt = false;
  }

  addWord(word, meta = {}) {
    let node = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!node.has(char)) {
        node.set(char, new Map());
      }
      node = node.get(char);
    }
    node.set('__end__', true);
    node.set('__meta__', meta);
  }

  build(wordList) {
    this.root = new Map();
    for (const item of wordList) {
      this.addWord(item.word, {
        category: item.category,
        level: item.level
      });
    }
    this.isBuilt = true;
    logger.info(`DFA filter built with ${wordList.length} sensitive words`);
  }

  search(text) {
    if (!this.isBuilt || !text) {
      return [];
    }
    const matches = [];
    const used = new Set();
    for (let i = 0; i < text.length; i++) {
      let node = this.root;
      let j = i;
      let found = null;
      while (j < text.length && node.has(text[j])) {
        node = node.get(text[j]);
        j++;
        if (node.get('__end__')) {
          const word = text.substring(i, j);
          if (!used.has(word)) {
            used.add(word);
            found = {
              word,
              category: node.get('__meta__')?.category || 'other',
              level: node.get('__meta__')?.level || 2
            };
          }
        }
      }
      if (found) {
        matches.push(found);
      }
    }
    return matches;
  }

  mask(text, matches) {
    if (!matches || matches.length === 0) {
      return text;
    }
    let result = text;
    for (const m of matches) {
      const mask = '*'.repeat(m.word.length);
      const regex = new RegExp(this.escapeRegExp(m.word), 'g');
      result = result.replace(regex, mask);
    }
    return result;
  }

  escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  containsHighLevel(matches) {
    return matches.some((m) => m.level >= 3);
  }
}

const filter = new DFAFilter();
let cacheExpireAt = 0;
const CACHE_TTL = 60 * 1000;

const buildFilter = async (force = false) => {
  const now = Date.now();
  if (force || !filter.isBuilt || now > cacheExpireAt) {
    const words = await SensitiveWord.find({ enabled: true }).lean();
    filter.build(words);
    cacheExpireAt = now + CACHE_TTL;
  }
};

const auditContent = async ({
  content,
  type,
  userId,
  targetId = null,
  fields = []
}) => {
  await buildFilter();
  const matches = filter.search(content);
  const hasMatch = matches.length > 0;
  const hasHighLevel = filter.containsHighLevel(matches);

  let action = 'passed';
  let maskedContent = null;

  if (hasMatch) {
    if (hasHighLevel) {
      action = 'blocked';
    } else {
      action = 'masked';
      maskedContent = filter.mask(content, matches);
    }
  }

  try {
    await AuditLog.create({
      type,
      targetId,
      userId,
      content,
      fields,
      matchedWords: matches,
      action,
      maskedContent
    });
  } catch (e) {
    logger.error(`Create audit log error: ${e.message}`);
  }

  return {
    passed: action !== 'blocked',
    blocked: action === 'blocked',
    masked: action === 'masked',
    matchedWords: matches,
    action,
    originalContent: content,
    maskedContent
  };
};

const auditMultipleFields = async ({
  fieldsMap,
  type,
  userId,
  targetId = null
}) => {
  const allContent = Object.values(fieldsMap).filter(Boolean).join(' ');
  const fieldNames = Object.keys(fieldsMap);

  await buildFilter();
  const allMatches = filter.search(allContent);

  const hasMatch = allMatches.length > 0;
  const hasHighLevel = filter.containsHighLevel(allMatches);

  let action = 'passed';
  let maskedFieldsMap = null;

  if (hasMatch) {
    if (hasHighLevel) {
      action = 'blocked';
    } else {
      action = 'masked';
      maskedFieldsMap = {};
      for (const [key, value] of Object.entries(fieldsMap)) {
        if (value) {
          maskedFieldsMap[key] = filter.mask(value, allMatches);
        } else {
          maskedFieldsMap[key] = value;
        }
      }
    }
  }

  try {
    await AuditLog.create({
      type,
      targetId,
      userId,
      content: allContent,
      fields: fieldNames,
      matchedWords: allMatches,
      action,
      maskedContent: maskedFieldsMap ? JSON.stringify(maskedFieldsMap) : null
    });
  } catch (e) {
    logger.error(`Create audit log error: ${e.message}`);
  }

  return {
    passed: action !== 'blocked',
    blocked: action === 'blocked',
    masked: action === 'masked',
    matchedWords: allMatches,
    action,
    maskedFieldsMap
  };
};

module.exports = {
  DFAFilter,
  buildFilter,
  auditContent,
  auditMultipleFields,
  getFilter: () => filter
};
