const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
jest.mock('../../src/config', () => ({
  jwtSecret: 'unit-test-fixed-secret',
  jwtExpiresIn: '7d'
}));
const { signToken, verifyToken, extractBearerToken } = require('../../src/utils/auth');

describe('Auth Utils', () => {
  describe('signToken', () => {
    it('should generate a valid JWT token with correct payload', () => {
      const user = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
      };

      const token = signToken(user);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      const decoded = jwt.verify(token, 'unit-test-fixed-secret');
      expect(decoded.sub).toBe(user._id.toString());
    });

    it('should set correct expiration based on config', () => {
      const user = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
      };

      const token = signToken(user);
      const decoded = jwt.decode(token);
      const now = Math.floor(Date.now() / 1000);
      const expectedMaxSeconds = 7 * 24 * 3600 + 2;
      const expectedMinSeconds = 7 * 24 * 3600 - 10;
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(expectedMaxSeconds);
      expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(expectedMinSeconds);
      expect(decoded.exp).toBeGreaterThan(now);
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode a valid token', () => {
      const user = {
        _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011')
      };
      const token = signToken(user);

      const payload = verifyToken(token);
      expect(payload.sub).toBe(user._id.toString());
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        verifyToken('invalid-token-string');
      }).toThrow();
    });

    it('should throw error for token with wrong secret', () => {
      const token = jwt.sign({ sub: 'test' }, 'wrong-secret');
      expect(() => {
        verifyToken(token);
      }).toThrow();
    });

    it('should throw error for expired token', () => {
      const expiredToken = jwt.sign(
        { sub: 'test' },
        'unit-test-fixed-secret',
        { expiresIn: '-1h' }
      );
      expect(() => {
        verifyToken(expiredToken);
      }).toThrow();
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const header = `Bearer ${token}`;

      const result = extractBearerToken(header);
      expect(result).toBe(token);
    });

    it('should handle lowercase bearer scheme', () => {
      const token = 'test-token-123';
      const header = `bearer ${token}`;

      const result = extractBearerToken(header);
      expect(result).toBe(token);
    });

    it('should handle mixed case Bearer scheme', () => {
      const token = 'test-token-mixed';
      const header = `BeArEr ${token}`;

      const result = extractBearerToken(header);
      expect(result).toBe(token);
    });

    it('should handle extra whitespace in header', () => {
      const token = 'test-token-whitespace';
      const header = `  Bearer   ${token}  `;

      const result = extractBearerToken(header);
      expect(result).toBe(token);
    });

    it('should return empty string for non-string input', () => {
      expect(extractBearerToken(null)).toBe('');
      expect(extractBearerToken(undefined)).toBe('');
      expect(extractBearerToken(123)).toBe('');
      expect(extractBearerToken({})).toBe('');
    });

    it('should return empty string when scheme is missing', () => {
      expect(extractBearerToken('')).toBe('');
      expect(extractBearerToken('   ')).toBe('');
    });

    it('should return empty string when scheme is not Bearer', () => {
      expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBe('');
      expect(extractBearerToken('Token abc123')).toBe('');
      expect(extractBearerToken('JWT xyz789')).toBe('');
    });

    it('should return empty string when token is missing after scheme', () => {
      expect(extractBearerToken('Bearer')).toBe('');
      expect(extractBearerToken('Bearer ')).toBe('');
      expect(extractBearerToken('Bearer   ')).toBe('');
    });
  });
});
