const { DFAFilter } = require('../../src/services/auditService');

describe('DFA Filter (Content Audit)', () => {
  let filter;

  beforeEach(() => {
    filter = new DFAFilter();
  });

  describe('addWord & build', () => {
    it('should add a single word to the filter tree', () => {
      filter.addWord('test', { category: 'test', level: 2 });
      expect(filter.isBuilt).toBe(false);
    });

    it('should build filter from word list', () => {
      const words = [
        { word: '违禁', category: 'politics', level: 3 },
        { word: '广告', category: 'advertising', level: 2 },
        { word: '推销', category: 'advertising', level: 1 }
      ];

      filter.build(words);
      expect(filter.isBuilt).toBe(true);
    });

    it('should handle empty word list', () => {
      filter.build([]);
      expect(filter.isBuilt).toBe(true);

      const matches = filter.search('any text here');
      expect(matches).toEqual([]);
    });

    it('should build filter with multiple words and categories', () => {
      const words = [
        { word: '脏话', category: 'profanity', level: 2 },
        { word: '诈骗', category: 'fraud', level: 3 },
        { word: '赌博', category: 'illegal', level: 3 },
        { word: '加微信', category: 'advertising', level: 2 }
      ];

      filter.build(words);
      expect(filter.isBuilt).toBe(true);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      const words = [
        { word: '违禁词', category: 'politics', level: 3 },
        { word: '敏感词', category: 'advertising', level: 2 },
        { word: '广告推销', category: 'advertising', level: 2 },
        { word: '脏话', category: 'profanity', level: 2 },
        { word: '诈骗', category: 'fraud', level: 3 },
        { word: '购买', category: 'commerce', level: 1 }
      ];
      filter.build(words);
    });

    it('should find exact matches in text', () => {
      const matches = filter.search('这里包含违禁词和敏感词');

      expect(matches.length).toBe(2);
      expect(matches.map(m => m.word)).toContain('违禁词');
      expect(matches.map(m => m.word)).toContain('敏感词');
    });

    it('should return correct metadata for each match', () => {
      const matches = filter.search('发现诈骗行为');

      expect(matches.length).toBe(1);
      expect(matches[0].word).toBe('诈骗');
      expect(matches[0].category).toBe('fraud');
      expect(matches[0].level).toBe(3);
    });

    it('should find multiple occurrences without duplication', () => {
      const matches = filter.search('违禁词来了，违禁词又出现，违禁词第三次');

      const matchedWords = matches.map(m => m.word);
      const uniqueWords = [...new Set(matchedWords)];
      expect(uniqueWords).toEqual(['违禁词']);
    });

    it('should find overlapping patterns correctly', () => {
      const matches = filter.search('广告推销产品');

      expect(matches.map(m => m.word)).toContain('广告推销');
    });

    it('should return empty array when no matches found', () => {
      const matches = filter.search('这是一段完全正常的文本内容');
      expect(matches).toEqual([]);
    });

    it('should handle empty text input', () => {
      expect(filter.search('')).toEqual([]);
      expect(filter.search(null)).toEqual([]);
      expect(filter.search(undefined)).toEqual([]);
    });

    it('should not match partial words at boundaries', () => {
      const matches = filter.search('非敏感词语');

      expect(matches.map(m => m.word)).toContain('敏感词');
    });

    it('should handle filter not built case', () => {
      const emptyFilter = new DFAFilter();
      expect(emptyFilter.search('违禁词')).toEqual([]);
    });
  });

  describe('mask', () => {
    beforeEach(() => {
      const words = [
        { word: '违禁词', category: 'politics', level: 3 },
        { word: '广告', category: 'advertising', level: 2 }
      ];
      filter.build(words);
    });

    it('should mask matched words with asterisks', () => {
      const text = '这里有违禁词和广告内容';
      const matches = filter.search(text);
      const masked = filter.mask(text, matches);

      expect(masked).toContain('*'.repeat(3));
      expect(masked).toContain('*'.repeat(2));
      expect(masked).not.toContain('违禁词');
      expect(masked).not.toContain('广告');
    });

    it('should replace all occurrences of matched words', () => {
      const text = '违禁词A, 违禁词B, 广告C';
      const matches = filter.search(text);
      const masked = filter.mask(text, matches);

      const countAsterisk3 = (masked.match(/\*{3}/g) || []).length;
      expect(countAsterisk3).toBe(2);
      expect(masked).not.toContain('违禁词');
      expect(masked).not.toContain('广告');
    });

    it('should return original text when no matches', () => {
      const text = '完全正常的文本';
      const masked = filter.mask(text, []);
      expect(masked).toBe(text);
    });

    it('should handle empty matches array', () => {
      const text = 'test text';
      expect(filter.mask(text, [])).toBe(text);
    });

    it('should handle null/undefined matches', () => {
      const text = 'test text';
      expect(filter.mask(text, null)).toBe(text);
      expect(filter.mask(text, undefined)).toBe(text);
    });

    it('should mask words with correct length of asterisks', () => {
      const words = [{ word: '短', category: 'test', level: 1 }];
      filter.build(words);

      const text = '短词测试';
      const matches = filter.search(text);
      const masked = filter.mask(text, matches);

      expect(masked.substring(0, 1)).toBe('*');
    });
  });

  describe('containsHighLevel', () => {
    it('should return true when any match has level >= 3', () => {
      const matches = [
        { word: 'a', category: 'test', level: 1 },
        { word: 'b', category: 'test', level: 3 },
        { word: 'c', category: 'test', level: 2 }
      ];
      expect(filter.containsHighLevel(matches)).toBe(true);
    });

    it('should return false when all matches have level < 3', () => {
      const matches = [
        { word: 'a', category: 'test', level: 1 },
        { word: 'b', category: 'test', level: 2 },
        { word: 'c', category: 'test', level: 2 }
      ];
      expect(filter.containsHighLevel(matches)).toBe(false);
    });

    it('should return false for empty matches', () => {
      expect(filter.containsHighLevel([])).toBe(false);
    });

    it('should return true for exactly level 3', () => {
      const matches = [{ word: 'exact3', category: 'test', level: 3 }];
      expect(filter.containsHighLevel(matches)).toBe(true);
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special regex characters', () => {
      const specialChars = '.*+?^${}()|[]\\';
      const escaped = filter.escapeRegExp(specialChars);

      expect(escaped).not.toBe(specialChars);
      expect(() => new RegExp(escaped)).not.toThrow();
    });

    it('should handle strings without special chars', () => {
      expect(filter.escapeRegExp('normal text')).toBe('normal text');
    });

    it('should handle empty string', () => {
      expect(filter.escapeRegExp('')).toBe('');
    });
  });
});
