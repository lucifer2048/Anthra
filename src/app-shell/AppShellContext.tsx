import { createContext, useContext, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Animated } from "react-native";

import type { WorkoutTab } from "../components/WorkoutTabBar";
import type { ReminderTab } from "../components/ReminderTabBar";
import type { ThemeMode } from "../design-system";
import type {
  ActiveWorkoutSnapshot,
  DashboardStats,
  UserSettings,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary,
  WorkoutTimerState
} from "../types";

export type ModuleTheme = {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  icon: string;
  onAccent: string;
};

export type AppShellContextValue = {
  ready: boolean;
  bootstrapError: string | null;
  bootstrapAttempt: number;
  setBootstrapAttempt: Dispatch<SetStateAction<number>>;
  themeMode: ThemeMode;
  systemColorScheme: "light" | "dark" | null | undefined;
  handleThemeModeChange: (mode: ThemeMode) => void;
  appBackground: string;
  moduleTheme: ModuleTheme;

  plans: WorkoutPlan[];
  stats: DashboardStats;
  history: WorkoutHistoryEntry[];
  todayWorkoutPlans: WorkoutPlan[];
  enabledReminderCount: number;
  recoverableWorkout: ActiveWorkoutSnapshot | null;

  activeTab: WorkoutTab;
  setActiveTab: Dispatch<SetStateAction<WorkoutTab>>;
  planListMode: "all" | "today";
  setPlanListMode: Dispatch<SetStateAction<"all" | "today">>;

  editorOpen: boolean;
  editingPlan: WorkoutPlan | null;
  setEditorOpen: Dispatch<SetStateAction<boolean>>;
  setEditingPlan: Dispatch<SetStateAction<WorkoutPlan | null>>;

  activePlan: WorkoutPlan | null;
  activeSessionId: number | null;
  activeTimerInitialState: WorkoutTimerState | null;

  profileHeightCm: string;
  profileWeightKg: string;
  profileGoal: string;
  profileSaving: boolean;
  profileNotice: { type: "success" | "error"; message: string } | null;
  handleProfileHeightChange: (value: string) => void;
  handleProfileWeightChange: (value: string) => void;
  handleProfileGoalChange: (value: string) => void;
  handleSaveProfile: () => Promise<void>;

  settings: UserSettings;
  weeklyGoalText: string;
  reminderHourText: string;
  reminderMinuteText: string;
  reminderCount: number;
  reminderLeadTexts: string[];
  settingsSaving: boolean;
  settingsNotice: { type: "success" | "error"; message: string } | null;
  setWeeklyGoalText: Dispatch<SetStateAction<string>>;
  setReminderHourText: Dispatch<SetStateAction<string>>;
  setReminderMinuteText: Dispatch<SetStateAction<string>>;
  setReminderCount: Dispatch<SetStateAction<number>>;
  updateReminderLeadText: (index: number, value: string) => void;
  toggleGlobalWorkoutDay: (day: number) => void;
  setSettings: Dispatch<SetStateAction<UserSettings>>;
  clearSettingsNotice: () => void;
  handleSaveSettings: () => Promise<void>;
  handleExportBackup: () => Promise<void>;
  handleImportBackup: () => Promise<void>;
  backupBusy: boolean;

  feedbackOpen: boolean;
  feedbackNoteModalOpen: boolean;
  feedbackPlanName: string;
  feedbackRating: number;
  feedbackComment: string;
  feedbackSaving: boolean;
  setFeedbackRating: Dispatch<SetStateAction<number>>;
  setFeedbackComment: Dispatch<SetStateAction<string>>;
  setFeedbackNoteModalOpen: Dispatch<SetStateAction<boolean>>;
  setFeedbackOpen: Dispatch<SetStateAction<boolean>>;
  handleSubmitFeedback: () => Promise<void>;

  showSplashOverlay: boolean;
  splashOpacity: Animated.Value;
  keyboardHeight: number;
  keyboardSafeBottomPadding: number;

  hubScrollOffsetRef: MutableRefObject<number>;
  handleHubCardsAnimated: () => void;
  hasAnimatedHubCards: boolean;

  openCreatePlan: () => void;
  openEditPlan: (plan: WorkoutPlan) => void;
  handleSavePlan: (plan: WorkoutPlanInput) => Promise<boolean>;
  handleDeletePlan: (plan: WorkoutPlan) => void;
  handleSharePlan: (plan: WorkoutPlan) => Promise<void>;
  handleImportPlan: () => void;
  handleDeleteHistoryEntry: (entry: WorkoutHistoryEntry) => void;
  handleStartPlan: (plan: WorkoutPlan) => Promise<void>;
  handleWorkoutComplete: (summary: WorkoutRunSummary) => Promise<void>;
  closeTimer: (summary: WorkoutRunSummary) => Promise<void>;
  handleTimerStateChange: (timer: WorkoutTimerState) => void;
  resumeInterruptedWorkout: () => void;
  endInterruptedWorkout: () => void;

  onOpenWorkout: () => void;
  onChooseTodayWorkout: () => void;
  onOpenActivity: () => void;
  onOpenNutrition: () => void;
  onOpenReminders: () => void;
  onOpenTracker: () => void;
  onOpenLists: () => void;
  onOpenAlarms: () => void;
  onOpenVault: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenFriends: () => void;
  onOpenFriendsLeaderboard: () => void;
  onHubScrollOffsetChange: (offset: number) => void;

  onCloseEditor: () => void;
  onOpenAccountFromFriends: () => void;
  onReminderBack: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell must be used within AppShellProvider");
  }
  return value;
}

export { AppShellContext };
