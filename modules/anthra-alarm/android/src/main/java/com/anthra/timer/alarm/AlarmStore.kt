package com.anthra.timer.alarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class AlarmConfig(
  val id: Int,
  val label: String,
  val hour: Int,
  val minute: Int,
  val days: List<Int>,
  val pushupTarget: Int,
  val soundUri: String,
  val soundName: String,
  val enabled: Boolean,
  val timezone: String = AlarmStore.TIMEZONE,
  val requiresPushups: Boolean = true
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("label", label)
    put("hour", hour)
    put("minute", minute)
    put("days", JSONArray(days))
    put("pushupTarget", pushupTarget)
    put("soundUri", soundUri)
    put("soundName", soundName)
    put("enabled", enabled)
    put("timezone", timezone)
    put("requiresPushups", requiresPushups)
  }

  companion object {
    fun fromJson(json: JSONObject): AlarmConfig {
      val id = json.getInt("id")
      val rawDays = json.optJSONArray("days") ?: JSONArray()
      val days = buildList {
        for (index in 0 until rawDays.length()) {
          val day = rawDays.optInt(index, -1)
          if (day in 0..6 && !contains(day)) add(day)
        }
      }.ifEmpty { listOf(0, 1, 2, 3, 4, 5, 6) }

      return AlarmConfig(
        id = id,
        label = json.optString("label", "Push-up alarm").take(80),
        hour = json.optInt("hour", 7).coerceIn(0, 23),
        minute = json.optInt("minute", 0).coerceIn(0, 59),
        days = days,
        pushupTarget = json.optInt("pushupTarget", 10).coerceIn(1, 100),
        soundUri = json.optString("soundUri", ""),
        soundName = json.optString("soundName", "System alarm").take(120),
        enabled = json.optBoolean("enabled", true),
        timezone = json.optString("timezone", AlarmStore.TIMEZONE).ifBlank { AlarmStore.TIMEZONE }.take(80),
        // Workout alarms used reserved negative IDs before this field existed.
        // Preserve them as regular alarms across app upgrades and reboots.
        requiresPushups = if (json.has("requiresPushups")) json.optBoolean("requiresPushups", id > 0) else id > 0
      )
    }
  }
}

object AlarmStore {
  const val TIMEZONE = "Asia/Kolkata"
  const val EXTRA_ALARM_ID = "anthra_alarm_id"
  const val EXTRA_FIRED_AT = "anthra_alarm_fired_at"
  const val EXTRA_TEST_MODE = "anthra_alarm_test_mode"
  const val EXTRA_TEST_TARGET = "anthra_alarm_test_target"
  const val EXTRA_DISMISS = "anthra_alarm_dismiss"

  private const val PREFS = "anthra.pushup.alarms.v1"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_COMPLETIONS = "completion_events"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun save(context: Context, config: AlarmConfig) {
    val root = readAlarmRoot(context)
    root.put(config.id.toString(), config.toJson())
    prefs(context).edit().putString(KEY_ALARMS, root.toString()).apply()
  }

  @Synchronized
  fun remove(context: Context, alarmId: Int) {
    val root = readAlarmRoot(context)
    root.remove(alarmId.toString())
    prefs(context).edit().putString(KEY_ALARMS, root.toString()).apply()
  }

  @Synchronized
  fun clearAlarms(context: Context) {
    prefs(context).edit().putString(KEY_ALARMS, "{}").apply()
  }

  fun get(context: Context, alarmId: Int): AlarmConfig? {
    val root = readAlarmRoot(context)
    val json = root.optJSONObject(alarmId.toString()) ?: return null
    return runCatching { AlarmConfig.fromJson(json) }.getOrNull()
  }

  fun all(context: Context): List<AlarmConfig> {
    val root = readAlarmRoot(context)
    return buildList {
      val keys = root.keys()
      while (keys.hasNext()) {
        val json = root.optJSONObject(keys.next()) ?: continue
        runCatching { AlarmConfig.fromJson(json) }.getOrNull()?.let(::add)
      }
    }
  }

  @Synchronized
  fun addCompletion(
    context: Context,
    config: AlarmConfig,
    firedAt: Long,
    completedReps: Int,
    status: String
  ) {
    // Reserved negative IDs belong to workout reminders, not Alarm Buddy.
    // They should not appear in the Alarm Buddy completion history.
    if (config.id < 0) return
    val entries = readCompletions(context)
    entries.put(JSONObject().apply {
      put("eventId", UUID.randomUUID().toString())
      put("alarmId", config.id.takeIf { it > 0 } ?: JSONObject.NULL)
      put("label", config.label)
      put("firedAt", firedAt)
      put("completedAt", System.currentTimeMillis())
      put("targetReps", config.pushupTarget)
      put("completedReps", completedReps.coerceAtLeast(0))
      put("status", if (status == "emergency_stopped") "emergency_stopped" else "completed")
    })

    val trimmed = JSONArray()
    val start = (entries.length() - 200).coerceAtLeast(0)
    for (index in start until entries.length()) trimmed.put(entries.optJSONObject(index))
    prefs(context).edit().putString(KEY_COMPLETIONS, trimmed.toString()).apply()
  }

  @Synchronized
  fun consumeCompletions(context: Context): JSONArray {
    val entries = readCompletions(context)
    prefs(context).edit().remove(KEY_COMPLETIONS).commit()
    return entries
  }

  private fun readAlarmRoot(context: Context): JSONObject = runCatching {
    JSONObject(prefs(context).getString(KEY_ALARMS, "{}") ?: "{}")
  }.getOrElse { JSONObject() }

  private fun readCompletions(context: Context): JSONArray = runCatching {
    JSONArray(prefs(context).getString(KEY_COMPLETIONS, "[]") ?: "[]")
  }.getOrElse { JSONArray() }
}
