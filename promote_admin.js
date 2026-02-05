const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const searchName = "durgesh"; 
        // Searching for similarly named users
        const users = await User.find({
            $or: [
                { name: { $regex: searchName, $options: 'i' } },
                { username: { $regex: searchName, $options: 'i' } }
            ]
        });

        if (users.length === 0) {
            console.log('No users found matching "durgesh"');
            return;
        }

        for (const u of users) {
            const name = u.name || '';
            console.log(`- ${name} (Username: ${u.username}, Role: ${u.role}, ID: ${u._id})`);
            
            // Promote if username matches 'durgeshwagh' specifically OR name matches
            if (u.username === 'durgeshwagh' || (name.toLowerCase().includes('durgesh') && (name.toLowerCase().includes('agh') || name.toLowerCase().includes('wagh')))) {
                if (u.role === 'SuperAdmin') {
                    console.log(`User ${u.username} is ALREADY SuperAdmin.`);
                } else {
                    console.log(`Promoting ${u.username} to SuperAdmin...`);
                    u.role = 'SuperAdmin';
                    await u.save();
                    console.log('SUCCESS: Role updated to SuperAdmin');
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
