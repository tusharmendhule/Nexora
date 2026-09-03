import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Firebase configuration for Nexora.
///
/// Generated from your Firebase project `nexora-e79a7`.
/// Run `flutterfire configure` to regenerate this file.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      case TargetPlatform.windows:
        return windows;
      case TargetPlatform.linux:
        return linux;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    authDomain: 'nexora-e79a7.firebaseapp.com',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
    iosBundleId: 'com.nexora.app',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
    iosBundleId: 'com.nexora.app',
  );

  static const FirebaseOptions windows = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
  );

  static const FirebaseOptions linux = FirebaseOptions(
    apiKey: 'AIzaSyDgZ0s8UCvYINHgeOjYFWuuvIum9j6uljI',
    appId: '1:873751705022:web:1f65f7f87af53f9b8c35ef',
    messagingSenderId: '873751705022',
    projectId: 'nexora-e79a7',
    storageBucket: 'nexora-e79a7.firebasestorage.app',
  );
}
