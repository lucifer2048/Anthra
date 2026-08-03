export type VaultPinAttemptPolicy = Readonly<{
  /**
   * Delay applied after each consecutive failed attempt. Attempts beyond the
   * final entry reuse that entry, subject to `maxLockoutMs`.
   */
  failureDelaysMs: readonly number[];
  maxLockoutMs: number;
}>;

export type VaultPinAttemptState = Readonly<{
  failedAttempts: number;
  lockedUntilMs: number;
}>;

export type VaultPinAttemptStatus = Readonly<{
  canAttempt: boolean;
  failedAttempts: number;
  remainingWaitMs: number;
  remainingWaitSeconds: number;
}>;

export const DEFAULT_VAULT_PIN_ATTEMPT_POLICY: VaultPinAttemptPolicy = Object.freeze({
  // Two forgiving attempts, followed by increasingly expensive retries.
  failureDelaysMs: Object.freeze([
    0,
    0,
    5_000,
    15_000,
    30_000,
    60_000,
    120_000,
    300_000,
  ]),
  maxLockoutMs: 300_000,
});

export const INITIAL_VAULT_PIN_ATTEMPT_STATE: VaultPinAttemptState = Object.freeze({
  failedAttempts: 0,
  lockedUntilMs: 0,
});

function safeWholeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function lockoutDelayMs(
  failedAttempts: number,
  policy: VaultPinAttemptPolicy,
): number {
  const delays = policy.failureDelaysMs;
  if (failedAttempts <= 0 || delays.length === 0) return 0;

  const delayIndex = Math.min(failedAttempts - 1, delays.length - 1);
  const configuredDelay = safeWholeNumber(delays[delayIndex] ?? 0);
  const maximumDelay = safeWholeNumber(policy.maxLockoutMs);
  return Math.min(configuredDelay, maximumDelay);
}

/**
 * Returns whether PIN verification is currently allowed. Supplying the time
 * keeps the policy deterministic and makes it straightforward to use with
 * either `Date.now()` in the app or a fixed clock in tests.
 */
export function getVaultPinAttemptStatus(
  state: VaultPinAttemptState,
  nowMs: number,
): VaultPinAttemptStatus {
  const now = safeWholeNumber(nowMs);
  const lockedUntilMs = safeWholeNumber(state.lockedUntilMs);
  const remainingWaitMs = Math.max(0, lockedUntilMs - now);

  return {
    canAttempt: remainingWaitMs === 0,
    failedAttempts: safeWholeNumber(state.failedAttempts),
    remainingWaitMs,
    remainingWaitSeconds: Math.ceil(remainingWaitMs / 1_000),
  };
}

/**
 * Records one failed verification. Calls made during an active lockout are
 * ignored so repeated taps cannot escalate the counter without a real PIN
 * comparison.
 */
export function registerVaultPinFailure(
  state: VaultPinAttemptState,
  nowMs: number,
  policy: VaultPinAttemptPolicy = DEFAULT_VAULT_PIN_ATTEMPT_POLICY,
): VaultPinAttemptState {
  const now = safeWholeNumber(nowMs);
  if (!getVaultPinAttemptStatus(state, now).canAttempt) return state;

  const failedAttempts = safeWholeNumber(state.failedAttempts) + 1;
  const delayMs = lockoutDelayMs(failedAttempts, policy);
  const lockedUntilMs = Math.min(Number.MAX_SAFE_INTEGER, now + delayMs);

  return {
    failedAttempts,
    lockedUntilMs,
  };
}

/** A successful PIN check clears all accumulated failures and wait time. */
export function registerVaultPinSuccess(): VaultPinAttemptState {
  return INITIAL_VAULT_PIN_ATTEMPT_STATE;
}
