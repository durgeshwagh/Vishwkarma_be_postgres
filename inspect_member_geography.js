const mongoose = require('mongoose');
require('dotenv').config();
const Member = require('./src/models/Member');

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Fetch a few members to see their structure
        const members = await Member.find({}).limit(5).lean();

        console.log('--- Random 5 Members Geography Check ---');
        members.forEach(m => {
            console.log(`\nName: ${m.firstName} ${m.lastName}`);
            console.log(`MemberID: ${m.memberId}`);
            console.log(`Root Fields -> State: '${m.state}', District: '${m.district}', City/Taluka: '${m.city}' / '${m.taluka}', Village: '${m.village}'`);
            console.log(`Geo Fields ->`, m.geography);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
