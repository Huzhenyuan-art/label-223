const express = require('express');
const messageController = require('../controllers/messageController');
const { auth } = require('../middlewares/auth');
const { sendMessageValidator, revealValidator, paginationValidator } = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.get('/conversations', messageController.getConversations);
router.get('/conversations/:conversationId/messages', paginationValidator, messageController.getConversationMessages);
router.post('/send', sendMessageValidator, messageController.sendMessage);
router.post('/conversations/reveal', revealValidator, messageController.requestReveal);
router.get('/unread', messageController.getUnreadCount);

module.exports = router;
