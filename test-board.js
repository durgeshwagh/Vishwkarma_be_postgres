const { BoardMember } = require('./src/models');
const sequelize = require('./src/config/database');

async function test() {
    try {
        console.log('Testing BoardMember.findAll()...');
        const members = await BoardMember.findAll({ order: [['year', 'DESC']] });
        console.log(`Success! Found ${members.length} members.`);
        process.exit(0);
    } catch (err) {
        console.error('FAILED:', err);
        process.exit(1);
    }
}

test();
