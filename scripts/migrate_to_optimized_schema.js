const mongoose = require('mongoose');
require('dotenv').config();

// Define Old Schema for reading
const OldMemberSchema = new mongoose.Schema({}, { strict: false, collection: 'members' });
const Member = mongoose.model('MemberMigration', OldMemberSchema);

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/community_vishwkarma');
        console.log('Connected to MongoDB');

        const members = await Member.find({});
        console.log(`Found ${members.length} members to migrate.`);

        let count = 0;
        for (const member of members) {
            const updates = {};

            // 1. Flatten personal_info -> root
            if (member.personal_info) {
                const names = member.personal_info.names || {};
                if (!member.firstName) updates.firstName = names.first_name;
                if (!member.middleName) updates.middleName = names.middle_name;
                if (!member.lastName) updates.lastName = names.last_name;
                if (!member.prefix) updates.prefix = names.prefix;
                if (!member.maidenName) updates.maidenName = names.maiden_name;
                if (!member.gender) updates.gender = member.personal_info.gender;
                if (!member.dob) updates.dob = member.personal_info.dob;
                if (!member.lifeStatus) updates.lifeStatus = member.personal_info.life_status;
                if (member.personal_info.showOnMatrimony !== undefined) updates.showOnMatrimony = member.personal_info.showOnMatrimony;

                if (member.personal_info.biodata) {
                    const bio = member.personal_info.biodata;
                    if (!member.education) updates.education = bio.education;
                    if (!member.occupation) updates.occupation = bio.occupation;
                    if (!member.height) updates.height = bio.height;

                    if (bio.contact) {
                        updates.contact = {
                            mobile: bio.contact.mobile,
                            email: bio.contact.email,
                            whatsapp: bio.contact.whatsapp
                        };
                    }
                }
            }

            // 2. Map Geography
            if (member.geography) {
                updates.geography = member.geography;
                updates.city = member.geography.taluka || member.geography.city || member.city;
                updates.village = member.geography.village || member.village;
            }

            // 3. Map Relationships (Legacy IDs to new fields)
            if (member.fatherId && !member.father) updates.father = member.fatherId;
            if (member.motherId && !member.mother) updates.mother = member.motherId;
            if (member.spouseId && !member.spouse) updates.spouse = member.spouseId;

            // 4. Calculate Full Name if missing
            if (!member.fullName || member.fullName.includes('undefined')) {
                const f = updates.firstName || member.firstName || '';
                const m = updates.middleName || member.middleName || '';
                const l = updates.lastName || member.lastName || '';
                const p = updates.prefix || member.prefix || '';
                updates.fullName = `${p ? p + ' ' : ''}${f} ${m ? m + ' ' : ''}${l}`.replace(/\s+/g, ' ').trim();
            }

            if (Object.keys(updates).length > 0) {
                await Member.updateOne({ _id: member._id }, { $set: updates });
                count++;
            }
        }

        console.log(`Migration completed. Updated ${count} members.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
