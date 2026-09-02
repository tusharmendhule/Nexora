const admin = require('firebase-admin');

/**
 * Initialize Firebase Admin SDK.
 *
 * Credentials can be provided via:
 *   1. FIREBASE_SERVICE_ACCOUNT  — full JSON string of the service account
 *   2. GOOGLE_APPLICATION_CREDENTIALS — path to the service-account JSON file
 *
 * In development, if neither is set the SDK runs in "emulator-aware" mode and
 * will still attempt to verify tokens (useful with the Firebase Auth emulator).
 */

function initializeFirebase() {
  if (admin.apps && admin.apps.length > 0) return admin;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized (service-account JSON)');
    } catch (err) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', err.message);
      throw err;
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // firebase-admin auto-discovers credentials from this env var
    admin.initializeApp();
    console.log('✅ Firebase Admin initialized (GOOGLE_APPLICATION_CREDENTIALS)');
  } else {
    // Fallback: initialize without credentials — works with the Auth emulator
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'nexora-dev',
    });
    console.log('⚠️  Firebase Admin initialized without credentials (emulator / demo mode)');
  }

  return admin;
}

const firebaseAdmin = initializeFirebase();

module.exports = firebaseAdmin;
