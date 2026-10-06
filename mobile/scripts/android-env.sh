#!/usr/bin/env bash
# Toolchain Android local (sin sudo, fuera del repo). Uso:  source mobile/scripts/android-env.sh
# El Java del sistema es demasiado nuevo para Gradle/AGP: se usa el JDK 17 de ~/Android/jdk-17.
export JAVA_HOME="${JAVA_HOME_ROCCO:-$HOME/Android/jdk-17}"
export ANDROID_HOME="${ANDROID_HOME_ROCCO:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
