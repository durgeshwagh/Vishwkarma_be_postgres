const fs = require('fs');
const path = require('path');

const publicKeyPath = path.join(__dirname, '..', 'src', 'config', 'rsa_public.pem');
const privateKeyPath = path.join(__dirname, '..', 'src', 'config', 'rsa_private.pem');

try {
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

    console.log('='.repeat(80));
    console.log('Copy these values to Vercel Environment Variables:');
    console.log('='.repeat(80));
    console.log('\n📋 RSA_PUBLIC_KEY:');
    console.log(publicKey.replace(/\n/g, '\\n'));
    console.log('\n📋 RSA_PRIVATE_KEY:');
    console.log(privateKey.replace(/\n/g, '\\n'));
    console.log('\n' + '='.repeat(80));
    console.log('Instructions:');
    console.log('1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables');
    console.log('2. Add RSA_PUBLIC_KEY with the value above (including \\n)');
    console.log('3. Add RSA_PRIVATE_KEY with the value above (including \\n)');
    console.log('4. Set scope to Production, Preview, and Development');
    console.log('5. Redeploy your application');
    console.log('='.repeat(80));
} catch (err) {
    console.error('Error reading key files:', err.message);
    console.log('\nPlease run the backend server first to generate keys:');
    console.log('  npm start');
}
