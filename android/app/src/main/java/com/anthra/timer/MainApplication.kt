package com.anthra.timer

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper
// @generated begin anthra-activity-imports - expo prebuild (DO NOT MODIFY) sync-526d2de17ed41241c3e2d346c5cd992ade4fc018
import com.anthra.timer.alarm.AnthraAlarmPackage
import com.anthra.timer.activity.AnthraActivityPackage
import com.anthra.timer.activity.StepCounterManager
import com.anthra.timer.activity.StepTrackingService
// @generated end anthra-activity-imports

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
// @generated begin anthra-activity-packages - expo prebuild (DO NOT MODIFY) sync-31732fe96425679dd546daa17b3936d3f508e885
              add(AnthraAlarmPackage())
              add(AnthraActivityPackage())
// @generated end anthra-activity-packages
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
// @generated begin anthra-activity-step-autostart - expo prebuild (DO NOT MODIFY) sync-9079c6545f467f5dda7320d09d4f68895dd95a9b
    val stepCounter = StepCounterManager(applicationContext)
    if (stepCounter.isTrackingEnabled() && stepCounter.hasPermission() && stepCounter.hasStepCounter()) {
      runCatching { StepTrackingService.start(applicationContext) }
    }
// @generated end anthra-activity-step-autostart
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
