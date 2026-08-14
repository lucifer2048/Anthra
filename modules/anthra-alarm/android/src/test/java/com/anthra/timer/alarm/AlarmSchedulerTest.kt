package com.anthra.timer.alarm

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class AlarmSchedulerTest {
  private val ist = ZoneId.of("Asia/Kolkata")

  @Test
  fun schedulesSameDayUsingIstEvenWhenDeviceTimezoneDiffers() {
    val config = alarm(days = listOf(1), hour = 7, minute = 0)
    val now = ZonedDateTime.of(2026, 7, 20, 6, 59, 0, 0, ist).toInstant().toEpochMilli()
    val expected = ZonedDateTime.of(2026, 7, 20, 7, 0, 0, 0, ist).toInstant().toEpochMilli()
    assertEquals(expected, AlarmScheduler.nextTrigger(config, now))
  }

  @Test
  fun movesPastAlarmToNextSelectedWeek() {
    val config = alarm(days = listOf(1), hour = 7, minute = 0)
    val now = ZonedDateTime.of(2026, 7, 20, 7, 0, 2, 0, ist).toInstant().toEpochMilli()
    val expected = ZonedDateTime.of(2026, 7, 27, 7, 0, 0, 0, ist).toInstant().toEpochMilli()
    assertEquals(expected, AlarmScheduler.nextTrigger(config, now))
  }

  @Test
  fun mapsSundayToTheAppsZeroBasedWeekday() {
    val config = alarm(days = listOf(0), hour = 8, minute = 30)
    val now = ZonedDateTime.of(2026, 7, 18, 22, 0, 0, 0, ist).toInstant().toEpochMilli()
    val expected = ZonedDateTime.of(2026, 7, 19, 8, 30, 0, 0, ist).toInstant().toEpochMilli()
    assertEquals(expected, AlarmScheduler.nextTrigger(config, now))
  }

  @Test
  fun honorsTheAlarmSpecificTimezone() {
    val london = ZoneId.of("Europe/London")
    val config = alarm(days = listOf(1), hour = 7, minute = 0).copy(timezone = "Europe/London")
    val now = ZonedDateTime.of(2026, 7, 20, 6, 59, 0, 0, london).toInstant().toEpochMilli()
    val expected = ZonedDateTime.of(2026, 7, 20, 7, 0, 0, 0, london).toInstant().toEpochMilli()
    assertEquals(expected, AlarmScheduler.nextTrigger(config, now))
  }

  private fun alarm(days: List<Int>, hour: Int, minute: Int) = AlarmConfig(
    id = 1,
    label = "Test",
    hour = hour,
    minute = minute,
    days = days,
    pushupTarget = 10,
    soundUri = "",
    soundName = "System alarm",
    enabled = true
  )
}
