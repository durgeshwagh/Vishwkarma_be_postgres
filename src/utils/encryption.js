const NodeRSA = require('node-rsa');
const fs = require('fs');
const path = require('path');

// Path to store RSA keys
const KEYS_DIR = path.join(__dirname, '..', 'config');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'rsa_public.pem');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'rsa_private.pem');

let key;
let publicKey;
let privateKey;

/**
 * Load or generate RSA keys
 * If keys exist on disk, load them. Otherwise, generate new ones and save.
 */
function initializeKeys() {
    try {
        // Ensure config directory exists
        if (!fs.existsSync(KEYS_DIR)) {
            fs.mkdirSync(KEYS_DIR, { recursive: true });
        }

        // Check if keys already exist
        if (fs.existsSync(PUBLIC_KEY_PATH) && fs.existsSync(PRIVATE_KEY_PATH)) {
            console.log('[Encryption] Loading existing RSA keys from disk...');
            publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
            privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            
            // Import keys into NodeRSA
            key = new NodeRSA();
            key.importKey(privateKey, 'private');
            key.setOptions({ encryptionScheme: 'pkcs1' });
            
            console.log('[Encryption] RSA keys loaded successfully');
        } else {
            console.log('[Encryption] No existing keys found. Generating new RSA keys...');
            
            // Generate new key pair
            key = new NodeRSA({ b: 2048 }); // 2048-bit for better security
            key.setOptions({ encryptionScheme: 'pkcs1' });
            
            publicKey = key.exportKey('public');
            privateKey = key.exportKey('private');
            
            // Save keys to disk
            fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf8');
            fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, 'utf8');
            
            console.log('[Encryption] New RSA keys generated and saved to disk');
        }
    } catch (err) {
        console.error('[Encryption] Error initializing keys:', err);
        throw err;
    }
}

// Initialize keys on module load
initializeKeys();

/**
 * Decrypts an encrypted message using the private key.
 * @param {string} encryptedData - The encrypted data in base64 format.
 * @returns {string|null} - The decrypted string or null if failure.
 */
const decrypt = (encryptedData) => {
    try {
        return key.decrypt(encryptedData, 'utf8');
    } catch (err) {
        console.error('[Encryption] Decryption failed:', err.message);
        return null;
    }
};

module.exports = {
    publicKey,
    decrypt
};
