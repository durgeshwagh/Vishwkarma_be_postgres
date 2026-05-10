const express = require('express');
const router = express.Router();
const Donation = require('../models/Donation');
const { verifyToken, checkPermission } = require('../middleware/authMiddleware');

// Get All Donations
router.get('/', async (req, res) => {
    try {
        const donations = await Donation.findAll({ order: [['date', 'DESC']] });
        res.json(donations);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add Donation
router.post('/', verifyToken, async (req, res) => {
    try {
        const newDonation = await Donation.create(req.body);
        res.status(201).json(newDonation);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Donation
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const deleted = await Donation.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'Donation not found' });
        res.json({ message: 'Donation deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
