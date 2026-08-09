export type FriendshipStatus = "pending" | "accepted" | "declined";

export type SocialPerson = {
  userId: string;
  displayName: string;
  handle: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  friendshipId: string | null;
  friendshipStatus: FriendshipStatus | null;
  requestDirection: "incoming" | "outgoing" | null;
};

export type SocialOverview = {
  friends: SocialPerson[];
  incoming: SocialPerson[];
  outgoing: SocialPerson[];
};

export type SocialPrivacy = {
  shareSteps: boolean;
  shareWorkoutStreak: boolean;
  shareWorkoutCount: boolean;
  appearInLeaderboards: boolean;
  shareActivityNotifications: boolean;
  receiveActivityNotifications: boolean;
};

export type FriendActivityKind = "workout_started" | "daily_step_goal_completed";

export type LeaderboardMetric = "steps" | "workouts" | "streak";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  steps: number | null;
  workoutCount: number | null;
  workoutStreak: number | null;
  isCurrentUser: boolean;
};

export type SocialSnapshot = {
  accountId: string;
  dateKey: string;
  overview: SocialOverview;
  privacy: SocialPrivacy;
  leaderboard: LeaderboardEntry[];
  fetchedAt: number;
};
