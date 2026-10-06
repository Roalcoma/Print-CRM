// Config plugin local: ajustes del proyecto Android generado por `expo prebuild` (android/ no se versiona).
//  1. Firma release con la keystore de ~/Android/keys (fuera del repo). Las credenciales se leen de
//     ROCCO_SIGNING_PROPS o ~/Android/keys/rocco-signing.properties; sin ese archivo, firma debug.
//  2. Memoria moderada para Gradle (la máquina de desarrollo va justa de RAM) y R8 en release.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const LOADER = `
// [rocco] firma release desde un archivo de propiedades fuera del repo
def roccoSigningFile = new File(System.getenv("ROCCO_SIGNING_PROPS") ?: "\${System.getProperty('user.home')}/Android/keys/rocco-signing.properties")
def roccoSigning = new Properties()
if (roccoSigningFile.exists()) { roccoSigningFile.withInputStream { roccoSigning.load(it) } }
`;

const RELEASE_SIGNING = `
        release {
            if (roccoSigningFile.exists()) {
                storeFile file(roccoSigning['storeFile'])
                storePassword roccoSigning['storePassword']
                keyAlias roccoSigning['keyAlias']
                keyPassword roccoSigning['keyPassword']
            }
        }
    }
    buildTypes {`;

function withReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    let g = cfg.modResults.contents;
    if (g.includes('[rocco]')) return cfg;
    g = g.replace(/\nandroid \{/, `${LOADER}\nandroid {`);
    // Cierra signingConfigs añadiendo `release` justo antes de buildTypes
    g = g.replace(/\n    }\n    buildTypes \{/, RELEASE_SIGNING);
    // En buildTypes.release: usar la firma propia si existe
    g = g.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      '$1signingConfig roccoSigningFile.exists() ? signingConfigs.release : signingConfigs.debug',
    );
    if (!g.includes('roccoSigningFile.exists() ? signingConfigs.release')) {
      throw new Error('withRoccoAndroid: no se pudo parchear la firma release de app/build.gradle');
    }
    cfg.modResults.contents = g;
    return cfg;
  });
}

function setProp(props, key, value) {
  const item = props.find(p => p.type === 'property' && p.key === key);
  if (item) item.value = value;
  else props.push({ type: 'property', key, value });
}

function withGradleMemory(config) {
  return withGradleProperties(config, cfg => {
    setProp(cfg.modResults, 'org.gradle.jvmargs', '-Xmx2560m -XX:MaxMetaspaceSize=768m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8');
    setProp(cfg.modResults, 'org.gradle.workers.max', '4');
    setProp(cfg.modResults, 'kotlin.daemon.jvmargs', '-Xmx1536m');
    // R8: sin minificar el APK pesa ~40 MB (casi todo dex); con R8 + recursos reducidos, bastante menos.
    setProp(cfg.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    setProp(cfg.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    return cfg;
  });
}

module.exports = config => withGradleMemory(withReleaseSigning(config));
