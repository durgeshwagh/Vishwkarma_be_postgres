const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Member } = require('../models');
const { verifyToken } = require('../middleware/authMiddleware');
const { publicKey, decrypt } = require('../utils/encryption');
const { Op } = require('sequelize');

const router = express.Router();

async function findMemberSafely(idOrMId) {
    if (!idOrMId) return null;
    const mid = String(idOrMId);
    
    // 1. Try finding by memberId
    let member = await Member.findOne({ where: { memberId: mid } });
    if (member) return member.toJSON();
    
    // 2. Try finding by UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(mid)) {
        member = await Member.findByPk(mid);
    }
    return member ? member.toJSON() : null;
}

// User Registration
router.post('/register', async (req, res) => {
    try {
        let { username, password, name, email, mobile } = req.body;
        const existing = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
        if (existing) return res.status(400).json({ message: 'Username or Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username, password: hashedPassword, name, email, mobile,
            role: 'Member', isVerified: false
        });
        res.status(201).json({ message: 'Registration successful. Pending admin approval.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        let { username, password, isEncrypted } = req.body;
        if (isEncrypted && password) {
            password = decrypt(password);
            if (!password) return res.status(400).json({ message: 'Decryption failed' });
        }

        let user = await User.findOne({ where: { [Op.or]: [{ username }, { email: username }] } });
        if (!user) {
            const memberAlias = await findMemberSafely(username);
            if (memberAlias) user = await User.findOne({ where: { memberId: memberAlias.id } });
        }

        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ message: 'Invalid credentials' });
        if (!user.isVerified) return res.status(403).json({ message: 'Account pending approval' });
        if (user.isActive === false) return res.status(403).json({ message: 'Account disabled' });

        const linkedMember = await findMemberSafely(user.memberId);
        const displayName = user.name || (linkedMember ? `${linkedMember.firstName} ${linkedMember.lastName}` : user.username);

        const token = jwt.sign(
            { id: user.id, role: user.role, name: displayName, memberId: linkedMember?.memberId || user.memberId },
            process.env.JWT_SECRET || 'secretKey', { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user.id, username: user.username, name: displayName, role: user.role,
                permissions: user.permissions, memberDetails: linkedMember
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Request OTP
router.post('/request-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ where: { mobile } });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.isVerified) return res.status(403).json({ message: 'Account pending approval' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        console.log(`OTP for ${mobile}: ${otp}`);
        res.json({ message: 'OTP sent', debug_otp: otp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const user = await User.findOne({ where: { mobile } });
        if (!user || user.otp !== otp || user.otpExpires < new Date()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.otp = null;
        user.otpExpires = null;
        await user.save();

        const linkedMember = await findMemberSafely(user.memberId);
        const displayName = user.name || (linkedMember ? `${linkedMember.firstName} ${linkedMember.lastName}` : user.username);

        const token = jwt.sign(
            { id: user.id, role: user.role, name: displayName, memberId: linkedMember?.memberId || user.memberId },
            process.env.JWT_SECRET || 'secretKey', { expiresIn: '8h' }
        );

        res.json({ token, user: { id: user.id, username: user.username, name: displayName, role: user.role, memberDetails: linkedMember } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findByPk(req.user.id);
        if (!user || !await bcrypt.compare(currentPassword, user.password)) {
            return res.status(400).json({ message: 'Invalid current password' });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, { include: [{ model: Member, as: 'memberDetails' }] });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const resObj = user.toJSON();
        return res.json({
            id: resObj.id,
            username: resObj.username,
            name: resObj.name || resObj.username,
            role: resObj.role,
            email: resObj.email,
            permissions: resObj.permissions,
            memberId: resObj.memberId,
            familyId: resObj.memberDetails?.familyId || null,
            photoUrl: resObj.memberDetails?.photoUrl || null,
            memberDetails: resObj.memberDetails
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
