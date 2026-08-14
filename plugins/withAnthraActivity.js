const {
  withMainApplication,
  withAndroidManifest,
  withEntitlementsPlist,
  withInfoPlist,
  AndroidConfig,
} = require("@expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");

const TAG = "anthra-activity";

function ensurePermission(manifest, name) {
  if (!manifest.manifest["uses-permission"]) {
    manifest.manifest["uses-permission"] = [];
  }
  const permissions = manifest.manifest["uses-permission"];
  if (!permissions.some((entry) => entry.$?.["android:name"] === name)) {
    permissions.push({ $: { "android:name": name } });
  }
}

const withAnthraActivity = (config) => {
  config = withAndroidManifest(config, (config) => {
    AndroidConfig.Manifest.ensureToolsAvailable(config.modResults);
    ensurePermission(config.modResults, "android.permission.FOREGROUND_SERVICE_HEALTH");
    return config;
  });

  config = withMainApplication(config, (config) => {
    let src = config.modResults.contents;

    if (!src.includes("com.anthra.timer.activity.StepCounterManager")) {
      src = mergeContents({
        tag: `${TAG}-imports`,
        src,
        newSrc: [
          "import com.anthra.timer.alarm.AnthraAlarmPackage",
          "import com.anthra.timer.activity.AnthraActivityPackage",
          "import com.anthra.timer.activity.StepCounterManager",
          "import com.anthra.timer.activity.StepTrackingService",
        ].join("\n"),
        anchor: /import expo\.modules\.ReactNativeHostWrapper/,
        offset: 1,
        comment: "//",
      }).contents;
    }

    if (!src.includes("AnthraAlarmPackage()")) {
      src = mergeContents({
        tag: `${TAG}-packages`,
        src,
        newSrc: "              add(AnthraAlarmPackage())\n              add(AnthraActivityPackage())",
        anchor: /PackageList\(this\)\.packages\.apply \{/,
        offset: 1,
        comment: "//",
      }).contents;
    }

    if (!src.includes("StepTrackingService.start")) {
      src = mergeContents({
        tag: `${TAG}-step-autostart`,
        src,
        newSrc: [
          "    val stepCounter = StepCounterManager(applicationContext)",
          "    if (stepCounter.isTrackingEnabled() && stepCounter.hasPermission() && stepCounter.hasStepCounter()) {",
          "      runCatching { StepTrackingService.start(applicationContext) }",
          "    }",
        ].join("\n"),
        anchor: /ApplicationLifecycleDispatcher\.onApplicationCreate\(this\)/,
        offset: 1,
        comment: "//",
      }).contents;
    }

    config.modResults.contents = src;
    return config;
  });

  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.healthkit"] = true;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.NSHealthShareUsageDescription =
      "Allow Anthra to read steps and workouts from Apple Health for Activity Buddy.";
    config.modResults.NSMotionUsageDescription =
      "Allow Anthra to count daily steps from this iPhone for Activity Buddy.";
    return config;
  });

  return config;
};

module.exports = withAnthraActivity;
