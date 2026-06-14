const express = require('express');
const postController = require('../controllers/postController');
const { auth } = require('../middlewares/auth');
const {
  createPostValidator,
  superEchoValidator,
  postIdValidator,
  commentValidator
} = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.get('/me', postController.getMyPosts);
router.post('/', createPostValidator, postController.createPost);
router.post('/:id/resonance', postIdValidator, postController.toggleResonance);
router.post('/:id/comment', commentValidator, postController.createComment);
router.post('/:id/super-echo', superEchoValidator, postController.createSuperEcho);

module.exports = router;
