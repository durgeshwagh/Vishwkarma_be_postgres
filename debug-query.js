const { Member, User } = require('./src/models');
const { Op } = require('sequelize');
const sequelize = require('./src/config/database');
require('dotenv').config();

async function run() {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected');

        const where = {
            isPrimary: true,
            [Op.and]: [
                { lifeStatus: 'Alive' }
            ]
        };
        const order = [['fullName', 'ASC']];
        const limit = 12;

        console.log('Where Clause:', JSON.stringify(where));
        console.log('Order:', JSON.stringify(order));

        const start = Date.now();
        const { count, rows: members } = await Member.findAndCountAll({
            where,
            order,
            limit
        });

        console.log('Execution Time:', Date.now() - start, 'ms');
        console.log('Total Count:', count);
        console.log('Fetched Count:', members.length);

        members.slice(0, 5).forEach(m => {
            console.log(`Member: ${m.fullName} (${m.memberId})`);
            console.log('  - contact type:', typeof m.contact);
            console.log('  - contact raw:', m.contact);
            console.log('  - phone:', m.phone);
        });

        // Test User Lookup
        const memberIds = members.map(m => m.memberId);
        
        const startUser = Date.now();
        const users = await User.findAll({ 
            where: { memberId: { [Op.in]: memberIds } },
            attributes: ['memberId'],
            raw: true
        });
        console.log('User Lookup Time:', Date.now() - startUser, 'ms', 'Count:', users.length);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

run();
