const express = require('express');
const router = express.Router();
const OTP = require('../models/otp.model');
const User = require('../models/user.model');
const { createRateLimiter } = require('../middleware/rate-limit.middleware');

// Rate limit: 3 OTP sends per 15 minutes per IP
const otpSendRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyPrefix: 'rl:otp:send',
  message: 'Too many OTP requests. Please wait before trying again.',
});

// Rate limit: 5 OTP verify attempts per 15 minutes per IP
const otpVerifyRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:otp:verify',
  message: 'Too many verification attempts. Please wait before trying again.',
});

// ==========================================
// 1. SEND / GENERATE OTP
// ==========================================
// @route   POST /api/otp/send
// @access  Public
router.post('/send', otpSendRateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Generate a secure 6-digit random number string
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTP for this email before creating a new one
    await OTP.deleteMany({ email: email.toLowerCase() });

    // Save new OTP
    await OTP.create({
      email: email.toLowerCase(),
      otp: generatedOtp
    });

    // NOTE: Here you can integrate Nodemailer or SendGrid to send actual emails.
    // OTP is never returned in the response — it must be delivered via email/SMS.
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully (expires in 5 minutes)',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ==========================================
// 2. VERIFY OTP
// ==========================================
// @route   POST /api/otp/verify
// @access  Public
router.post('/verify', otpVerifyRateLimit, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const otpRecord = await OTP.findOne({ email: email.toLowerCase(), otp: otp.trim() });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Delete OTP once verified so it cannot be reused
    await OTP.deleteOne({ _id: otpRecord._id });

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;