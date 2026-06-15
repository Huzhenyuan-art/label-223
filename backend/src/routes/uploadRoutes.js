const express = require('express');
const uploadController = require('../controllers/uploadController');
const { auth } = require('../middlewares/auth');

const router = express.Router();

router.use(auth);

router.post(
  '/image',
  uploadController.uploadImageMiddleware,
  uploadController.uploadMedia
);

router.post(
  '/audio',
  uploadController.uploadAudioMiddleware,
  uploadController.uploadMedia
);

router.delete('/', uploadController.deleteMedia);

module.exports = router;
