
const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Simulate the slow query
        const query = { isPrimary: true, lifeStatus: 'Alive' };
        const sort = { fullName: 1 };
        const limit = 12;

        console.log(`Running query: ${JSON.stringify(query)} with sort ${JSON.stringify(sort)} and limit ${limit}`);

        const members = await Member.find(query).sort(sort).limit(limit).lean();
        
        console.log(`Fetched ${members.length} members.`);

        let maxDocSize = 0;
        let maxDocId = '';
        let totalSize = 0;

        members.forEach(m => {
            const json = JSON.stringify(m);
            const size = json.length;
            totalSize += size;
            if (size > maxDocSize) {
                maxDocSize = size;
                maxDocId = m.memberId || m._id;
            }
            if (size > 10000) { // Log docs > 10KB
                console.log(`Large Doc (${m.memberId}): ${(size/1024).toFixed(2)} KB`);
                // Check fields of this large doc
                for (const [k, v] of Object.entries(m)) {
                    const fSize = JSON.stringify(v).length;
                    if (fSize > 1000) {
                         console.log(`  - Field ${k}: ${(fSize/1024).toFixed(2)} KB`);
                    }
                }
            }
        });

        console.log('----------------------------------');
        console.log(`Total Payload Size: ${(totalSize / 1024).toFixed(2)} KB`);
        console.log(`Largest Document: ${(maxDocSize / 1024).toFixed(2)} KB (ID: ${maxDocId})`);


    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
