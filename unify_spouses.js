const mongoose = require('mongoose');
const Member = require('./src/models/Member');
require('dotenv').config();

async function unifySpouses() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Find all married couples
        const members = await Member.find({ 
            maritalStatus: 'Married',
            spouse: { $exists: true, $ne: null }
        }).select('_id firstName lastName gender familyId spouse');

        console.log(`Found ${members.length} married members`);

        const memberMap = new Map();
        members.forEach(m => memberMap.set(m._id.toString(), m));

        let updatedCount = 0;

        for (const m of members) {
            if (m.gender === 'Male' && m.spouse) {
                const spouseId = m.spouse.toString();
                const spouse = memberMap.get(spouseId);

                if (spouse && m.familyId && spouse.familyId !== m.familyId) {
                    console.log(`Mismatch: ${m.firstName} (${m.familyId}) vs Spouse ${spouse.firstName} (${spouse.familyId})`);
                    
                    // Move Spouse to Husband's Family
                    // (Assuming Patrilocal or Head of Household Logic)
                    if (m.familyId !== 'Unassigned' && m.familyId !== 'FNew') {
                        await Member.updateOne({ _id: spouse._id }, { $set: { familyId: m.familyId } });
                        console.log(`  -> Moving ${spouse.firstName} to ${m.familyId}`);
                        updatedCount++;
                    }
                }
            }
        }

        console.log(`Updated ${updatedCount} spouses`);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

unifySpouses();
