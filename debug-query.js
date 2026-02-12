
const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const query = {
            isPrimary: true,
            $and: [
                { lifeStatus: 'Alive' }
            ]
        };
        const sort = { fullName: 1 };
        const limit = 12;

        console.log('Query:', JSON.stringify(query));
        console.log('Sort:', JSON.stringify(sort));

        const executionStats = await Member.find(query)
            .sort(sort)
            .limit(limit)
            .explain('executionStats');

        console.log('Execution Stats Find:', JSON.stringify(executionStats.executionStats.executionTimeMillis, null, 2));

        const countStats = await Member.find(query)
            .explain('executionStats'); // countDocuments doesn't support explain directly in mongoose easily, used find without limit to simulate count scan/ or use native
        
        console.log('Execution Stats Count (Simulated):', JSON.stringify(countStats.executionStats, null, 2));

        const start = Date.now();
        const count = await Member.countDocuments(query);
        console.log('Count:', count, 'Time:', Date.now() - start, 'ms');

        // Test User Lookup
        const members = await Member.find(query).sort(sort).limit(limit).lean();
        const memberIds = members.map(m => m.memberId);
        
        const User = require('./src/models/User');
        const startUser = Date.now();
        const users = await User.find({ memberId: { $in: memberIds } }).select('memberId').lean();
        console.log('User Lookup Time:', Date.now() - startUser, 'ms', 'Count:', users.length);



    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
