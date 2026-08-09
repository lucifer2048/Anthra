import assert from "node:assert/strict";
import test from "node:test";

import onboardingPolicy from "../onboardingPolicy.ts";

const { resolveAccountGateDecision } = onboardingPolicy;

const fresh = {
  installKind: "new",
  onboardingState: "pending",
  linkedAuthUserId: null
};
const legacy = {
  installKind: "legacy",
  onboardingState: "pending",
  linkedAuthUserId: null
};

function decide(overrides = {}) {
  return resolveAccountGateDecision({
    localDataReady: true,
    onboardingLoading: false,
    installation: fresh,
    hasSession: false,
    sessionUserId: null,
    legacyImportPrepared: false,
    ...overrides
  });
}

test("new installations must authenticate before entering the app", () => {
  assert.equal(decide(), "authenticate");
  assert.equal(decide({ hasSession: true }), "migrate");
  assert.equal(decide({ hasSession: true, legacyImportPrepared: true }), "app");
});

test("legacy installations may defer only before an account is linked", () => {
  assert.equal(decide({ installation: legacy }), "authenticate");
  assert.equal(
    decide({ installation: { ...legacy, onboardingState: "deferred" } }),
    "app"
  );
  assert.equal(
    decide({
      installation: {
        ...legacy,
        onboardingState: "complete",
        linkedAuthUserId: "auth-user-1"
      }
    }),
    "authenticate"
  );
});

test("signing in from deferred legacy mode blocks until migration verifies", () => {
  const deferred = { ...legacy, onboardingState: "deferred" };
  assert.equal(decide({ installation: deferred, hasSession: true }), "migrate");
  assert.equal(
    decide({ installation: deferred, hasSession: true, legacyImportPrepared: true }),
    "app"
  );
});

test("an already-linked account opens immediately while background sync retries", () => {
  const linked = {
    ...legacy,
    onboardingState: "complete",
    linkedAuthUserId: "auth-user-1"
  };
  assert.equal(
    decide({ installation: linked, hasSession: true, sessionUserId: "auth-user-1" }),
    "app"
  );
  assert.equal(
    decide({ installation: linked, hasSession: true, sessionUserId: "different-user" }),
    "migrate"
  );
});

test("startup continues showing the existing local bootstrap UI until SQLite is ready", () => {
  assert.equal(decide({ localDataReady: false, onboardingLoading: true }), "app");
});
