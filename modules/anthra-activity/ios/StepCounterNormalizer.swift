import Foundation

struct StepCounterState {
  let dayKey: String
  let timezone: String
  let bootCount: Int
  let baselineRaw: Int64
  let lastRaw: Int64
  let steps: Int64
}

struct StepCounterUpdate {
  let state: StepCounterState
  let rolledOverDayKey: String?
  let rolledOverTimezone: String?
  let rolledOverSteps: Int64?
  let counterReset: Bool
  let rebootDetected: Bool
  let timezoneChanged: Bool
}

enum StepCounterNormalizer {
  static func update(
    previous: StepCounterState?,
    rawReading: Int64,
    dayKey: String,
    timezone: String,
    bootCount: Int,
    permissionGranted: Bool
  ) -> StepCounterUpdate? {
    guard permissionGranted, rawReading >= 0 else { return nil }

    if previous == nil {
      return StepCounterUpdate(
        state: StepCounterState(
          dayKey: dayKey,
          timezone: timezone,
          bootCount: bootCount,
          baselineRaw: rawReading,
          lastRaw: rawReading,
          steps: 0
        ),
        rolledOverDayKey: nil,
        rolledOverTimezone: nil,
        rolledOverSteps: nil,
        counterReset: false,
        rebootDetected: false,
        timezoneChanged: false
      )
    }

    guard let previous else { return nil }
    let timezoneChanged = previous.timezone != timezone
    let dateChanged = previous.dayKey != dayKey

    if previous.bootCount == bootCount
      && (rawReading < previous.lastRaw || (!timezoneChanged && dayKey < previous.dayKey)) {
      return StepCounterUpdate(
        state: previous,
        rolledOverDayKey: nil,
        rolledOverTimezone: nil,
        rolledOverSteps: nil,
        counterReset: true,
        rebootDetected: false,
        timezoneChanged: false
      )
    }

    if timezoneChanged && !dateChanged {
      let delta = previous.bootCount == bootCount ? rawReading - previous.lastRaw : rawReading
      return StepCounterUpdate(
        state: StepCounterState(
          dayKey: previous.dayKey,
          timezone: timezone,
          bootCount: bootCount,
          baselineRaw: previous.baselineRaw,
          lastRaw: rawReading,
          steps: max(0, previous.steps) + max(0, delta)
        ),
        rolledOverDayKey: nil,
        rolledOverTimezone: nil,
        rolledOverSteps: nil,
        counterReset: false,
        rebootDetected: previous.bootCount != bootCount,
        timezoneChanged: true
      )
    }

    if dateChanged {
      let firstNewDaySteps = previous.bootCount == bootCount ? rawReading - previous.lastRaw : rawReading
      return StepCounterUpdate(
        state: StepCounterState(
          dayKey: dayKey,
          timezone: timezone,
          bootCount: bootCount,
          baselineRaw: rawReading - firstNewDaySteps,
          lastRaw: rawReading,
          steps: firstNewDaySteps
        ),
        rolledOverDayKey: previous.dayKey,
        rolledOverTimezone: previous.timezone,
        rolledOverSteps: max(0, previous.steps),
        counterReset: false,
        rebootDetected: previous.bootCount != bootCount,
        timezoneChanged: timezoneChanged
      )
    }

    if previous.bootCount != bootCount {
      let nextSteps = max(0, previous.steps) + rawReading
      return StepCounterUpdate(
        state: StepCounterState(
          dayKey: dayKey,
          timezone: timezone,
          bootCount: bootCount,
          baselineRaw: rawReading,
          lastRaw: rawReading,
          steps: nextSteps
        ),
        rolledOverDayKey: nil,
        rolledOverTimezone: nil,
        rolledOverSteps: nil,
        counterReset: false,
        rebootDetected: true,
        timezoneChanged: false
      )
    }

    let delta = rawReading - previous.lastRaw
    return StepCounterUpdate(
      state: StepCounterState(
        dayKey: dayKey,
        timezone: timezone,
        bootCount: bootCount,
        baselineRaw: previous.baselineRaw,
        lastRaw: rawReading,
        steps: max(0, previous.steps) + delta
      ),
      rolledOverDayKey: nil,
      rolledOverTimezone: nil,
      rolledOverSteps: nil,
      counterReset: false,
      rebootDetected: false,
      timezoneChanged: false
    )
  }
}

struct StepDaySnapshot {
  let dateKey: String
  let timezone: String
  let steps: Int64
}
