const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Member = require('../models/Member');
const { verifyToken } = require('../middleware/authMiddleware');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and User Management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *         password:
 *           type: string
 *         name:
 *           type: string
 *         email:
 *           type: string
 *         mobile:
 *           type: string
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: User already exists
 */
router.post('/register', async (req, res) => {
    try {
        let { username, password, name, email, mobile } = req.body;
        
        // Trim inputs
        if (username) username = username.trim();
        if (email) email = email.trim();
        if (mobile) mobile = mobile.trim();

        // Check if user exists (Split check for better error message)
        const userByUsername = await User.findOne({ username });
        if (userByUsername) return res.status(400).json({ message: 'Username is already taken' });

        const userByEmail = await User.findOne({ email });
        if (userByEmail) return res.status(400).json({ message: 'Email is already registered' });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            name,
            email,
            mobile,
            role: 'Member',
            isVerified: false // Requires approval
        });

        await newUser.save();
        res.status(201).json({ message: 'User created successfully. Please wait for Super Admin approval.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Verified User (SuperAdmin Only)
router.post('/create-user', verifyToken, async (req, res) => {
    try {
        // Check permissions
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can create users directly.' });
        }

        const { username, password, name, email, mobile, role } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            name,
            email,
            mobile,
            role: role || 'Admin', // Default to Admin since usually used for that
            isVerified: true, // Auto-verified
            permissions: [] // Can be updated later
        });

        await newUser.save();

        // Return without password
        const userObj = newUser.toObject();
        delete userObj.password;

        res.status(201).json({ message: 'User created successfully', user: userObj });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns token
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        console.log('[DEBUG] Login Payload:', JSON.stringify(req.body, null, 2));

        if (username) username = username.trim();

        // Find user - optimized query using indexed fields
        const user = await User.findOne({
            $or: [{ username }, { email: username }]
        }).select('+password'); // Need password for comparison

        if (!user) {
            console.log('[DEBUG] User not found (Login failed)');
            return res.status(404).json({ message: 'User not found' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('[DEBUG] Invalid credentials');
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check Verification
        if (!user.isVerified) {
            return res.status(403).json({ message: 'Account is pending approval from Super Admin.' });
        }

        // Check Active Status
        if (user.isActive === false) {
            return res.status(403).json({ message: 'Account is disabled. Please contact admin.' });
        }

        // Find Linked Member - optimized with lean() and select()
        let linkedMember = null;
            linkedMember = await Member.findOne({
                $or: [
                    { email: user.email },
                    { phone: user.mobile }
                ]
            })
                .select('memberId firstName lastName email phone photoUrl')
                .lean(); // Faster read-only query

        // Special Case: Family ID Login
        if (!linkedMember && user.username.startsWith('F')) {
            linkedMember = await Member.findOne({
                familyId: user.username,
                gender: 'Male',
                maritalStatus: 'Married'
            })
                .select('memberId firstName lastName email phone photoUrl')
                .lean();

            if (!linkedMember) {
                linkedMember = await Member.findOne({ familyId: user.username })
                    .select('memberId firstName lastName email phone photoUrl')
                    .lean();
            }
        }

        // If still not found, use memberId from user record if set
        if (!linkedMember && user.memberId) {
            linkedMember = await Member.findOne({
                $or: [
                    { _id: user.memberId },
                    { memberId: user.memberId }
                ]
            }).select('memberId firstName lastName email phone photoUrl').lean();
        }

        // Determine display name with fallback logic
        const displayName = user.name ||
            (linkedMember ? `${linkedMember.firstName} ${linkedMember.lastName}`.trim() : null) ||
            user.username;

        // Generate Token - include memberId if linked
        const tokenMemberId = linkedMember ? linkedMember.memberId : user.memberId;

        const token = jwt.sign(
            { id: user._id, role: user.role, name: displayName, memberId: tokenMemberId },
            process.env.JWT_SECRET || 'secretKey',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                name: displayName, // Always populated with fallback
                role: user.role,
                email: user.email,
                permissions: user.permissions,
                memberId: linkedMember ? linkedMember._id : user.memberId,
                photoUrl: linkedMember ? linkedMember.photoUrl : null,
                memberDetails: linkedMember ? {
                    id: linkedMember._id,
                    memberId: linkedMember.memberId,
                    firstName: linkedMember.firstName,
                    lastName: linkedMember.lastName,
                    photoUrl: linkedMember.photoUrl
                } : null
            }
        });
    } catch (err) {
        console.error('[DEBUG] Login Error Stack:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/request-otp:
 *   post:
 *     summary: Request OTP for mobile verification
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mobile:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent
 */
router.post('/request-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const user = await User.findOne({ mobile });

        if (!user) return res.status(404).json({ message: 'User not found with this mobile number' });
        if (!user.isVerified) return res.status(403).json({ message: 'Account pending approval' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to DB (expires in 10 mins)
        user.otp = otp;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        // In production, send via SMS Gateway
        console.log(`OTP for ${mobile}: ${otp}`); // For Demo/Testing

        res.json({ message: 'OTP sent to your mobile number', debug_otp: otp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mobile:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verified and logged in
 */
router.post('/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;

        // Re-fetch with secrets to verify OTP
        let user = await User.findOne({ mobile }).select('+otp +otpExpires');

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.otp || user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'OTP Expired' });
        }

        // Clear OTP
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        let linkedMember = await Member.findOne({
            $or: [
                { email: user.email },
                { phone: user.mobile }
            ]
        })
            .select('memberId firstName lastName email phone photoUrl')
            .lean();

        // Determine display name with fallback logic
        const displayName = user.name ||
            (linkedMember ? `${linkedMember.firstName} ${linkedMember.lastName}`.trim() : null) ||
            user.username;

        // Generate Token
        const token = jwt.sign(
            { id: user._id, role: user.role, name: displayName, memberId: linkedMember?.memberId || user.memberId },
            process.env.JWT_SECRET || 'secretKey',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                name: displayName, // Always populated with fallback
                role: user.role,
                email: user.email,
                permissions: user.permissions,
                memberId: linkedMember ? linkedMember._id : null,
                photoUrl: linkedMember ? linkedMember.photoUrl : null,
                memberDetails: linkedMember ? {
                    id: linkedMember._id,
                    memberId: linkedMember.memberId,
                    firstName: linkedMember.firstName,
                    lastName: linkedMember.lastName,
                    photoUrl: linkedMember.photoUrl
                } : null
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change current user password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid current password or weak new password
 */
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id; // From token

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters long' });
        }

        const user = await User.findById(userId).select('+password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get current logged in user profile
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user profile
 */
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        // Fetch linked member for photoUrl
        let photoUrl = null;
        if (user.memberId) {
            const member = await Member.findById(user.memberId).select('photoUrl').lean();
            if (member) photoUrl = member.photoUrl;
        } else if (user.email || user.mobile) {
            const member = await Member.findOne({
                $or: [{ email: user.email }, { phone: user.mobile }]
            }).select('photoUrl').lean();
            if (member) photoUrl = member.photoUrl;
        }

        // Return similar structure to login
        res.json({
            id: user._id,
            username: user.username,
            name: user.name || user.username,
            role: user.role,
            email: user.email,
            permissions: user.permissions,
            memberId: user.memberId,
            photoUrl: photoUrl
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get Pending Users
router.get('/pending-users', async (req, res) => {
    try {
        // Simple auth middleware check (in production separate this)
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        if (!['SuperAdmin', 'Admin'].includes(decoded.role)) return res.status(403).json({ message: 'Access Denied' });

        const users = await User.find({ isVerified: false }).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Approve User
router.put('/approve-user/:id', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        if (!['SuperAdmin', 'Admin'].includes(decoded.role)) return res.status(403).json({ message: 'Access Denied' });

        const { id } = req.params;
        const { role, permissions, memberId } = req.body;

        const user = await User.findByIdAndUpdate(
            id,
            { isVerified: true, role: role || 'Member', permissions: permissions || [], memberId },
            { new: true }
        ).select('-password');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User User approved successfully', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Get All Users (Filtered by Role)
router.get('/users', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }

        let query = {};

        // Admin: See only users created by them OR all users? 
        // Requirement: "Admin can see: Only users created by them"
        /*
        if (requesterRole === 'Admin') {
            query.createdBy = requesterId;
        }
        */

        const users = await User.find(query).select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle User Status (Enable/Disable)
router.put('/users/:id/status', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }

        const { id } = req.params;
        const { isActive } = req.body;

        // If Admin, ensure they own the user
        if (req.user.role === 'Admin') {
            const targetUser = await User.findById(id);
            if (!targetUser || targetUser.createdBy?.toString() !== req.user.id) {
                return res.status(403).json({ message: 'You can only modify your own users' });
            }
        }

        const user = await User.findByIdAndUpdate(id, { isActive }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: `User ${isActive ? 'enabled' : 'disabled'}`, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Update Permissions
router.put('/users/:id/permissions', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }
        const { id } = req.params;
        const { permissions, role, memberId } = req.body;

        const updateData = {};
        if (permissions) updateData.permissions = permissions;
        if (role) updateData.role = role;
        if (memberId !== undefined) updateData.memberId = memberId; // Allow linking/unlinking

        const user = await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'Permissions and details updated', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Reset Password
router.put('/users/:id/reset-password', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.findByIdAndUpdate(id, { password: hashedPassword }, { new: true }).select('-password');

        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Delete User
router.delete('/users/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }

        const { id } = req.params;

        // Prevent Self-Deletion
        if (req.user.id === id) {
            return res.status(400).json({ message: 'You cannot delete yourself.' });
        }

        const user = await User.findByIdAndDelete(id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({ message: 'User deleted successfully', userId: id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Bulk Delete Users
router.post('/users/bulk-delete', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'SuperAdmin') {
            return res.status(403).json({ message: 'Access Denied: Only SuperAdmin can delete users.' });
        }

        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ message: 'No users selected for deletion' });
        }

        // Prevent Self-Deletion in Bulk
        if (ids.includes(req.user.id)) {
            return res.status(400).json({ message: 'You cannot delete yourself in a bulk action.' });
        }

        // If Admin (not SuperAdmin), ensure they only delete users they created (Optional, depending on policy)
        // For now, assuming Admin has full delete rights over Members as per 'delete user' endpoint logic check
        // The single delete check is: if (req.user.role === 'Admin' && req.user.id === id) -> Prevent self
        // It didn't enforce createdBy check in the single delete route I saw earlier (lines 638-658) 
        // Wait, line 640 checks role. Line 647 checks self.
        // It DOES NOT check createdBy on line 638. Wait, strict check was on status update?
        // Let's re-read the single delete route in previous context...
        // Ah, status update (line 564) had strict check: "if (req.user.role === 'Admin') ... targetUser.createdBy !== req.user.id"
        // But delete (line 638) did NOT have that check in the file I read.
        // So I will stick to the same pattern as single delete: Allow if not self.

        const result = await User.deleteMany({ _id: { $in: ids } });

        res.json({ 
            message: `${result.deletedCount} users deleted successfully`, 
            deletedCount: result.deletedCount,
            ids 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
