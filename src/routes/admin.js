const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyToken } = require('../middleware/authMiddleware');
const PERMISSIONS = require('../config/permissions');
const { Op } = require('sequelize');

const verifyAdmin = async (req, res, next) => {
    if (!req.user || !['Admin', 'SuperAdmin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Access Denied: Admins Only' });
    }
    next();
};

// Get all users
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { username: { [Op.iLike]: `%${search}%` } },
                { memberId: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const status = req.query.status ? req.query.status.trim() : '';
        if (status === 'pending') {
            where.isVerified = false;
        } else if (status === 'verified') {
            where.isVerified = true;
        }

        const { count, rows } = await User.findAndCountAll({
            where,
            attributes: { exclude: ['password', 'otp', 'otpExpires'] },
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        res.json({
            users: rows,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            totalUsers: count
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle user approval
router.put('/users/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.isVerified = !user.isVerified;
        await user.save();
        res.json({ message: `User ${user.isVerified ? 'Approved' : 'Unapproved'} successfully`, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Role
router.put('/users/:id/role', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.role = role;
        await user.save();
        res.json({ message: 'Role updated successfully', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update Permissions
router.put('/users/:id/permissions', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await user.update(req.body);
        res.json({ message: 'Permissions updated', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Permissions Config
router.get('/config/permissions', verifyToken, verifyAdmin, (req, res) => {
    res.json(PERMISSIONS);
});

// Delete User
router.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (req.user.id === req.params.id) return res.status(400).json({ message: 'Cannot delete yourself' });
        const deleted = await User.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ message: 'User not found' });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
