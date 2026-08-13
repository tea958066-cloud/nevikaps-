const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended nonce size for GCM

function getKey() {
    const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error('Missing CREDENTIAL_ENCRYPTION_KEY. Set a 64-character hex string (32 bytes) in backend/.env.');
    }
    const key = Buffer.from(keyHex, 'hex');
    if (key.length !== 32) {
        throw new Error('CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex characters) for AES-256.');
    }
    return key;
}

// Encrypts plaintext (e.g. a teacher/admin password) with AES-256-GCM.
// Returns a single string encoding iv + authTag + ciphertext, safe to store
// as one text column. Reversible by design — the admin panel needs to be
// able to display real credentials back to the admin.
function encryptSecret(plaintext) {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptSecret(encoded) {
    const key = getKey();
    const raw = Buffer.from(encoded, 'base64');
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
    const ciphertext = raw.subarray(IV_LENGTH + 16);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
}

// Constant-time comparison of two strings, regardless of their length —
// hashing both to a fixed 32-byte digest first avoids the length leak that
// crypto.timingSafeEqual would otherwise expose (and it throws on unequal
// length buffers, which plaintext passwords of different lengths would be).
function constantTimeStringsEqual(a, b) {
    const bufA = crypto.createHash('sha256').update(String(a)).digest();
    const bufB = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(bufA, bufB);
}

// Verifies a candidate plaintext password against a stored encrypted value.
function verifySecret(candidatePlaintext, encoded) {
    try {
        const actual = decryptSecret(encoded);
        return constantTimeStringsEqual(candidatePlaintext, actual);
    } catch (error) {
        console.error('Credential decrypt/verify error:', error);
        return false;
    }
}

module.exports = { encryptSecret, decryptSecret, verifySecret, constantTimeStringsEqual };
