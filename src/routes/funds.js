const express = require('express');
const router = express.Router();
const Fund = require('../models/Fund');
const cacheService = require('../services/cache.service');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get all funds
router.get('/', async (req, res) => {
    try {
        const funds = await Fund.findAll({ order: [['date', 'DESC']] });
        res.json(funds);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new fund entry
router.post('/', verifyToken, checkPermission('funds.manage'), async (req, res) => {
    try {
        const { memberId, amount, type, date, description } = req.body;
        const newFund = await Fund.create({
            memberId,
            amount,
            type,
            date,
            description,
            createdBy: req.user.id
        });
        cacheService.invalidateDashboard();
        res.status(201).json(newFund);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a fund entry
router.delete('/:id', verifyToken, checkPermission('funds.delete'), async (req, res) => {
    try {
        const deleted = await Fund.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'Fund not found' });
        cacheService.invalidateDashboard();
        res.json({ message: 'Fund deleted successfully', id: req.params.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
