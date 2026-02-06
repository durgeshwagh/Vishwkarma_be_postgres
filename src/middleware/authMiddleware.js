const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Access Denied: No Token Provided' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        req.user = verified;
        next();
    } catch (err) {
        console.error('Token Verification Failed:', err.message);
        console.log('Received Token:', token);
        res.status(401).json({ message: 'Invalid Token' });
    }
};

const checkPermission = (requiredPermission) => {
    return async (req, res, next) => {
        try {
            // Mock DB Bypass
            if (global.useMockDb) {
                // In mock mode, we trust the token payload or allow access for testing.
                // Since we can't query the DB, we can't get fresh permissions.
                return next();
            }

            // Fetch fresh user data to get latest permissions
            const user = await User.findById(req.user.id);
            if (!user) return res.status(404).json({ message: 'User not found' });

            // SuperAdmin & Admin bypass
            if (user.role === 'SuperAdmin' || user.role === 'Admin') {
                return next();
            }

            if (user.permissions && user.permissions.includes(requiredPermission)) {
                return next();
            } else {
                return res.status(403).json({ message: `Access Denied: Requires permission '${requiredPermission}'` });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    };
};

module.exports = { verifyToken, checkPermission };
