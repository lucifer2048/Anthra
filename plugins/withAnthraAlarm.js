const {
  withAndroidManifest,
  withInfoPlist,
  AndroidConfig,
} = require("@expo/config-plugins");

function ensurePermission(manifest, name) {
  if (!manifest.manifest["uses-permission"]) {
    manifest.manifest["uses-permission"] = [];
  }
  const permissions = manifest.manifest["uses-permission"];
  if (!permissions.some((entry) => entry.$?.["android:name"] === name)) {
    permissions.push({ $: { "android:name": name } });
  }
}

function ensureMetaData(application, name, resource) {
  if (!application["meta-data"]) {
    application["meta-data"] = [];
  }
  const items = application["meta-data"];
  const existing = items.find((entry) => entry.$?.["android:name"] === name);
  if (existing) {
    existing.$["android:resource"] = resource;
    return;
  }
  items.push({
    $: {
      "android:name": name,
      "android:resource": resource,
    },
  });
}

const withAnthraAlarm = (config) => {
  config = withAndroidManifest(config, (config) => {
    AndroidConfig.Manifest.ensureToolsAvailable(config.modResults);
    ensurePermission(config.modResults, "android.permission.FOREGROUND_SERVICE_HEALTH");

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    ensureMetaData(
      application,
      "com.google.firebase.messaging.default_notification_icon",
      "@drawable/notification_icon"
    );
    ensureMetaData(
      application,
      "expo.modules.notifications.default_notification_icon",
      "@drawable/notification_icon"
    );

    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription =
      config.modResults.NSCameraUsageDescription ??
      "Allow Anthra to verify push-up alarms and photograph meals.";
    config.modResults.NSUserNotificationsUsageDescription =
      "Allow Anthra to ring push-up alarms and workout reminders.";
    return config;
  });

  return config;
};

module.exports = withAnthraAlarm;
