import assert from "node:assert/strict";
import test from "node:test";

import editorPrivacy from "../editorPrivacy.ts";

const {
  INITIAL_VAULT_EDITOR_PRIVACY_STATE,
  vaultEditorPrivacyReducer,
} = editorPrivacy;

test("reset hides the secret and clears generation state", () => {
  const exposedState = {
    secretVisible: true,
    generating: true,
    activeGenerationId: 12,
  };

  assert.deepEqual(vaultEditorPrivacyReducer(exposedState, { type: "reset" }), {
    secretVisible: false,
    generating: false,
    activeGenerationId: null,
  });
});

test("a stale generator cannot expose a secret after reset", () => {
  const generatingState = vaultEditorPrivacyReducer(
    INITIAL_VAULT_EDITOR_PRIVACY_STATE,
    { type: "generation-started", generationId: 1 },
  );
  const closedState = vaultEditorPrivacyReducer(generatingState, { type: "reset" });
  const staleCompletionState = vaultEditorPrivacyReducer(closedState, {
    type: "generation-succeeded",
    generationId: 1,
  });

  assert.equal(staleCompletionState.secretVisible, false);
  assert.equal(staleCompletionState.generating, false);
});

test("only the active generator can reveal its generated secret", () => {
  const generatingState = vaultEditorPrivacyReducer(
    INITIAL_VAULT_EDITOR_PRIVACY_STATE,
    { type: "generation-started", generationId: 4 },
  );
  const staleCompletionState = vaultEditorPrivacyReducer(generatingState, {
    type: "generation-succeeded",
    generationId: 3,
  });
  const currentCompletionState = vaultEditorPrivacyReducer(staleCompletionState, {
    type: "generation-succeeded",
    generationId: 4,
  });

  assert.equal(staleCompletionState.secretVisible, false);
  assert.equal(staleCompletionState.generating, true);
  assert.equal(currentCompletionState.secretVisible, true);
  assert.equal(currentCompletionState.generating, false);
});

test("a failed generation stays hidden and restores controls", () => {
  const generatingState = vaultEditorPrivacyReducer(
    INITIAL_VAULT_EDITOR_PRIVACY_STATE,
    { type: "generation-started", generationId: 8 },
  );
  const failedState = vaultEditorPrivacyReducer(generatingState, {
    type: "generation-failed",
    generationId: 8,
  });

  assert.deepEqual(failedState, {
    secretVisible: false,
    generating: false,
    activeGenerationId: null,
  });
});
