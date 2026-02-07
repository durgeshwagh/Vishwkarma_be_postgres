const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'community_app_uploads',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'mov', 'avi'],
  },
});

const upload = multer({ 
  storage: storage,
  limits: { fieldSize: 25 * 1024 * 1024 } // 25MB for JSON payload
});

const uploadBase64 = async (base64String) => {
    try {
        if (!base64String) return null;
        
        // Ensure string is trimmed
        const cleanBase64 = base64String.trim();
        
        if (!cleanBase64.startsWith('data:')) return null;
        
        const result = await cloudinary.uploader.upload(cleanBase64, {
            folder: 'community_app_uploads',
            resource_type: 'auto'
        });
        
        return {
            url: result.path || result.secure_url,
            public_id: result.public_id
        };
    } catch (error) {
        console.error('Cloudinary Base64 Upload Error:', error);
        throw error;
    }
};

module.exports = { cloudinary, upload, uploadBase64 };
