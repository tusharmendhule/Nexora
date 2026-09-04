const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { ApiError } = require('./error.middleware');

// ─── Configure Cloudinary ──────────────────────────────────
// Credentials are loaded from environment variables:
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Supported MIME types ──────────────────────────────────
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
];
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska',
];
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/x-m4a',
];
const ALL_ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_AUDIO_TYPES];

// ─── Size limits by type ───────────────────────────────────
const SIZE_LIMITS = {
  image: 10 * 1024 * 1024,   // 10 MB
  video: 100 * 1024 * 1024,  // 100 MB
  audio: 20 * 1024 * 1024,   // 20 MB
  default: 10 * 1024 * 1024, // 10 MB
};

/**
 * Determine the media category from a MIME type.
 */
function getMediaCategory(mimetype) {
  if (mimetype && mimetype.startsWith('image/')) return 'image';
  if (mimetype && mimetype.startsWith('video/')) return 'video';
  if (mimetype && mimetype.startsWith('audio/')) return 'audio';
  return null;
}

// ─── Multer in-memory storage (files are buffered, then uploaded to Cloudinary)
const storage = multer.memoryStorage();

// ─── File filter — allow images, videos, and audio
const mediaFileFilter = (_req, file, cb) => {
  if (file.mimetype && ALL_ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        `Unsupported file type: ${file.mimetype || 'unknown'}. Allowed: images (JPEG, PNG, GIF, WebP), videos (MP4, MOV, WebM, AVI, MKV), audio (MP3, WAV, OGG, AAC, FLAC)`
      ),
      false
    );
  }
};

// ─── Image-only file filter (for avatars, etc.)
const imageFileFilter = (_req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new ApiError(400, 'Only image files are allowed'), false);
  }
};

// ─── Multer upload instance — general media (up to 100 MB for video)
const upload = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max (video is largest)
  },
});

// ─── Multer upload instance — image-only (avatars, etc.)
const uploadImageOnly = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
});

/**
 * Determine the Cloudinary folder and options based on media category.
 */
function getCloudinaryOptions(category, originalName) {
  const baseOpts = { resource_type: 'auto' };

  switch (category) {
    case 'image':
      return {
        folder: 'nexora/images',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        ...baseOpts,
        resource_type: 'image',
      };
    case 'video':
      return {
        folder: 'nexora/videos',
        resource_type: 'video',
        eager: [
          { width: 640, height: 360, crop: 'pad', codec: 'h264' },
        ],
        eager_async: true,
      };
    case 'audio':
      return {
        folder: 'nexora/audio',
        resource_type: 'video', // Cloudinary uses 'video' resource_type for audio
      };
    default:
      return {
        folder: 'nexora/media',
        ...baseOpts,
      };
  }
}

/**
 * Upload a single media file to Cloudinary.
 *
 * Attaches `req.uploadedMedia` with:
 *  - url: Cloudinary secure URL
 *  - type: media category (image/video/audio)
 *  - mimeType: original MIME type
 *  - fileSize: original file size in bytes
 */
const uploadMedia = async (req, _res, next) => {
  try {
    if (!req.file) {
      return next(new ApiError(400, 'No file provided'));
    }

    const category = getMediaCategory(req.file.mimetype);
    if (!category) {
      return next(new ApiError(400, `Unsupported MIME type: ${req.file.mimetype}`));
    }

    // Validate file size for the category
    const maxSize = SIZE_LIMITS[category] || SIZE_LIMITS.default;
    if (req.file.size > maxSize) {
      const maxMB = Math.round(maxSize / (1024 * 1024));
      return next(
        new ApiError(400, `${category} file too large: ${Math.round(req.file.size / (1024 * 1024))}MB. Maximum allowed: ${maxMB}MB`)
      );
    }

    // Upload buffer to Cloudinary using a data URI
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const options = getCloudinaryOptions(category, req.file.originalname);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(dataUri, options, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    req.uploadedMedia = {
      url: result.secure_url,
      publicId: result.public_id,
      type: category,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      thumbnailUrl: result.eager?.[0]?.secure_url || null,
    };

    next();
  } catch (error) {
    next(new ApiError(500, 'Media upload failed'));
  }
};

/**
 * Upload a single chat image to Cloudinary.
 *
 * Expects a multipart form with a field named "image".
 * Attaches `req.fileUrl` with the Cloudinary secure URL on success.
 */
const uploadChatImage = async (req, _res, next) => {
  try {
    if (!req.file) {
      return next(new ApiError(400, 'No image file provided'));
    }

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        {
          folder: 'nexora/chat',
          transformation: [
            { width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
          ],
          resource_type: 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

    req.fileUrl = result.secure_url;
    next();
  } catch (error) {
    next(new ApiError(500, 'Image upload failed'));
  }
};

/**
 * Upload a single image to Cloudinary (avatar).
 *
 * Expects a multipart form with a field named "avatar".
 * Attaches `req.fileUrl` with the Cloudinary secure URL on success.
 */
const uploadAvatar = async (req, _res, next) => {
  try {
    if (!req.file) {
      return next(new ApiError(400, 'No image file provided'));
    }

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        {
          folder: 'nexora/avatars',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          ],
          format: 'webp',
          quality: 'auto',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

    req.fileUrl = result.secure_url;
    next();
  } catch (error) {
    next(new ApiError(500, 'Avatar upload failed'));
  }
};

/**
 * Upload a single image to Cloudinary (generic).
 *
 * Expects a multipart form with a field named "image".
 * Attaches `req.fileUrl` with the Cloudinary secure URL on success.
 */
const uploadImage = async (req, _res, next) => {
  try {
    if (!req.file) {
      return next(new ApiError(400, 'No image file provided'));
    }

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        {
          folder: 'nexora/images',
          format: 'webp',
          quality: 'auto',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

    req.fileUrl = result.secure_url;
    next();
  } catch (error) {
    next(new ApiError(500, 'Image upload failed'));
  }
};

module.exports = {
  upload,
  uploadImageOnly,
  uploadMedia,
  uploadAvatar,
  uploadChatImage,
  uploadImage,
  cloudinary,
  getMediaCategory,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
};
