const { User } = require('../src/models');
const bcrypt = require('bcryptjs');
const sequelize = require('../src/config/database');

async function run() {
    try {
        await sequelize.authenticate();
        console.log('PostgreSQL Connected');

        const username = 'durgeshwagh';
        const password = '123456';
        const hashedPassword = await bcrypt.hash(password, 10);

        const [user, created] = await User.findOrCreate({
            where: { username },
            defaults: {
                password: hashedPassword,
                role: 'SuperAdmin',
                isVerified: true,
                isActive: true,
                permissions: [],
                name: 'Durgesh Wagh'
            }
        });

        if (created) {
            console.log(`User ${username} created successfully as SuperAdmin`);
        } else {
            // Update existing user to SuperAdmin
            user.role = 'SuperAdmin';
            user.isVerified = true;
            user.isActive = true;
            user.password = hashedPassword;
            await user.save();
            console.log(`User ${username} already existed, updated to SuperAdmin`);
        }

    } catch (err) {
        console.error('Error creating user:', err);
    } finally {
        await sequelize.close();
    }
}

run();
