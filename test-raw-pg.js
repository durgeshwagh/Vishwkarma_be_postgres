const { Client } = require('pg');
require('dotenv').config({ path: '/home/ubuntu/Community_Vishwkarma_be_postgres/.env' });

async function testRaw() {
    const connectionString = process.env.DATABASE_URL;
    console.log('Testing with connection string (masked):', connectionString.replace(/:[^:]+@/, ':****@'));
    
    const client = new Client({
        connectionString: connectionString,
    });

    try {
        await client.connect();
        console.log('SUCCESS: Raw PG client connected!');
        const res = await client.query('SELECT current_database()');
        console.log('Connected to database:', res.rows[0].current_database);
    } catch (err) {
        console.error('RAW PG ERROR:', err);
    } finally {
        await client.end();
    }
}

testRaw();
