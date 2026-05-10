const express = require('express');
const router = express.Router();
const BoardMember = require('../models/BoardMember');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');
const { upload } = require('../config/cloudinary');

// Get all board members
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        console.log(`[Board API] Fetching board members (Page: ${page}, Limit: ${limit})...`);
        
        const { count, rows: members } = await BoardMember.findAndCountAll({
            order: [['year', 'DESC']],
            limit,
            offset
        });

        console.log(`[Board API] Found ${count} members total`);
        
        res.json({
            data: members,
            totalPages: Math.ceil(count / limit),
            total: count,
            page
        });
    } catch (err) {
        console.error('[Board API] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create board member
router.post('/', verifyToken, checkPermission('board.manage'), upload.single('photo'), async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.file) {
            data.photoUrl = req.file.path;
            data.photoId = req.file.filename;
        }
        data.createdBy = req.user.id;
        const newBoardMember = await BoardMember.create(data);
        res.status(201).json(newBoardMember);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete board member
router.delete('/:id', verifyToken, checkPermission('board.manage'), async (req, res) => {
    try {
        const deleted = await BoardMember.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'Board member not found' });
        res.json({ message: 'Board member deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
