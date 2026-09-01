const express = require('express');
const router = express.Router();
const OTP = require('../models/otp.model');
const User = require('../models/user.model');

// ==========================================
// 1. SEND / GENERATE OTP
// ==========================================
// @route   POST /api/otp/send
// @access  Public
router.post('/send', async (req, res) => {
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
    // For local testing, we return the OTP in the response body.
    res.status(200).json({
      success: true,
      message: 'OTP sent successfully (expires in 5 minutes)',
      otp: generatedOtp // Remove this field in production!
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. VERIFY OTP
// ==========================================
// @route   POST /api/otp/verify
// @access  Public
router.post('/verify', async (req, res) => {
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
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;