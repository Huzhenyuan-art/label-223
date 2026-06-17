const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/appFactory');
const {
  createTestUser,
  createBannedUser,
  createPremiumUser,
  createTestPost,
  createTestResonance,
  createTestComment,
  authHeader,
  validObjectId,
  invalidObjectId
} = require('../helpers/testHelpers');

const VALID_PASSWORD = 'password123';
const REGISTER_BODY = (overrides = {}) => ({
  nickname: '测试昵称',
  account: 'testuser123',
  password: VALID_PASSWORD,
  ...overrides
});

describe('User Authentication Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/users/register', () => {
    it('should register a new user successfully with valid data', async () => {
      const { User } = require('../../src/models');
      const response = await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'register_ok' }));

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.account).toBe('register_ok');
      expect(response.body.data.user.nickname).toBe('测试昵称');

      const user = await User.findOne({ account: 'register_ok' });
      expect(user.passwordHash).not.toBe(VALID_PASSWORD);
    });

    it('should return 409 for duplicate account', async () => {
      await createTestUser({ account: 'dup_account', password: VALID_PASSWORD });

      const response = await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'Dup_Account' }));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toContain('已被占用');
    });

    it('should normalize account to lowercase before registration', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'MixedCase_Acct', nickname: '大小写' }));

      expect(response.status).toBe(201);
      expect(response.body.data.user.account).toBe('mixedcase_acct');
    });

    it('should trim whitespace from account and nickname', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send({
          account: '  whitespace_acct  ',
          nickname: '  空白昵称  ',
          password: VALID_PASSWORD
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.account).toBe('whitespace_acct');
      expect(response.body.data.user.nickname).toBe('空白昵称');
    });

    it('should hash password (not stored in plaintext)', async () => {
      const { User } = require('../../src/models');
      await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'hash_pw' }));

      const user = await User.findOne({ account: 'hash_pw' });
      expect(user.passwordHash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(VALID_PASSWORD, user.passwordHash)).toBe(true);
    });

    it('should assign a default avatar based on account seed', async () => {
      const response1 = await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'avatar_a', nickname: 'A用户' }));

      const response2 = await request(app)
        .post('/api/users/register')
        .send(REGISTER_BODY({ account: 'avatar_b', nickname: 'B用户' }));

      expect(response1.body.data.user.avatar).toBeTruthy();
      expect(response2.body.data.user.avatar).toBeTruthy();
    });

    it('should return 400 for missing required fields (nickname)', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send({ account: 'incomplete_user', password: VALID_PASSWORD });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(1);
    });

    it('should return 400 for weak password (too short / no number)', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send({ nickname: '弱密码', account: 'weak_pw', password: 'weakpass' });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(1);
    });

    it('should return 400 for invalid account format (starts with number)', async () => {
      const response = await request(app)
        .post('/api/users/register')
        .send({ nickname: '错误账号', account: '123_invalid', password: VALID_PASSWORD });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/users/login', () => {
    it('should login successfully with correct credentials', async () => {
      await createTestUser({ account: 'login_ok', password: VALID_PASSWORD });

      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'login_ok', password: VALID_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.account).toBe('login_ok');
    });

    it('should return 401 for wrong password', async () => {
      await createTestUser({ account: 'wrong_pw', password: VALID_PASSWORD });

      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'wrong_pw', password: 'wrongpass123' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toContain('账号或密码错误');
    });

    it('should return 401 for non-existent account', async () => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'no_such_user', password: VALID_PASSWORD });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(1);
    });

    it('should handle case-insensitive account login', async () => {
      await createTestUser({ account: 'case_insensitive', password: VALID_PASSWORD });

      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'Case_Insensitive', password: VALID_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
    });

    it('should update lastLoginAt on successful login', async () => {
      const { User } = require('../../src/models');
      await createTestUser({ account: 'lastlogin_test', password: VALID_PASSWORD });
      const before = await User.findOne({ account: 'lastlogin_test' });
      expect(before.lastLoginAt).toBeNull();

      await request(app)
        .post('/api/users/login')
        .send({ account: 'lastlogin_test', password: VALID_PASSWORD });

      const afterLogin = await User.findOne({ account: 'lastlogin_test' });
      expect(afterLogin.lastLoginAt).not.toBeNull();
    });

    it('should expire expired premium status on login', async () => {
      const { User } = require('../../src/models');
      const expiredDate = new Date(Date.now() - 24 * 3600 * 1000);
      await User.create({
        openid: 'acct:premium_expired',
        account: 'premium_expired',
        nickname: '过期会员',
        passwordHash: await bcrypt.hash(VALID_PASSWORD, 10),
        authProvider: 'password',
        premium: {
          isActive: true,
          plan: 'yearly',
          expireAt: expiredDate
        }
      });

      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'premium_expired', password: VALID_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user.premium.isActive).toBe(false);
    });

    it('should retain valid premium status on login', async () => {
      await createPremiumUser({ account: 'premium_active', password: VALID_PASSWORD, plan: 'yearly' });

      const response = await request(app)
        .post('/api/users/login')
        .send({ account: 'premium_active', password: VALID_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user.premium.isActive).toBe(true);
      expect(response.body.data.user.premium.plan).toBe('yearly');
    });

    it('should return 400 for invalid account format in login', async () => {
      const response = await request(app)
        .post('/api/users/login')
        .send({ account: '123bad', password: VALID_PASSWORD });

      expect(response.status).toBe(400);
    });
  });

  describe('Auth Middleware', () => {
    it('should allow access with valid token', async () => {
      const { token } = await createTestUser({ account: 'auth_valid', password: VALID_PASSWORD });

      const response = await request(app)
        .get('/api/users/me/island')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
    });

    it('should reject requests without Authorization header', async () => {
      const response = await request(app).get('/api/users/me/island');

      expect(response.status).toBe(401);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toBe('Unauthorized');
    });

    it('should reject requests with invalid token format (no Bearer scheme)', async () => {
      const response = await request(app)
        .get('/api/users/me/island')
        .set('Authorization', 'InvalidTokenFormat');

      expect(response.status).toBe(401);
    });

    it('should reject requests with malformed Bearer token', async () => {
      const response = await request(app)
        .get('/api/users/me/island')
        .set('Authorization', 'Bearer not-a-valid-jwt-token');

      expect(response.status).toBe(401);
    });

    it('should reject access for banned users', async () => {
      const { token } = await createBannedUser({ account: 'banned_user', password: VALID_PASSWORD });

      const response = await request(app)
        .get('/api/users/me/island')
        .set(authHeader(token));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(4);
      expect(response.body.message).toContain('封禁');
    });

    it('should reject token for non-existent user (deleted user)', async () => {
      const { signToken } = require('../../src/utils/auth');
      const tempId = new mongoose.Types.ObjectId();
      const fakeToken = signToken({ _id: tempId });

      const response = await request(app)
        .get('/api/users/me/island')
        .set(authHeader(fakeToken));

      expect(response.status).toBe(401);
    });
  });

  describe('Premium Middleware', () => {
    it('should allow access for active premium members', async () => {
      const { token } = await createPremiumUser({ account: 'premium_allow', password: VALID_PASSWORD });

      const response = await request(app)
        .get('/api/users/me/insight-report')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
    });

    it('should reject access for non-premium users', async () => {
      const { token } = await createTestUser({ account: 'no_premium', password: VALID_PASSWORD });

      const response = await request(app)
        .get('/api/users/me/insight-report')
        .set(authHeader(token));

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(2);
      expect(response.body.message).toContain('会员专属');
    });

    it('should reject access for expired premium users', async () => {
      const { User } = require('../../src/models');
      const expiredDate = new Date(Date.now() - 24 * 3600 * 1000);
      const user = await User.create({
        openid: 'acct:premium_exp_usr',
        account: 'premium_exp_usr',
        nickname: '过期中',
        passwordHash: await bcrypt.hash(VALID_PASSWORD, 10),
        authProvider: 'password',
        premium: {
          isActive: true,
          plan: 'monthly',
          expireAt: expiredDate
        }
      });
      const { signToken } = require('../../src/utils/auth');
      const token = signToken(user);

      const response = await request(app)
        .get('/api/users/me/insight-report')
        .set(authHeader(token));

      expect(response.status).toBe(403);
    });
  });

  describe('Optional Auth Middleware', () => {
    it('should allow anonymous access to optional-auth endpoints', async () => {
      const response = await request(app).get('/api/feed/ocean');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
    });

    it('should enrich response when token provided to optional-auth endpoints', async () => {
      const { token } = await createTestUser({ account: 'opt_auth', password: VALID_PASSWORD });
      const post = await createTestPost(
        (await createTestUser({ account: 'opt_author', password: VALID_PASSWORD })).userId
      );
      await createTestResonance(post._id, (await createTestUser({ account: 'opt_res', password: VALID_PASSWORD })).userId);

      const response = await request(app)
        .get('/api/feed/ocean')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.viewerPremium).toBeDefined();
    });

    it('should not fail even with invalid token for optional-auth', async () => {
      const response = await request(app)
        .get('/api/feed/ocean')
        .set('Authorization', 'Bearer totally-invalid-token');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
    });
  });

  describe('GET /api/users/me/island (Authenticated Profile)', () => {
    it('should return user profile with metrics', async () => {
      const { token, userId } = await createTestUser({
        account: 'island_user',
        password: VALID_PASSWORD,
        nickname: '小岛主人'
      });
      const post = await createTestPost(userId, { resonanceCount: 5, commentCount: 3 });
      await createTestComment(userId, post._id);

      const response = await request(app)
        .get('/api/users/me/island')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.profile.nickname).toBe('小岛主人');
      expect(response.body.data.metrics.authoredCount).toBe(1);
      expect(response.body.data.metrics.commentCount).toBeGreaterThanOrEqual(1);
    });

    it('should calculate resonance index correctly', async () => {
      const { token, userId } = await createTestUser({
        account: 'ri_calc',
        password: VALID_PASSWORD
      });
      const originPost = await createTestPost(userId, {
        resonanceCount: 10,
        commentCount: 5,
        type: 'origin'
      });
      await createTestPost(userId, {
        resonanceCount: 2,
        commentCount: 1,
        type: 'super_echo'
      });
      await createTestComment(userId, originPost._id);

      const response = await request(app)
        .get('/api/users/me/island')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      const { metrics } = response.body.data;
      const expected = metrics.resonanceReceived * 4 + metrics.commentCount * 2 + metrics.superEchoCount * 3;
      expect(metrics.resonanceIndex).toBe(expected);
    });
  });
});
