const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/appFactory');
const {
  createTestUser,
  createAdminUser,
  createBannedUser,
  createPremiumUser,
  createTestPost,
  createPremiumOrder,
  authHeader,
  validObjectId,
  invalidObjectId
} = require('../helpers/testHelpers');

describe('Payments, Premium & Admin Backend Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Payment Plans & Checkout', () => {
    describe('GET /api/payments/plans', () => {
      it('should return all payment plans with details', async () => {
        const { token } = await createTestUser({ account: 'plans_user' });
        const response = await request(app)
          .get('/api/payments/plans')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThanOrEqual(3);

        const plans = response.body.data;
        expect(plans.some(p => p.key === 'monthly')).toBe(true);
        expect(plans.some(p => p.key === 'quarterly')).toBe(true);
        expect(plans.some(p => p.key === 'yearly')).toBe(true);

        const monthly = plans.find(p => p.key === 'monthly');
        expect(monthly.price).toBeDefined();
        expect(monthly.durationDays).toBe(30);
        expect(Array.isArray(monthly.features)).toBe(true);
      });
    });

    describe('POST /api/payments/checkout', () => {
      it('should create checkout and activate premium for valid plan', async () => {
        const { User, PaymentOrder } = require('../../src/models');
        const { token, userId } = await createTestUser({ account: 'chk_user' });

        const response = await request(app)
          .post('/api/payments/checkout')
          .set(authHeader(token))
          .send({ plan: 'monthly' });

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.order.status).toBe('paid');
        expect(response.body.data.premium.isActive).toBe(true);
        expect(response.body.data.premium.plan).toBe('monthly');

        const user = await User.findById(userId);
        expect(user.premium.isActive).toBe(true);
        expect(user.premium.plan).toBe('monthly');
        expect(new Date(user.premium.expireAt).getTime())
          .toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);

        const order = await PaymentOrder.findOne({ user: userId });
        expect(order).not.toBeNull();
        expect(order.status).toBe('paid');
        expect(order.plan).toBe('monthly');
        expect(order.orderNo).toBeDefined();
      });

      it('should extend existing premium instead of overwriting', async () => {
        const { User } = require('../../src/models');
        const existingExpire = new Date(Date.now() + 15 * 24 * 3600 * 1000);
        const { token, userId } = await createTestUser({
          account: 'extend_user',
          premium: {
            isActive: true,
            plan: 'monthly',
            expireAt: existingExpire
          }
        });

        const response = await request(app)
          .post('/api/payments/checkout')
          .set(authHeader(token))
          .send({ plan: 'quarterly' });

        expect(response.status).toBe(200);

        const user = await User.findById(userId);
        expect(new Date(user.premium.expireAt).getTime())
          .toBeGreaterThan(existingExpire.getTime() + 89 * 24 * 3600 * 1000);
      });

      it('should reject invalid plan key', async () => {
        const { token } = await createTestUser({ account: 'bad_plan' });

        const response = await request(app)
          .post('/api/payments/checkout')
          .set(authHeader(token))
          .send({ plan: 'nonexistent_plan' });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe(1);
        expect(response.body.message).toContain('请求参数错误');
      });

      it('should reject checkout for unauthenticated user', async () => {
        const response = await request(app)
          .post('/api/payments/checkout')
          .send({ plan: 'monthly' });

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/payments/orders/me (My Orders)', () => {
      it('should return user order history', async () => {
        const { token, userId } = await createTestUser({ account: 'order_user' });
        await createPremiumOrder(userId, 'monthly');
        await createPremiumOrder(userId, 'yearly', { amount: 268 });

        const response = await request(app)
          .get('/api/payments/orders/me')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.length).toBe(2);
        response.body.data.forEach(order => {
          expect(order.planName).toBeDefined();
          expect(order.statusLabel).toBeDefined();
        });
      });

      it('should return empty array for user with no orders', async () => {
        const { token } = await createTestUser({ account: 'no_order' });

        const response = await request(app)
          .get('/api/payments/orders/me')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
      });
    });
  });

  describe('Admin Backend', () => {
    describe('POST /api/admin/login', () => {
      it('should login admin user successfully', async () => {
        await createAdminUser({
          account: 'admin_login',
          password: 'password123'
        });

        const response = await request(app)
          .post('/api/admin/login')
          .send({
            account: 'admin_login',
            password: 'password123'
          });

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.token).toBeDefined();
        expect(response.body.data.user.isAdmin).toBe(true);
      });

      it('should reject non-admin user login', async () => {
        await createTestUser({
          account: 'not_admin',
          password: 'password123'
        });

        const response = await request(app)
          .post('/api/admin/login')
          .send({
            account: 'not_admin',
            password: 'password123'
          });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe(3);
        expect(response.body.message).toContain('管理员权限');
      });

      it('should reject banned admin from login', async () => {
        await createBannedUser({
          account: 'banned_admin',
          password: 'password123',
          isAdmin: true
        });

        const response = await request(app)
          .post('/api/admin/login')
          .send({
            account: 'banned_admin',
            password: 'password123'
          });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe(4);
        expect(response.body.message).toContain('封禁');
      });

      it('should return 401 for wrong password', async () => {
        await createAdminUser({
          account: 'admin_wrong_pw',
          password: 'password123'
        });

        const response = await request(app)
          .post('/api/admin/login')
          .send({
            account: 'admin_wrong_pw',
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
      });
    });

    describe('Admin Auth Middleware', () => {
      it('should allow admin access to protected endpoints', async () => {
        const { token } = await createAdminUser({ account: 'admin_auth_ok' });

        const response = await request(app)
          .get('/api/admin/dashboard/stats')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
      });

      it('should reject regular user from admin endpoints', async () => {
        const { token } = await createTestUser({ account: 'regular_user' });

        const response = await request(app)
          .get('/api/admin/dashboard/stats')
          .set(authHeader(token));

        expect(response.status).toBe(403);
        expect(response.body.code).toBe(3);
      });

      it('should reject unauthenticated access to admin endpoints', async () => {
        const response = await request(app).get('/api/admin/dashboard/stats');
        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/admin/dashboard/stats (Stats)', () => {
      it('should return overview statistics and trends', async () => {
        const { User, Post, PaymentOrder } = require('../../src/models');
        const { token } = await createAdminUser({ account: 'admin_stats' });

        const u1 = await createTestUser({ account: 'u1' });
        const u2 = await createTestUser({ account: 'u2' });
        await createTestPost(u1.userId);
        await createTestPost(u2.userId);
        await createPremiumOrder(u1.userId, 'monthly');

        const response = await request(app)
          .get('/api/admin/dashboard/stats')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);

        const { overview, trends } = response.body.data;
        expect(overview.totalUsers).toBeGreaterThanOrEqual(2);
        expect(overview.totalPosts).toBeGreaterThanOrEqual(2);
        expect(overview.totalOrders).toBeGreaterThanOrEqual(1);
        expect(overview.totalRevenue).toBeGreaterThanOrEqual(0);
        expect(trends.dailyUserTrend).toBeDefined();
        expect(trends.dailyPostTrend).toBeDefined();
        expect(trends.dailyOrderTrend).toBeDefined();
      });
    });

    describe('User Management (Admin)', () => {
      describe('GET /api/admin/users (User List)', () => {
        it('should return paginated user list', async () => {
          const { token } = await createAdminUser({ account: 'admin_list' });
          await createTestUser({ account: 'user_list_1' });
          await createTestUser({ account: 'user_list_2' });
          await createTestUser({ account: 'user_list_3' });

          const response = await request(app)
            .get('/api/admin/users')
            .set(authHeader(token))
            .query({ page: 1, limit: 2 });

          expect(response.status).toBe(200);
          expect(response.body.code).toBe(0);
          expect(response.body.data.list.length).toBeLessThanOrEqual(2);
          expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
          expect(response.body.data.pagination.totalPages).toBeGreaterThanOrEqual(2);
        });

        it('should filter users by keyword search', async () => {
          const { token } = await createAdminUser({ account: 'admin_search' });
          await createTestUser({ account: 'alpha_user', nickname: 'AlphaName' });
          await createTestUser({ account: 'beta_user', nickname: 'BetaName' });

          const response = await request(app)
            .get('/api/admin/users')
            .set(authHeader(token))
            .query({ keyword: 'Alpha' });

          expect(response.status).toBe(200);
          const accounts = response.body.data.list.map(u => u.account);
          expect(accounts).toContain('alpha_user');
          expect(accounts).not.toContain('beta_user');
        });

        it('should filter by premium status', async () => {
          const { token } = await createAdminUser({ account: 'admin_premium_filter' });
          await createPremiumUser({ account: 'premium_u' });
          await createTestUser({ account: 'regular_u' });

          const response = await request(app)
            .get('/api/admin/users')
            .set(authHeader(token))
            .query({ premium: 'active' });

          expect(response.status).toBe(200);
          const list = response.body.data.list;
          list.forEach(u => {
            if (u.account !== 'admin_premium_filter') {
              expect(u.premium?.isActive).toBe(true);
            }
          });
        });
      });

      describe('GET /api/admin/users/:id (User Detail)', () => {
        it('should return detailed user info with stats', async () => {
          const { token } = await createAdminUser({ account: 'admin_detail' });
          const { userId } = await createTestUser({ account: 'target_user', nickname: '目标用户' });
          await createTestPost(userId);

          const response = await request(app)
            .get(`/api/admin/users/${userId}`)
            .set(authHeader(token));

          expect(response.status).toBe(200);
          expect(response.body.code).toBe(0);
          expect(response.body.data.profile.nickname).toBe('目标用户');
          expect(response.body.data.stats.postCount).toBe(1);
          expect(response.body.data.stats.resonanceGiven).toBe(0);
          expect(response.body.data.recentPosts.length).toBe(1);
        });

        it('should return 400 for invalid user id', async () => {
          const { token } = await createAdminUser({ account: 'admin_bad_id' });

          const response = await request(app)
            .get(`/api/admin/users/${invalidObjectId()}`)
            .set(authHeader(token));

          expect(response.status).toBe(400);
        });

        it('should return 404 for non-existent user', async () => {
          const { token } = await createAdminUser({ account: 'admin_ghost' });

          const response = await request(app)
            .get(`/api/admin/users/${validObjectId()}`)
            .set(authHeader(token));

          expect(response.status).toBe(404);
        });
      });

      describe('POST /api/admin/users/:id/ban', () => {
        it('should ban a regular user successfully', async () => {
          const { User } = require('../../src/models');
          const { token } = await createAdminUser({ account: 'admin_ban' });
          const { userId } = await createTestUser({ account: 'to_ban' });

          const response = await request(app)
            .post(`/api/admin/users/${userId}/ban`)
            .set(authHeader(token))
            .send({ reason: '违反社区规范' });

          expect(response.status).toBe(200);
          expect(response.body.code).toBe(0);

          const bannedUser = await User.findById(userId);
          expect(bannedUser.status).toBe('banned');
          expect(bannedUser.bannedReason).toBe('违反社区规范');
          expect(bannedUser.bannedAt).not.toBeNull();
        });

        it('should reject banning oneself', async () => {
          const { token, userId: adminId } = await createAdminUser({ account: 'admin_self_ban' });

          const response = await request(app)
            .post(`/api/admin/users/${adminId}/ban`)
            .set(authHeader(token))
            .send({ reason: 'self ban' });

          expect(response.status).toBe(400);
          expect(response.body.message).toContain('不能封禁自己');
        });

        it('should reject banning another admin', async () => {
          const { token } = await createAdminUser({ account: 'admin_ban_admin' });
          const { userId: otherAdminId } = await createAdminUser({ account: 'other_admin' });

          const response = await request(app)
            .post(`/api/admin/users/${otherAdminId}/ban`)
            .set(authHeader(token));

          expect(response.status).toBe(403);
          expect(response.body.message).toContain('不能封禁管理员账号');
        });
      });

      describe('POST /api/admin/users/:id/unban', () => {
        it('should unban a banned user', async () => {
          const { User } = require('../../src/models');
          const { token } = await createAdminUser({ account: 'admin_unban' });
          const { userId } = await createBannedUser({ account: 'banned_u' });

          const response = await request(app)
            .post(`/api/admin/users/${userId}/unban`)
            .set(authHeader(token));

          expect(response.status).toBe(200);
          expect(response.body.code).toBe(0);

          const user = await User.findById(userId);
          expect(user.status).toBe('active');
          expect(user.bannedAt).toBeNull();
          expect(user.bannedReason).toBe('');
        });

        it('should return 404 for non-existent user unban', async () => {
          const { token } = await createAdminUser({ account: 'admin_unban_ghost' });

          const response = await request(app)
            .post(`/api/admin/users/${validObjectId()}/unban`)
            .set(authHeader(token));

          expect(response.status).toBe(404);
        });
      });

      describe('POST /api/admin/users/:id/admin', () => {
        it('should grant admin role to a user', async () => {
          const { User } = require('../../src/models');
          const { token } = await createAdminUser({ account: 'admin_grant' });
          const { userId } = await createTestUser({ account: 'future_admin' });

          const response = await request(app)
            .post(`/api/admin/users/${userId}/admin`)
            .set(authHeader(token))
            .send({ isAdmin: true });

          expect(response.status).toBe(200);
          expect(response.body.code).toBe(0);

          const promoted = await User.findById(userId);
          expect(promoted.isAdmin).toBe(true);
        });

        it('should revoke admin role', async () => {
          const { User } = require('../../src/models');
          const { token } = await createAdminUser({ account: 'admin_revoke' });
          const { userId } = await createAdminUser({ account: 'to_demote' });

          const response = await request(app)
            .post(`/api/admin/users/${userId}/admin`)
            .set(authHeader(token))
            .send({ isAdmin: false });

          expect(response.status).toBe(200);

          const demoted = await User.findById(userId);
          expect(demoted.isAdmin).toBe(false);
        });

        it('should return 400 for invalid user id', async () => {
          const { token } = await createAdminUser({ account: 'admin_invalid_id' });

          const response = await request(app)
            .post(`/api/admin/users/${invalidObjectId()}/admin`)
            .set(authHeader(token))
            .send({ isAdmin: true });

          expect(response.status).toBe(400);
        });
      });
    });

    describe('POST /api/admin/posts/:id/remove', () => {
      it('should remove a post as admin', async () => {
        const { Post } = require('../../src/models');
        const { token } = await createAdminUser({ account: 'admin_post' });
        const { userId } = await createTestUser({ account: 'post_owner' });
        const post = await createTestPost(userId);

        const response = await request(app)
          .post(`/api/admin/posts/${post._id}/remove`)
          .set(authHeader(token))
          .send({ reason: '内容违规' });

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);

        const removedPost = await Post.findById(post._id);
        expect(removedPost.status).toBe('removed');
        expect(removedPost.removedReason).toBe('内容违规');
      });
    });

    describe('Admin Operation Logs', () => {
      it('should create admin operation log when banning user', async () => {
        const { AdminOperationLog } = require('../../src/models');
        const { token } = await createAdminUser({ account: 'admin_log' });
        const { userId } = await createTestUser({ account: 'log_target' });

        await request(app)
          .post(`/api/admin/users/${userId}/ban`)
          .set(authHeader(token))
          .send({ reason: 'log test' });

        const logs = await AdminOperationLog.find({
          targetId: userId,
          action: 'ban_user'
        });
        expect(logs.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Premium-only Features', () => {
    describe('GET /api/users/me/insight-report', () => {
      it('should return 30-day insight report for premium user', async () => {
        const { token, userId } = await createPremiumUser({ account: 'report_user' });
        const now = new Date();
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3600 * 1000);

        await createTestPost(userId, {
          title: '最近的帖子',
          createdAt: tenDaysAgo,
          resonanceCount: 15,
          commentCount: 8
        });

        const response = await request(app)
          .get('/api/users/me/insight-report')
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.period).toBe('30d');
        expect(response.body.data.summary.postCount30d).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(response.body.data.topTags)).toBe(true);
        expect(Array.isArray(response.body.data.trend)).toBe(true);
      });
    });

    describe('PUT /api/users/me/tag-skin', () => {
      it('should update tag skin for premium user', async () => {
        const { User } = require('../../src/models');
        const { token, userId } = await createPremiumUser({
          account: 'skin_user',
          tagSkin: 'ocean'
        });

        const response = await request(app)
          .put('/api/users/me/tag-skin')
          .set(authHeader(token))
          .send({ skin: 'sunset' });

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.tagSkin).toBe('sunset');

        const user = await User.findById(userId);
        expect(user.tagSkin).toBe('sunset');
      });
    });

    describe('Favorites System', () => {
      it('should add a post to favorites', async () => {
        const { User } = require('../../src/models');
        const { token, userId } = await createTestUser({ account: 'fav_user' });
        const { userId: authorId } = await createTestUser({ account: 'fav_author' });
        const post = await createTestPost(authorId);

        const response = await request(app)
          .post(`/api/users/me/favorites/${post._id}/toggle`)
          .set(authHeader(token));

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.isFavorited).toBe(true);
        expect(response.body.data.action).toBe('added');

        const user = await User.findById(userId);
        const favIds = user.favoritePosts.map(id => id.toString());
        expect(favIds).toContain(post._id.toString());
      });

      it('should remove post from favorites when toggled again', async () => {
        const { User } = require('../../src/models');
        const { token, userId } = await createTestUser({ account: 'unfav_user' });
        const { userId: authorId } = await createTestUser({ account: 'unfav_author' });
        const post = await createTestPost(authorId);
        await User.findByIdAndUpdate(userId, { $addToSet: { favoritePosts: post._id } });

        const response = await request(app)
          .post(`/api/users/me/favorites/${post._id}/toggle`)
          .set(authHeader(token));

        expect(response.body.data.isFavorited).toBe(false);
        expect(response.body.data.action).toBe('removed');
      });

      it('should return 404 when toggling non-existent post', async () => {
        const { token } = await createTestUser({ account: 'fav_ghost' });

        const response = await request(app)
          .post(`/api/users/me/favorites/${validObjectId()}/toggle`)
          .set(authHeader(token));

        expect(response.status).toBe(404);
      });

      it('should batch remove favorites', async () => {
        const { User } = require('../../src/models');
        const { token, userId } = await createTestUser({ account: 'batch_user' });
        const { userId: authorId } = await createTestUser({ account: 'batch_author' });
        const p1 = await createTestPost(authorId);
        const p2 = await createTestPost(authorId);
        const p3 = await createTestPost(authorId);
        await User.findByIdAndUpdate(userId, {
          $addToSet: { favoritePosts: { $each: [p1._id, p2._id, p3._id] } }
        });

        const response = await request(app)
          .post('/api/users/me/favorites/batch-remove')
          .set(authHeader(token))
          .send({ postIds: [p1._id.toString(), p3._id.toString()] });

        expect(response.status).toBe(200);
        expect(response.body.code).toBe(0);
        expect(response.body.data.removedCount).toBe(2);

        const user = await User.findById(userId);
        expect(user.favoritePosts.length).toBe(1);
      });
    });
  });
});
