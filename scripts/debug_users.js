const mongoose = require('mongoose');
require('dotenv').config();

const UserSchema = new mongoose.Schema({}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function checkUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/community_vishwkarma');
        console.log('Connected to DB');

        const users = await User.find({});
        console.log(`Found ${users.length} users.`);
        users.forEach(u => {
            console.log(`- ${u.username} (Role: ${u.role}) MemberID: ${u.memberId} (${typeof u.memberId})`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
