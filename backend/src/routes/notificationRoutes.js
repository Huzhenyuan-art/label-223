const express = require('express');
const notificationController = require('../controllers/notificationController');
const { auth } = require('../middlewares/auth');
const { paginationValidator } = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.get('/', paginationValidator, notificationController.getNotifications);
router.get('/unread', notificationController.getUnreadCount);
router.get('/unread-by-type', notificationController.getUnreadCountsByType);
router.post('/read', notificationController.markAsRead);
router.post('/read-all', notificationController.markAllAsRead);

module.exports = router;
