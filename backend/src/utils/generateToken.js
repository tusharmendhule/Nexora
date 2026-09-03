const jwt = require('jsonwebtoken');

// ── Fail fast at startup if JWT_SECRET is missing ──────
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not set in the environment. Auth endpoints will fail.');
  console.error('   Add JWT_SECRET=<random-32+ chars> to your backend/.env file.');
}

/**
 * Generate a JWT token for a user.
 * @param {string} userId - The user's MongoDB _id
 * @returns {string} Signed JWT token
 * @throws {Error} If JWT_SECRET is not set
 */
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set — cannot generate token. See backend/.env.example.');
  }
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
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
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateToken, verifyToken };
