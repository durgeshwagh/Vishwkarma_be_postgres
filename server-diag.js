const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

console.log('=== SERVER DIAGNOSTICS ===');
console.log('Time:', new Date().toISOString());
console.log('Node Version:', process.version);
console.log('MONGO_URI Present:', !!process.env.MONGO_URI);
if (process.env.MONGO_URI) {
    const parts = process.env.MONGO_URI.split('@');
    console.log('MONGO_URI Host:', parts.length > 1 ? parts[1].split('/')[0] : 'Localhost');
    console.log('MONGO_URI DB:', parts.length > 1 ? parts[1].split('/')[1]?.split('?')[0] : 'Unknown');
}
console.log('JWT_SECRET Present:', !!process.env.JWT_SECRET);

async function run() {
    try {
        console.log('\nConnecting to DB...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vishwkarma');
        console.log('Connected!');

        console.log('\nFetching durgeshwagh...');
        const user = await User.findOne({ username: 'durgeshwagh' });
        if (user) {
            console.log('User Found. Role:', user.role);
            console.log('MemberID:', user.memberId);
        } else {
            console.log('User NOT found!');
        }
        
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await mongoose.connection.close();
    }
}

run();
