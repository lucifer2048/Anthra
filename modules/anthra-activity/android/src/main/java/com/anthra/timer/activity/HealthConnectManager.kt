package com.anthra.timer.activity

import android.content.Context
import android.os.Build
import androidx.activity.result.contract.ActivityResultContract
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class HealthConnectStatus(
  val availability: String,
  val stepsPermission: Boolean,
  val exercisePermission: Boolean
) {
  val connected: Boolean
    get() = availability == "available" && stepsPermission && exercisePermission
}

data class HealthDailyTotal(
  val dateKey: String,
  val timezone: String,
  val steps: Long?,
  val originPackages: List<String>
)

data class HealthWorkout(
  val externalId: String,
  val clientRecordId: String?,
  val clientRecordVersion: Long,
  val originPackage: String,
  val title: String?,
  val exerciseType: Int,
  val startTime: Long,
  val endTime: Long,
  val lastModifiedTime: Long
)

class HealthConnectManager(private val context: Context) {
  val requestedPermissions: Set<String>
    get() {
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        "Health Connect requires Android 9 or newer."
      }
      return setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
      )
    }

  val permissionContract: ActivityResultContract<Set<String>, Set<String>>
    get() {
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        "Health Connect requires Android 9 or newer."
      }
      return PermissionController.createRequestPermissionResultContract()
    }

  fun availability(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unsupported_os"
    return when (HealthConnectClient.getSdkStatus(context)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
      else -> "unavailable"
    }
  }

  suspend fun status(): HealthConnectStatus {
    val availability = availability()
    if (availability != "available") {
      return HealthConnectStatus(availability, stepsPermission = false, exercisePermission = false)
    }
    val granted = client().permissionController.getGrantedPermissions()
    return HealthConnectStatus(
      availability = availability,
      stepsPermission = granted.contains(HealthPermission.getReadPermission(StepsRecord::class)),
      exercisePermission = granted.contains(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
      )
    )
  }

  suspend fun readDailyTotals(
    startTimeMs: Long,
    endTimeMs: Long,
    timezone: String
  ): List<HealthDailyTotal> {
    require(startTimeMs < endTimeMs) { "Start time must be before end time." }
    val status = status()
    check(status.stepsPermission) { "Health Connect step permission is not granted." }

    val zone = runCatching { ZoneId.of(timezone) }.getOrDefault(ZoneId.systemDefault())
    val result = mutableListOf<HealthDailyTotal>()
    var date = Instant.ofEpochMilli(startTimeMs).atZone(zone).toLocalDate()
    while (date.atStartOfDay(zone).toInstant().toEpochMilli() < endTimeMs) {
      val dayStart = date.atStartOfDay(zone).toInstant()
      val dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant()
      val boundedStart = if (dayStart.toEpochMilli() < startTimeMs) {
        Instant.ofEpochMilli(startTimeMs)
      } else {
        dayStart
      }
      val boundedEnd = if (dayEnd.toEpochMilli() > endTimeMs) {
        Instant.ofEpochMilli(endTimeMs)
      } else {
        dayEnd
      }

      val aggregate = client().aggregate(
        AggregateRequest(
          metrics = setOf(StepsRecord.COUNT_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(boundedStart, boundedEnd)
        )
      )
      result += HealthDailyTotal(
        dateKey = DateTimeFormatter.ISO_LOCAL_DATE.format(date),
        timezone = zone.id,
        // Null means Health Connect has no data for this day. It must remain
        // distinct from a real zero so the phone sensor can be used as fallback.
        steps = aggregate[StepsRecord.COUNT_TOTAL],
        originPackages = aggregate.dataOrigins.map { it.packageName }.distinct().sorted()
      )
      date = date.plusDays(1)
    }
    return result
  }

  suspend fun readWorkouts(startTimeMs: Long, endTimeMs: Long): List<HealthWorkout> {
    require(startTimeMs < endTimeMs) { "Start time must be before end time." }
    val status = status()
    check(status.exercisePermission) { "Health Connect exercise permission is not granted." }

    val records = mutableListOf<HealthWorkout>()
    var pageToken: String? = null
    do {
      val response = client().readRecords(
        ReadRecordsRequest(
          recordType = ExerciseSessionRecord::class,
          timeRangeFilter = TimeRangeFilter.between(
            Instant.ofEpochMilli(startTimeMs),
            Instant.ofEpochMilli(endTimeMs)
          ),
          ascendingOrder = true,
          pageSize = 1000,
          pageToken = pageToken
        )
      )
      response.records.forEach { record ->
        records += HealthWorkout(
          externalId = record.metadata.id,
          clientRecordId = record.metadata.clientRecordId,
          clientRecordVersion = record.metadata.clientRecordVersion,
          originPackage = record.metadata.dataOrigin.packageName,
          title = record.title,
          exerciseType = record.exerciseType,
          startTime = record.startTime.toEpochMilli(),
          endTime = record.endTime.toEpochMilli(),
          lastModifiedTime = record.metadata.lastModifiedTime.toEpochMilli()
        )
      }
      pageToken = response.pageToken
    } while (pageToken != null)
    return records
  }

  private fun client(): HealthConnectClient {
    check(availability() == "available") { "Health Connect is not available." }
    return HealthConnectClient.getOrCreate(context)
  }
}
