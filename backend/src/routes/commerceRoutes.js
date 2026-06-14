const express = require('express');
const commerceController = require('../controllers/commerceController');
const { auth } = require('../middlewares/auth');
const { postIdValidator } = require('../middlewares/validator');

const router = express.Router();

router.use(auth);

router.get('/derivatives', commerceController.getDerivativeProducts);
router.get('/camps', commerceController.getBrandCamps);
router.post('/derivatives/:id/waitlist', postIdValidator, commerceController.joinDerivativeWaitlist);
router.post('/camps/:id/inquiries', postIdValidator, commerceController.createCampInquiry);

module.exports = router;
