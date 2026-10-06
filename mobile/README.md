# Rocco móvil

App Android (y en el futuro iOS) de Rocco CRM: Expo + React Native + TypeScript + expo-router.
Abre en **Leads**; pestañas Leads / Mensajes / Ajustes; ficha del lead y chat básico.

- Código: `src/app/` (pantallas/rutas), `src/lib/` (API, sesión, push), `src/components/`.
- Servidor por defecto: `src/lib/config.ts` (`https://rocco.arbolaureo.org`). En el login, mantener
  pulsado el logo 1,5 s muestra el campo para cambiar de servidor (pruebas).
- `android/` e `ios/` **no se versionan**: se generan con `npx expo prebuild` a partir de
  `app.config.ts` y `plugins/withRoccoAndroid.js` (firma release + memoria de Gradle).

## Compilar el APK

Toolchain local sin sudo: JDK 17 en `~/Android/jdk-17`, SDK en `~/Android/Sdk`
(`scripts/android-env.sh` exporta `JAVA_HOME`/`ANDROID_HOME`).

```bash
cd mobile
npm install
bash scripts/build-apk.sh release      # → dist/rocco-release.apk (solo arm64-v8a)
ABIS=armeabi-v7a,arm64-v8a bash scripts/build-apk.sh release   # + móviles de 32 bits
bash scripts/build-apk.sh debug        # alternativa, firmada con la clave debug
adb install -r dist/rocco-release.apk
```

La firma release se lee de `~/Android/keys/rocco-signing.properties` (o `ROCCO_SIGNING_PROPS`);
la keystore y sus datos están en `~/Android/keys/` (ver `README.txt` allí). Nunca dentro del repo.

## Notificaciones push

Token nativo (FCM en Android) registrado en `POST /api/me/push-tokens`. Requiere
`mobile/google-services.json` (Firebase, no se versiona): si existe al compilar, `app.config.ts`
lo incluye; si no, la app funciona sin push y Ajustes lo indica. Canales Android:
`leads`, `messages` (importancia alta), `agenda`, `system`.

## Comprobaciones

```bash
npx tsc --noEmit
npx expo-doctor
```
