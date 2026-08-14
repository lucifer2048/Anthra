const { withAppBuildGradle } = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const TAG = "anthra-release-signing";

const SIGNING_VARS = `
def anthraReleaseStoreFile = findProperty('ANTHRA_RELEASE_STORE_FILE') ?: System.getenv('ANTHRA_RELEASE_STORE_FILE')
def anthraReleaseStorePassword = findProperty('ANTHRA_RELEASE_STORE_PASSWORD') ?: System.getenv('ANTHRA_RELEASE_STORE_PASSWORD')
def anthraReleaseKeyAlias = findProperty('ANTHRA_RELEASE_KEY_ALIAS') ?: System.getenv('ANTHRA_RELEASE_KEY_ALIAS')
def anthraReleaseKeyPassword = findProperty('ANTHRA_RELEASE_KEY_PASSWORD') ?: System.getenv('ANTHRA_RELEASE_KEY_PASSWORD')
def hasAnthraReleaseSigning = [
    anthraReleaseStoreFile,
    anthraReleaseStorePassword,
    anthraReleaseKeyAlias,
    anthraReleaseKeyPassword
].every { it != null && it.toString().trim() }
`.trim();

const RELEASE_SIGNING_BLOCK = `
        if (hasAnthraReleaseSigning) {
            release {
                storeFile rootProject.file(anthraReleaseStoreFile)
                storePassword anthraReleaseStorePassword
                keyAlias anthraReleaseKeyAlias
                keyPassword anthraReleaseKeyPassword
            }
        }
`.trim();

const INTERNAL_BUILD_TYPE = `
        internal {
            initWith release
            signingConfig signingConfigs.debug
            versionNameSuffix "-internal"
            matchingFallbacks = ['release']
        }
`.trim();

const RELEASE_SIGNING_GUARD = `
gradle.taskGraph.whenReady { graph ->
    def productionSigningTasks = [
        'assembleRelease',
        'bundleRelease',
        'installRelease',
        'packageRelease',
        'publishReleaseBundle'
    ]
    def productionTaskRequested = graph.allTasks.any { task ->
        task.project == project && task.name in productionSigningTasks
    }
    if (productionTaskRequested && !hasAnthraReleaseSigning) {
        throw new GradleException(
            'Production signing is not configured. Set ANTHRA_RELEASE_STORE_FILE, ' +
            'ANTHRA_RELEASE_STORE_PASSWORD, ANTHRA_RELEASE_KEY_ALIAS, and ' +
            'ANTHRA_RELEASE_KEY_PASSWORD. Use :app:assembleInternal for a debug-signed test APK.'
        )
    }
}
`.trim();

function mergeOnce({ src, tag, newSrc, anchor, offset = 0, comment = "//" }) {
  if (src.includes(`@generated begin ${tag}`)) {
    return src;
  }
  return mergeContents({ src, tag, newSrc, anchor, offset, comment }).contents;
}

const withAnthraReleaseSigning = (config) =>
  withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;

    src = mergeOnce({
      tag: `${TAG}-vars`,
      src,
      newSrc: SIGNING_VARS,
      anchor: /^def jscFlavor = 'io\.github\.react-native-community:jsc-android/m,
      offset: 0,
      comment: "//",
    });

    src = mergeOnce({
      tag: `${TAG}-release-config`,
      src,
      newSrc: RELEASE_SIGNING_BLOCK,
      anchor: /signingConfigs \{/,
      offset: 1,
      comment: "//",
    });

    if (!src.includes("if (hasAnthraReleaseSigning) signingConfig signingConfigs.release")) {
      src = src.replace(
        /(release \{\n(?:[ \t]*\/\/[^\n]*\n)+[ \t]*)signingConfig signingConfigs\.debug/,
        "$1if (hasAnthraReleaseSigning) signingConfig signingConfigs.release"
      );
    }

    src = mergeOnce({
      tag: `${TAG}-internal-build-type`,
      src,
      newSrc: INTERNAL_BUILD_TYPE,
      anchor: /buildTypes \{/,
      offset: 1,
      comment: "//",
    });

    src = mergeOnce({
      tag: `${TAG}-guard`,
      src,
      newSrc: RELEASE_SIGNING_GUARD,
      anchor: /^dependencies \{/m,
      offset: -1,
      comment: "//",
    });

    config.modResults.contents = src;
    return config;
  });

module.exports = withAnthraReleaseSigning;
