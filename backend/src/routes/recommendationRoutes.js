const express = require('express');
const recommendationController = require('../controllers/recommendationController');
const { auth, requireAdmin } = require('../middlewares/auth');

const router = express.Router();

router.get('/status', auth, requireAdmin, recommendationController.getStatus);
router.get('/config', auth, requireAdmin, recommendationController.getConfig);
router.put('/config', auth, requireAdmin, recommendationController.updateConfig);
router.post('/config/refresh', auth, requireAdmin, recommendationController.refreshConfig);

router.post('/jobs/:jobName', auth, requireAdmin, recommendationController.triggerJob);

router.post(
  '/users/:userId/tags/precompute',
  auth,
  requireAdmin,
  recommendationController.precomputeUserTags
);
router.delete(
  '/users/:userId/cache',
  auth,
  requireAdmin,
  recommendationController.invalidateUserCache
);

router.post(
  '/snapshots/:window',
  auth,
  requireAdmin,
  recommendationController.createSnapshot
);

router.post('/cache/cleanup', auth, requireAdmin, recommendationController.cleanupCache);

module.exports = router;
