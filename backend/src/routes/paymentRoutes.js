const express = require('express');
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middlewares/auth');
const { checkoutValidator } = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.get('/plans', paymentController.getPlans);
router.post('/checkout', checkoutValidator, paymentController.createCheckout);
router.get('/orders/me', paymentController.getMyOrders);

module.exports = router;
