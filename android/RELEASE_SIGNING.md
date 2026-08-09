# Anthra Android signing

Android preserves an installed app's private SQLite and SecureStore data only
when an update uses the same application ID and signing certificate. Anthra's
application ID is `com.anthra.timer`.

## Internal data-migration test APK

Use the checked-in debug certificate only for a device that already runs a
debug-signed Anthra build:

```sh
cd android
./gradlew :app:assembleInternal
```

The APK is written to `app/build/outputs/apk/internal/app-internal.apk`. Never
uninstall the existing app to resolve a signature mismatch; uninstalling erases
its device-local data.

## Production build

Recover and back up the exact keystore used for every previously distributed
Anthra APK. Configure these values outside Git, using Gradle properties or CI
environment variables:

```text
ANTHRA_RELEASE_STORE_FILE=/absolute/path/to/anthra-upload.jks
ANTHRA_RELEASE_STORE_PASSWORD=...
ANTHRA_RELEASE_KEY_ALIAS=...
ANTHRA_RELEASE_KEY_PASSWORD=...
```

Then build:

```sh
cd android
./gradlew :app:assembleRelease
./gradlew :app:bundleRelease
```

Production tasks intentionally fail when these values are absent. Before any
rollout, compare the new APK certificate with the previously distributed APK:

```sh
apksigner verify --print-certs previous.apk
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

The SHA-256 certificate digest must match. If Google Play App Signing is in use,
retain the upload key and verify Play Console's app-signing certificate records.
