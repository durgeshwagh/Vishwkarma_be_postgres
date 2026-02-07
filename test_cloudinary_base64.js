require('dotenv').config();
const { uploadBase64 } = require('./src/config/cloudinary');

const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKwAEQAAAABJRU5ErkJggg==';

async function testUpload() {
    try {
        console.log('Attempting to upload Base64 image...');
        const result = await uploadBase64(base64Image);
        console.log('Upload Result:', result);
        if (result && result.url && result.public_id) {
            console.log('SUCCESS: Base64 Upload works.');
        } else {
            console.error('FAILURE: Upload returned null or missing fields.');
        }
    } catch (error) {
        console.error('ERROR during upload:', error);
    }
}

testUpload();
