#!/usr/bin/env bash
# Compila el APK de Rocco.   bash scripts/build-apk.sh [release|debug]
#   ABIS=arm64-v8a (por defecto; casi todos los Android actuales). Para todos:
#   ABIS=armeabi-v7a,arm64-v8a,x86,x86_64 bash scripts/build-apk.sh release
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/android-env.sh
VARIANT="${1:-release}"
ABIS="${ABIS:-arm64-v8a}"

# android/ se regenera desde app.config.ts + plugins (no se edita a mano)
CI=1 npx expo prebuild -p android --clean --no-install

TASK="assemble$(tr '[:lower:]' '[:upper:]' <<< "${VARIANT:0:1}")${VARIANT:1}"
(cd android && ./gradlew "$TASK" -PreactNativeArchitectures="$ABIS" --no-daemon)

APK="android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
mkdir -p dist
cp "$APK" "dist/rocco-$VARIANT.apk"
ls -lh "dist/rocco-$VARIANT.apk"
echo "Instalar en el móvil conectado por USB:  adb install -r dist/rocco-$VARIANT.apk"
