const express = require('express');
const router = express.Router();
const Notice = require('../models/Notice');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

// Get all notices
router.get('/', verifyToken, async (req, res) => {
    try {
        const notices = await Notice.findAll({ order: [['createdAt', 'DESC']] });
        res.json(notices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a notice
router.post('/', verifyToken, checkPermission('notice.manage'), upload.single('file'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.file) {
            data.fileUrl = req.file.path;
            data.fileId = req.file.filename;
        }
        data.createdBy = req.user.id;
        const newNotice = await Notice.create(data);
        res.status(201).json(newNotice);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a notice
router.delete('/:id', verifyToken, checkPermission('notice.manage'), async (req, res) => {
    try {
        const deleted = await Notice.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'Notice not found' });
        res.json({ message: 'Notice deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
