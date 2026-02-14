const mongoose = require('mongoose');
require('dotenv').config();

const UserSchema = new mongoose.Schema({
    username: String,
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    isVerified: Boolean
}, { strict: false });

const MemberSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    memberId: String
}, { strict: false });

const User = mongoose.model('User', UserSchema);
const Member = mongoose.model('Member', MemberSchema);

async function checkDuplicates() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/community_vishwkarma');
        console.log('Connected to DB');

        const users = await User.find({ memberId: { $ne: null } });
        console.log(`Found ${users.length} linked users.`);

        const memberMap = {};
        for (const u of users) {
             if (!u.memberId) {
                console.log(`User ${u.username} has no memberId field in object (but query found it?)`);
                continue;
             }
             const mid = u.memberId.toString();
             if (!memberMap[mid]) memberMap[mid] = [];
             memberMap[mid].push(u.username);
        }

        let foundDuplicates = false;
        for (const [mid, usernames] of Object.entries(memberMap)) {
            if (usernames.length > 1) {
                console.log(`Member ${mid} is linked to multiple users: ${usernames.join(', ')}`);
                const member = await Member.findById(mid);
                if (member) {
                    console.log(`  -> Member Name: ${member.firstName} ${member.lastName} (${member.memberId})`);
                }
                foundDuplicates = true;
            }
        }

        if (!foundDuplicates) {
            console.log('No duplicate inclusions found.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkDuplicates();
