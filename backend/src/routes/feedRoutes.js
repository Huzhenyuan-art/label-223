const express = require('express');
const feedController = require('../controllers/feedController');
const { optionalAuth } = require('../middlewares/auth');
const { paginationValidator, postIdValidator } = require('../middlewares/validator');

const router = express.Router();

router.get('/ocean', optionalAuth, paginationValidator, feedController.getOceanFlow);
router.get('/hot-tags', optionalAuth, feedController.getHotTags);
router.get('/search', optionalAuth, paginationValidator, feedController.searchDeepSea);
router.get('/posts/:id', optionalAuth, postIdValidator, feedController.getPostDetail);
router.get('/posts/:id/resonances', optionalAuth, postIdValidator, paginationValidator, feedController.getResonanceList);
router.get('/posts/:id/super-echo-tree', optionalAuth, postIdValidator, feedController.getSuperEchoTree);

module.exports = router;
