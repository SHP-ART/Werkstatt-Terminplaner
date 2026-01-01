const express = require('express');
const router = express.Router();
const BackupController = require('../controllers/backupController');

router.get('/status', BackupController.status);
router.get('/list', BackupController.list);
router.post('/create', BackupController.create);
router.post('/restore', BackupController.restore);
router.post('/upload', BackupController.upload);
router.post('/delete', BackupController.delete);
router.get('/download/:filename', BackupController.download);

module.exports = router;
