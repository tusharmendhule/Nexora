const admin = require('firebase-admin');
const fs = require('fs');

/**
 * Initialize Firebase Admin SDK.
 *
 * Credentials can be provided via:
 * 1. FIREBASE_SERVICE_ACCOUNT — full JSON string
 * 2. GOOGLE_APPLICATION_CREDENTIALS — path to service-account JSON
 *
 * If no credentials are provided, Firebase Admin will initialize
 * without explicit credentials when possible.
 */

function initializeFirebase() {
  if (admin.apps && admin.apps.length > 0) {
    return admin.apps[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  try {
    // Option 1: Service account JSON from environment variable
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);

      const app = admin.initializeApp({
        credential: admin.cert(serviceAccount),
      });

      console.log('✅ Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT');
      return app;
    }

    // Option 2: Service account JSON file
    if (credentialsPath) {
      if (!fs.existsSync(credentialsPath)) {
        throw new Error(
          `Firebase service account file not found: ${credentialsPath}`
        );
      }

      const serviceAccount = require(credentialsPath);

      const app = admin.initializeApp({
        credential: admin.cert(serviceAccount),
      });

      console.log(
        '✅ Firebase Admin initialized using GOOGLE_APPLICATION_CREDENTIALS'
      );

      return app;
    }

    // Option 3: Application Default Credentials
    const app = admin.initializeApp();

    console.log(
      '⚠️ Firebase Admin initialized using Application Default Credentials'
    );

    return app;
  } catch (err) {
    console.error('❌ Firebase Admin initialization failed:', err.message);

    // Keep the application from crashing during local development.
    try {
      if (!admin.apps || admin.apps.length === 0) {
        const fallbackApp = admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'nexora-dev',
        });

        console.log('⚠️ Firebase running in limited development mode');
        return fallbackApp;
      }
    } catch (fallbackError) {
      console.error(
        '❌ Firebase fallback initialization failed:',
        fallbackError.message
      );
    }

    // Return the default app as a last resort
    return admin.apps[0];
  }
}

const firebaseApp = initializeFirebase();

// ── Firebase Admin v14 modular API ─────────────────────
// In v14, admin.auth() was removed. Use getAuth(app) instead.
const { getAuth } = require('firebase-admin/auth');
const firebaseAuth = getAuth(firebaseApp);

module.exports = firebaseApp;
module.exports.firebaseAuth = firebaseAuth;