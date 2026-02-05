const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function checkFamilyIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/community-app');
        console.log('Connected to MongoDB');

        // Find families with more than 1 member
        const families = await Member.aggregate([
            {
                $group: {
                    _id: "$familyId",
                    count: { $sum: 1 },
                    members: { $push: { name: "$firstName", id: "$memberId" } }
                }
            },
            { $match: { count: { $gt: 1 } } },
            { $limit: 5 }
        ]);

        console.log('Found families:', JSON.stringify(families, null, 2));

        // Find members without familyId
        const noFamily = await Member.countDocuments({ familyId: { $exists: false } });
        console.log('Members without familyId:', noFamily);
        
        const nullFamily = await Member.countDocuments({ familyId: null });
        console.log('Members with null familyId:', nullFamily);
        
        const emptyFamily = await Member.countDocuments({ familyId: '' });
        console.log('Members with empty string familyId:', emptyFamily);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkFamilyIds();
