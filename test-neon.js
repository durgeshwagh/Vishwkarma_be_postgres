const sequelize = require('./src/config/database');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('Attempting to connect to Neon...');
        console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined (hidden for privacy)' : 'UNDEFINED');
        
        await sequelize.authenticate();
        console.log('SUCCESS: Connection has been established successfully.');
        
        // Sync models to create tables if they don't exist
        console.log('Attempting to sync models...');
        await sequelize.sync({ alter: true });
        console.log('SUCCESS: All models were synchronized successfully.');

    } catch (error) {
        console.error('FAILURE: Unable to connect to the database:', error);
    } finally {
        await sequelize.close();
    }
}

testConnection();
