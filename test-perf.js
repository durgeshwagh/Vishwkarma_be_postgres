
const http = require('http');

function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve({ body, headers: res.headers, statusCode: res.statusCode }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function testPerformance() {
    try {
        // 1. Login
        const loginData = JSON.stringify({ username: "jitubagul", password: "Nishant@2006" });
        const loginOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': loginData.length
            }
        };

        console.time('Login');
        const loginRes = await makeRequest(loginOptions, loginData);
        console.timeEnd('Login');

        if (loginRes.statusCode !== 200) {
            console.error('Login failed:', loginRes.body);
            return;
        }

        const token = JSON.parse(loginRes.body).token;
        console.log('Got token:', token ? 'Yes' : 'No');

        // 2. Fetch Primary Members (Default Sort)
        const fetchOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/members?page=1&limit=12&isPrimary=true&sortBy=createdAt&sortOrder=desc',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };

        console.time('FetchPrimary');
        const fetchRes = await makeRequest(fetchOptions);
        console.timeEnd('FetchPrimary');
        console.log('Status:', fetchRes.statusCode);

         // 3. Fetch Primary Members (Name Sort - potentially slower)
         const fetchValues = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/members?page=1&limit=12&isPrimary=true&sortBy=fullName&sortOrder=asc',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        };

        console.time('FetchPrimaryName');
        const fetchResName = await makeRequest(fetchValues);
        console.timeEnd('FetchPrimaryName');
        console.log('Status Name:', fetchResName.statusCode);
        console.log('Body Size Name:', fetchResName.body.length);

    } catch (err) {
        console.error('Error:', err);
    }
}

testPerformance();
