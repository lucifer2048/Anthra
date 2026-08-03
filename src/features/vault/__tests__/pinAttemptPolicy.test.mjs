import assert from "node:assert/strict";
import test from "node:test";

import pinAttemptPolicy from "../pinAttemptPolicy.ts";

const {
  DEFAULT_VAULT_PIN_ATTEMPT_POLICY,
  INITIAL_VAULT_PIN_ATTEMPT_STATE,
  getVaultPinAttemptStatus,
  registerVaultPinFailure,
  registerVaultPinSuccess,
} = pinAttemptPolicy;

test("allows two forgiving failures before applying a short lockout", () => {
  let state = INITIAL_VAULT_PIN_ATTEMPT_STATE;

  state = registerVaultPinFailure(state, 1_000);
  assert.deepEqual(getVaultPinAttemptStatus(state, 1_000), {
    canAttempt: true,
    failedAttempts: 1,
    remainingWaitMs: 0,
    remainingWaitSeconds: 0,
  });

  state = registerVaultPinFailure(state, 1_100);
  assert.equal(getVaultPinAttemptStatus(state, 1_100).canAttempt, true);

  state = registerVaultPinFailure(state, 2_000);
  assert.deepEqual(getVaultPinAttemptStatus(state, 2_001), {
    canAttempt: false,
    failedAttempts: 3,
    remainingWaitMs: 4_999,
    remainingWaitSeconds: 5,
  });
  assert.equal(getVaultPinAttemptStatus(state, 7_000).canAttempt, true);
});

test("ignores repeated failure registrations while a lockout is active", () => {
  let state = INITIAL_VAULT_PIN_ATTEMPT_STATE;
  state = registerVaultPinFailure(state, 0);
  state = registerVaultPinFailure(state, 0);
  state = registerVaultPinFailure(state, 0);

  const duplicateFailure = registerVaultPinFailure(state, 1_000);

  assert.strictEqual(duplicateFailure, state);
  assert.equal(duplicateFailure.failedAttempts, 3);
  assert.equal(duplicateFailure.lockedUntilMs, 5_000);
});

test("steps up delays across real attempts and caps the wait at five minutes", () => {
  let state = INITIAL_VAULT_PIN_ATTEMPT_STATE;
  const expectedDelays = [0, 0, 5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 300_000];
  let nowMs = 10_000;

  expectedDelays.forEach((expectedDelayMs, index) => {
    state = registerVaultPinFailure(state, nowMs);
    assert.equal(state.failedAttempts, index + 1);
    assert.equal(state.lockedUntilMs - nowMs, expectedDelayMs);
    nowMs = state.lockedUntilMs;
  });

  assert.equal(
    DEFAULT_VAULT_PIN_ATTEMPT_POLICY.maxLockoutMs,
    5 * 60 * 1_000,
  );
});

test("a successful PIN verification resets failures and any active wait", () => {
  let state = INITIAL_VAULT_PIN_ATTEMPT_STATE;
  state = registerVaultPinFailure(state, 500);
  state = registerVaultPinFailure(state, 500);
  state = registerVaultPinFailure(state, 500);

  const resetState = registerVaultPinSuccess();

  assert.deepEqual(resetState, {
    failedAttempts: 0,
    lockedUntilMs: 0,
  });
  assert.equal(getVaultPinAttemptStatus(resetState, 500).canAttempt, true);
});

test("custom policies are still constrained by their maximum lockout", () => {
  const customPolicy = {
    failureDelaysMs: [60_000],
    maxLockoutMs: 2_000,
  };

  const state = registerVaultPinFailure(
    INITIAL_VAULT_PIN_ATTEMPT_STATE,
    100,
    customPolicy,
  );

  assert.equal(state.lockedUntilMs, 2_100);
  assert.equal(getVaultPinAttemptStatus(state, 101).remainingWaitSeconds, 2);
});
