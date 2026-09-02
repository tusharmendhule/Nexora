const { ApiError } = require('../../middleware/error.middleware');
const { getMediaCategory } = require('../../middleware/upload.middleware');

/**
 * POST /api/v1/posts/upload
 *
 * Upload a single media file (image, video, or audio) to Cloudinary.
 * Expects multipart/form-data with a field named "file".
 *
 * Returns the Cloudinary secure URL and metadata for use in post creation.
 */
exports.uploadMedia = async (req, res, next) => {
  try {
    if (!req.uploadedMedia) {
      return next(new ApiError(400, 'No media file was uploaded'));
    }

    const { url, type, mimeType, fileSize, thumbnailUrl } = req.uploadedMedia;

    return res.status(200).json({
      success: true,
      message: 'Media uploaded successfully',
      media: {
        url,
        type,
        mimeType,
        fileSize,
        thumbnailUrl: thumbnailUrl || undefined,
      },
    });
  } catch (error) {
    console.error('[Upload] Media upload failed:', error.message);
    next(new ApiError(500, 'Upload failed'));
  }
};

/**
 * POST /api/v1/posts/upload/multiple
 *
 * Upload multiple media files to Cloudinary.
 * Expects multipart/form-data with a field named "files" (max 10).
 *
 * Returns an array of Cloudinary URLs and metadata.
 */
exports.uploadMultipleMedia = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return next(new ApiError(400, 'No media files were uploaded'));
    }

    const results = req.files.map((file) => {
      // Each file has already been processed by uploadMedia middleware chain
      // For multiple uploads, we process them individually
      return {
        url: file.secure_url || file.url,
        type: getMediaCategory(file.mimetype) || 'image',
        mimeType: file.mimetype,
        fileSize: file.size,
      };
    });

    return res.status(200).json({
      success: true,
      message: `${results.length} file(s) uploaded successfully`,
      media: results,
    });
  } catch (error) {
    console.error('[Upload] Multiple upload failed:', error.message);
    next(new ApiError(500, 'Multiple upload failed'));
  }
};
