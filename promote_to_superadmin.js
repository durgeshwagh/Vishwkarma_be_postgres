const mongoose = require('mongoose');
const User = require('./src/models/User'); // Adjust path as needed
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/community_app'; 

const promoteUser = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const username = 'durgeshwagh'; // The user to promote
        const user = await User.findOne({ username });

        if (!user) {
            console.log(`User '${username}' not found.`);
            process.exit(1);
        }

        console.log(`Current role for ${username}: ${user.role}`);

        if (user.role === 'SuperAdmin') {
            console.log('User is already SuperAdmin.');
        } else {
            user.role = 'SuperAdmin';
            await user.save();
            console.log(`Successfully promoted ${username} to SuperAdmin.`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error promoting user:', error);
        process.exit(1);
    }
};

promoteUser();
