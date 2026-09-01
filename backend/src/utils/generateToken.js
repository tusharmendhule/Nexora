const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token for a user.
 * @param {string} userId - The user's MongoDB _id
 * @returns {string} Signed JWT token
 */
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'nexora_fallback_secret_key_2026',
    { expiresIn: '7d' }
  );
};

/**
 * Verify and decode a JWT token.
 * @param {string} token - The JWT token string
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || 'nexora_fallback_secret_key_2026');
};

module.exports = { generateToken, verifyToken };
