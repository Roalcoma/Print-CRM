// Configuración de Expo (CNG: android/ e ios/ se generan con `npx expo prebuild`, no se versionan).
import fs from 'node:fs';
import path from 'node:path';
import type { ExpoConfig } from 'expo/config';

// FCM en Android necesita google-services.json (Firebase). Si no está, la app compila y funciona
// igual, solo que sin notificaciones push (Ajustes lo avisa).
const GOOGLE_SERVICES = './google-services.json';
const hasGoogleServices = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES));

const BRAND_ORANGE = '#F69008';
const CANVAS = '#F6F4F0';

const config: ExpoConfig = {
  name: 'Rocco',
  slug: 'rocco',
  scheme: 'rocco',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: CANVAS,
  ios: {
    bundleIdentifier: 'org.arbolaureo.rocco',
    supportsTablet: false,
    infoPlist: {
      NSFaceIDUsageDescription: 'Rocco usa Face ID para desbloquear la app.',
    },
  },
  android: {
    package: 'org.arbolaureo.rocco',
    versionCode: 1,
    ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    adaptiveIcon: {
      backgroundColor: CANVAS,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Solo lo que usa la app (expo añade por defecto permisos que no necesitamos)
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-local-authentication', { faceIDPermission: 'Rocco usa Face ID para desbloquear la app.' }],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: BRAND_ORANGE, defaultChannel: 'messages' }],
    './plugins/withRoccoAndroid',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 160, resizeMode: 'contain', backgroundColor: CANVAS }],
  ],
  experiments: { typedRoutes: false },
  extra: {
    pushConfigured: hasGoogleServices,
  },
};

export default config;
