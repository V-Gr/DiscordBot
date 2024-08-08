const crypto = require('crypto');
const { encryptionKey } = require('../config.json');

const algorithm = 'aes-256-cbc';
const key = crypto.scryptSync(encryptionKey, 'salt', 32);

function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

function decrypt(text) {
  try {
    const parts = text.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid input');
    }
    const [ivText, encryptedText] = parts.map(part => part.replace(/"/g, ''));
    const iv = Buffer.from(ivText, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}

module.exports = { encrypt, decrypt };
