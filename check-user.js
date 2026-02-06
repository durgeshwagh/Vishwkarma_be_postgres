const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const checkUser = async () => {
    try {
        console.log('URI:', process.env.MONGO_URI ? process.env.MONGO_URI.split('@')[1] : 'Localhost'); 
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/vishwkarma');
        console.log('Connected to MongoDB');

        const user = await User.findOne({ username: 'durgeshwagh' });

        if (!user) {
            console.log('User not found!');
            return;
        }

        console.log('\n=== USER DATA ===');
        console.log('Username:', user.username);
        console.log('Role:', user.role);
        console.log('MemberID:', user.memberId);

        if (user.memberId) {
            // Find the Member
            // Define minimal Schema to avoid loading full model
            const MemberSchema = new mongoose.Schema({}, { strict: false });
            const Member = mongoose.members || mongoose.model('Member', MemberSchema);

            const member = await Member.findById(user.memberId);
            
            if (member) {
                console.log('\n=== LINKED MEMBER ===');
                console.log('Name:', member.firstName, member.lastName);
                console.log('Family ID:', member.familyId);

                if (member.familyId) {
                     // Handle object/string familyId
                     const fId = (member.familyId._id) ? member.familyId._id : member.familyId;
                     
                     const familyMembers = await Member.find({ familyId: fId });
                     console.log('\n=== FAMILY MEMBERS (' + familyMembers.length + ') ===');
                     familyMembers.forEach(m => {
                         console.log(`- ${m.firstName} ${m.lastName} (${m.maritalStatus || 'N/A'})`);
                     });
                }
            } else {
                console.log('\n[!] Member record not found for ID:', user.memberId);
            }
        }


        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err.message);
    }
    process.exit(0);
};

checkUser();
