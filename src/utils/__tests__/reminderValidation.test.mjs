import assert from "node:assert/strict";
import test from "node:test";

import reminderValidation from "../reminderValidation.ts";

const { parseReminderDateParts, validateOneTimeReminder } = reminderValidation;

test("calendar dates reject invalid and normalized-overflow values", () => {
  assert.equal(parseReminderDateParts("2026-02-29"), null);
  assert.equal(parseReminderDateParts("2026-13-01"), null);
  assert.deepEqual(parseReminderDateParts("2028-02-29"), { year: 2028, month: 2, day: 29 });
});

test("one-time reminders must be in the future in their selected timezone", () => {
  const nowMs = Date.UTC(2026, 6, 31, 10, 0, 0); // 15:30 in Asia/Kolkata

  assert.equal(
    validateOneTimeReminder({
      dateLabel: "2026-07-31",
      hour: 15,
      minute: 0,
      timeZone: "Asia/Kolkata",
      nowMs
    }),
    "Choose a time in the future for a one-time reminder."
  );
  assert.equal(
    validateOneTimeReminder({
      dateLabel: "2026-07-31",
      hour: 16,
      minute: 0,
      timeZone: "Asia/Kolkata",
      nowMs
    }),
    null
  );
});
