const express = require('express');
const router = express.Router();
const Highlight = require('../models/highlight.model');
const { protect } = require('../middleware/auth.middleware');

// ==========================================
// 1. CREATE A NEW HIGHLIGHT
// ==========================================
// @route   POST /api/highlights
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { title, coverImage, stories } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Highlight title is required' });
    }

    const newHighlight = await Highlight.create({
      user: currentUserId,
      title: title.trim(),
      coverImage: coverImage || '',
      stories: stories || []
    });

    await newHighlight.populate('stories');

    res.status(201).json({
      success: true,
      message: 'Highlight created successfully',
      highlight: newHighlight
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. GET USER'S HIGHLIGHTS
// ==========================================
// @route   GET /api/highlights/user/:userId
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const highlights = await Highlight.find({ user: req.params.userId })
      .populate('stories')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: highlights.length,
      highlights
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. UPDATE A HIGHLIGHT (ADD/REMOVE STORIES)
// ==========================================
// @route   PUT /api/highlights/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, coverImage, stories } = req.body;
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    const highlight = await Highlight.findById(req.params.id);

    if (!highlight) {
      return res.status(404).json({ success: false, message: 'Highlight not found' });
    }

    if (highlight.user.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to update this highlight' });
    }

    if (title) highlight.title = title.trim();
    if (coverImage !== undefined) highlight.coverImage = coverImage;
    if (stories) highlight.stories = stories;

    await highlight.save();
    await highlight.populate('stories');

    res.status(200).json({
      success: true,
      message: 'Highlight updated successfully',
      highlight
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. DELETE A HIGHLIGHT
// ==========================================
// @route   DELETE /api/highlights/:id
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const currentUserId = req.user?._id || req.user?.id || req.user?._doc?._id || req.userId;

    const highlight = await Highlight.findById(req.params.id);

    if (!highlight) {
      return res.status(404).json({ success: false, message: 'Highlight not found' });
    }

    if (highlight.user.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized to delete this highlight' });
    }

    await Highlight.deleteOne({ _id: highlight._id });

    res.status(200).json({
      success: true,
      message: 'Highlight deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;