const express = require('express');
const auditController = require('../controllers/auditController');
const { auth } = require('../middlewares/auth');

const router = express.Router();

router.use(auth);

router.post('/sensitive-words/init', auditController.initializeDefaults);
router.get('/sensitive-words', auditController.getSensitiveWords);
router.post('/sensitive-words', auditController.createSensitiveWord);
router.post('/sensitive-words/batch', auditController.batchCreateSensitiveWords);
router.put('/sensitive-words/:id', auditController.updateSensitiveWord);
router.delete('/sensitive-words/:id', auditController.deleteSensitiveWord);
router.post('/sensitive-words/:id/toggle', auditController.toggleSensitiveWord);

router.get('/logs', auditController.getAuditLogs);
router.get('/stats', auditController.getAuditStats);
router.post('/cache/refresh', auditController.refreshCache);

module.exports = router;
