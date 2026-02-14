const NodeRSA = require('node-rsa');

// Determine if we should generate new keys on startup or persist them.
// For simplicity in this context, we'll generate a fresh pair on server start.
// In a real production environment, you'd likely want to persist these keys.
// However, rotating them on restart is also a valid security strategy (session-based).

const key = new NodeRSA({ b: 512 }); // 512-bit key for speed; 2048 is better for higher security
key.setOptions({ encryptionScheme: 'pkcs1' });

const publicKey = key.exportKey('public');
const privateKey = key.exportKey('private');

console.log('[Encryption] RSA Keys Generated');

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
