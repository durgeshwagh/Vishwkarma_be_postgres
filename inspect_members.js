const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function listMembers() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/community-app');
        console.log('Connected to MongoDB');
        
        const members = await Member.find().select('firstName lastName memberId familyId father mother spouse').limit(10).lean();
        console.log(JSON.stringify(members, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

listMembers();
