const mongoose = require('mongoose');
const connStr = 'mongodb://127.0.0.1:27017/community_app_db';
mongoose.connect(connStr).then(async () => {
    const Member = mongoose.model('Member', new mongoose.Schema({
        firstName: String,
        lastName: String,
        memberId: String
    }));
    
    const members = await Member.find({}).sort({createdAt: -1}).limit(5).lean();
    console.log('Last 5 members:', JSON.stringify(members, null, 2));
    
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
