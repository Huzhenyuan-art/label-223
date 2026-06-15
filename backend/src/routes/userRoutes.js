const express = require('express');
const userController = require('../controllers/userController');
const { auth, requirePremium } = require('../middlewares/auth');
const {
  loginValidator,
  registerValidator,
  tagSkinValidator,
  createPrivateGroupValidator
} = require('../middlewares/validator');

const router = express.Router();

router.post('/register', registerValidator, userController.register);
router.post('/login', loginValidator, userController.login);
router.get('/me/island', auth, userController.getIsland);
router.get('/me/favorites/by-tag', auth, userController.getFavoritesByTag);
router.get('/me/insight-report', auth, requirePremium, userController.getInsightReport);
router.get('/me/private-groups', auth, requirePremium, userController.getMyPrivateGroups);
router.post('/me/favorites/:postId/toggle', auth, userController.toggleFavorite);
router.put('/me/tag-skin', auth, requirePremium, tagSkinValidator, userController.updateTagSkin);
router.post('/me/private-groups', auth, requirePremium, createPrivateGroupValidator, userController.createPrivateGroup);
router.get('/public/:id', auth, userController.getPublicProfile);

module.exports = router;
