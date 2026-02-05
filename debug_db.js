const mongoose = require('mongoose');
const connStr = 'mongodb://127.0.0.1:27017/community_app_db';
mongoose.connect(connStr).then(async () => {
    const Member = mongoose.model('Member', new mongoose.Schema({
        firstName: String,
        lastName: String,
        dob: Date,
        geography: Object,
        spouse: mongoose.Schema.Types.ObjectId,
        spouseId: mongoose.Schema.Types.ObjectId,
        memberId: String
    }));
    
    console.log('Searching for TestMember...');
    // Find TestMember
    const primary = await Member.findOne({ firstName: 'TestMember' }).lean();
    console.log('Primary Member:', JSON.stringify(primary, null, 2));
    
    if (primary && (primary.spouse || primary.spouseId)) {
        const sid = primary.spouse || primary.spouseId;
        console.log('Found spouse ID on primary:', sid);
        const spouse = await Member.findById(sid).lean();
        console.log('Spouse Member Record:', JSON.stringify(spouse, null, 2));
    } else {
        console.log('No spouse ref found on primary');
    }
    
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
