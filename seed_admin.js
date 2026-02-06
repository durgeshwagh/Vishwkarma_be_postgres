
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/community_app_db';

const seedAdmin = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const username = 'durgeshwagh';
        const passwordRaw = 'Durgesh@123'; // Optional: Reset password if needed, or keep existing if only promoting
        // const hashedPassword = await bcrypt.hash(passwordRaw, 10);

        // Check if exists
        const exists = await User.findOne({ username });
        if (exists) {
            console.log(`User ${username} found. Promoting to SuperAdmin...`);
            // exists.password = hashedPassword; // Uncomment to reset password
            exists.role = 'SuperAdmin';
            exists.isVerified = true;
            exists.permissions = ['create', 'read', 'update', 'delete', 'verify_users', 'manage_funds', 'manage_notices'];
            await exists.save();
            console.log(`User ${username} successfully promoted to SuperAdmin.`);
        } else {
            console.log(`User ${username} NOT found. Please register first or check spelling.`);
        }

    } catch (e) {
        console.error('Error seeding admin:', e);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected');
    }
};

seedAdmin();
