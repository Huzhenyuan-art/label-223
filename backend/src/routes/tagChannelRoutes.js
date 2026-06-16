const express = require('express');
const tagChannelController = require('../controllers/tagChannelController');
const { auth, optionalAuth } = require('../middlewares/auth');
const { paginationValidator } = require('../middlewares/validator');

const router = express.Router();

router.get('/channels', optionalAuth, paginationValidator, tagChannelController.getTagChannelList);
router.get('/channels/recommend', optionalAuth, tagChannelController.recommendTagsForUser);
router.get('/me/subscribed', auth, tagChannelController.getMySubscribedTags);
router.get('/me/new-status', auth, tagChannelController.getTagsNewContentStatus);
router.post('/channels/:tag/subscribe', auth, tagChannelController.subscribeTag);
router.post('/subscribe', auth, tagChannelController.subscribeTag);
router.post('/channels/:tag/unsubscribe', auth, tagChannelController.unsubscribeTag);
router.post('/unsubscribe', auth, tagChannelController.unsubscribeTag);
router.post('/channels/:tag/viewed', auth, tagChannelController.markTagViewed);
router.post('/viewed', auth, tagChannelController.markTagViewed);
router.get('/channels/:tag/posts', optionalAuth, paginationValidator, tagChannelController.getTagPosts);
router.get('/:tag/posts', optionalAuth, paginationValidator, tagChannelController.getTagPosts);

module.exports = router;
