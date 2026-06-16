const express = require('express');
const router = express.Router();

const { adminAuth } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');
const adminUserController = require('../controllers/adminUserController');
const adminPostController = require('../controllers/adminPostController');
const adminMessageController = require('../controllers/adminMessageController');
const adminPaymentController = require('../controllers/adminPaymentController');
const adminCommerceController = require('../controllers/adminCommerceController');
const adminLogController = require('../controllers/adminLogController');

router.post('/login', adminController.login);
router.get('/me', adminAuth, adminController.getCurrentAdmin);
router.get('/dashboard/stats', adminAuth, adminController.getDashboardStats);

router.get('/users', adminAuth, adminUserController.getUsers);
router.get('/users/:id', adminAuth, adminUserController.getUserDetail);
router.post('/users/:id/ban', adminAuth, adminUserController.banUser);
router.post('/users/:id/unban', adminAuth, adminUserController.unbanUser);
router.post('/users/:id/admin', adminAuth, adminUserController.setAdmin);

router.get('/posts', adminAuth, adminPostController.getPosts);
router.get('/posts/:id', adminAuth, adminPostController.getPostDetail);
router.post('/posts/:id/remove', adminAuth, adminPostController.removePost);
router.post('/posts/:id/restore', adminAuth, adminPostController.restorePost);
router.post('/posts/batch-remove', adminAuth, adminPostController.batchRemovePosts);

router.get('/conversations', adminAuth, adminMessageController.getConversations);
router.get('/conversations/:conversationId/messages', adminAuth, adminMessageController.getConversationMessages);

router.get('/orders', adminAuth, adminPaymentController.getOrders);
router.get('/orders/:id', adminAuth, adminPaymentController.getOrderDetail);
router.post('/orders/:id/confirm', adminAuth, adminPaymentController.manualConfirmOrder);

router.get('/inquiries', adminAuth, adminCommerceController.getInquiries);
router.get('/inquiries/:id', adminAuth, adminCommerceController.getInquiryDetail);
router.post('/inquiries/:id/contacted', adminAuth, adminCommerceController.markInquiryContacted);
router.get('/brand-camps', adminAuth, adminCommerceController.getBrandCamps);

router.get('/operation-logs', adminAuth, adminLogController.getOperationLogs);
router.get('/operation-logs/stats', adminAuth, adminLogController.getOperationLogStats);

module.exports = router;
