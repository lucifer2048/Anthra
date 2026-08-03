export type VaultEditorPrivacyState = {
  secretVisible: boolean;
  generating: boolean;
  activeGenerationId: number | null;
};

export type VaultEditorPrivacyAction =
  | { type: "reset" }
  | { type: "toggle-secret-visibility" }
  | { type: "generation-started"; generationId: number }
  | { type: "generation-succeeded"; generationId: number }
  | { type: "generation-failed"; generationId: number };

export const INITIAL_VAULT_EDITOR_PRIVACY_STATE: VaultEditorPrivacyState = {
  secretVisible: false,
  generating: false,
  activeGenerationId: null,
};

export function vaultEditorPrivacyReducer(
  state: VaultEditorPrivacyState,
  action: VaultEditorPrivacyAction,
): VaultEditorPrivacyState {
  switch (action.type) {
    case "reset":
      return INITIAL_VAULT_EDITOR_PRIVACY_STATE;
    case "toggle-secret-visibility":
      return { ...state, secretVisible: !state.secretVisible };
    case "generation-started":
      return {
        ...state,
        generating: true,
        activeGenerationId: action.generationId,
      };
    case "generation-succeeded":
      if (state.activeGenerationId !== action.generationId) {
        return state;
      }
      return {
        secretVisible: true,
        generating: false,
        activeGenerationId: null,
      };
    case "generation-failed":
      if (state.activeGenerationId !== action.generationId) {
        return state;
      }
      return {
        ...state,
        generating: false,
        activeGenerationId: null,
      };
  }
}
