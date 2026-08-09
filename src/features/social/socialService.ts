import type { SupabaseClient } from "@supabase/supabase-js";

import { getCompletedWorkoutCountInRange, getDashboardStats } from "../../db";
import { getActivityDailySummary, getActivitySettings } from "../activity/activityRepository";
import {
  getDayPartsInTimeZone,
  getDeviceTimeZone,
  getTodayLabelInTimeZone,
  zonedDateTimeToTimestamp
} from "../../utils/timezone";
import type {
  FriendshipStatus,
  LeaderboardEntry,
  SocialOverview,
  SocialPerson,
  SocialPrivacy,
  FriendActivityKind
} from "./socialTypes";

const AVATAR_BUCKET = "anthra-profile-avatars";
const AVATAR_URL_TTL_SECONDS = 60 * 60;
const AVATAR_CACHE_SAFETY_MS = 5 * 60 * 1000;

type CachedAvatarUrl = { url: string; expiresAt: number };
const avatarUrlCache = new Map<string, CachedAvatarUrl>();

type FriendshipRow = {
  id: string;
  user_low_id: string;
  user_high_id: string;
  requested_by: string;
  status: FriendshipStatus;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_path: string | null;
};

function asStatus(value: unknown): FriendshipStatus | null {
  return value === "pending" || value === "accepted" || value === "declined" ? value : null;
}

function avatarCacheKey(currentUserId: string, path: string): string {
  return `${currentUserId}:${path}`;
}

export function clearSocialAvatarCache(currentUserId?: string): void {
  if (!currentUserId) {
    avatarUrlCache.clear();
    return;
  }
  const prefix = `${currentUserId}:`;
  for (const key of avatarUrlCache.keys()) {
    if (key.startsWith(prefix)) avatarUrlCache.delete(key);
  }
}

async function avatarUrls(
  client: SupabaseClient,
  currentUserId: string,
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const now = Date.now();
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of uniquePaths) {
    const cached = avatarUrlCache.get(avatarCacheKey(currentUserId, path));
    if (cached && cached.expiresAt - AVATAR_CACHE_SAFETY_MS > now) result.set(path, cached.url);
    else missing.push(path);
  }
  if (missing.length > 0) {
    const { data, error } = await client.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(missing, AVATAR_URL_TTL_SECONDS);
    if (!error) {
      for (const item of data ?? []) {
        if (!item.signedUrl || item.error) continue;
        const path = String(item.path);
        result.set(path, item.signedUrl);
        avatarUrlCache.set(avatarCacheKey(currentUserId, path), {
          url: item.signedUrl,
          expiresAt: now + AVATAR_URL_TTL_SECONDS * 1000
        });
      }
    }
  }
  return result;
}

async function hydratePerson(
  profile: ProfileRow,
  friendship: FriendshipRow | null,
  currentUserId: string,
  signedUrls: Map<string, string>
): Promise<SocialPerson> {
  return {
    userId: profile.user_id,
    displayName: profile.display_name?.trim() || profile.handle || "Anthra user",
    handle: profile.handle ?? "",
    avatarPath: profile.avatar_path,
    avatarUrl: profile.avatar_path ? signedUrls.get(profile.avatar_path) ?? null : null,
    friendshipId: friendship?.id ?? null,
    friendshipStatus: friendship?.status ?? null,
    requestDirection:
      friendship?.status === "pending"
        ? friendship.requested_by === currentUserId
          ? "outgoing"
          : "incoming"
        : null
  };
}

export async function loadSocialOverview(
  client: SupabaseClient,
  currentUserId: string
): Promise<SocialOverview> {
  const { data: friendshipData, error: friendshipError } = await client
    .from("friendships")
    .select("id,user_low_id,user_high_id,requested_by,status")
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });
  if (friendshipError) throw friendshipError;
  const friendships = (friendshipData ?? []) as FriendshipRow[];
  const userIds = friendships.map((row) =>
    row.user_low_id === currentUserId ? row.user_high_id : row.user_low_id
  );
  if (userIds.length === 0) return { friends: [], incoming: [], outgoing: [] };

  const { data: profileData, error: profileError } = await client
    .from("profiles")
    .select("user_id,display_name,handle,avatar_path")
    .in("user_id", [...new Set(userIds)]);
  if (profileError) throw profileError;
  const profiles = new Map(
    ((profileData ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile])
  );
  const signedUrls = await avatarUrls(
    client,
    currentUserId,
    [...profiles.values()].map((profile) => profile.avatar_path)
  );
  const people = await Promise.all(
    friendships.map(async (friendship) => {
      const otherId =
        friendship.user_low_id === currentUserId
          ? friendship.user_high_id
          : friendship.user_low_id;
      const profile = profiles.get(otherId) ?? {
        user_id: otherId,
        display_name: "Anthra user",
        handle: null,
        avatar_path: null
      };
      return hydratePerson(profile, friendship, currentUserId, signedUrls);
    })
  );
  return {
    friends: people.filter((person) => person.friendshipStatus === "accepted"),
    incoming: people.filter((person) => person.requestDirection === "incoming"),
    outgoing: people.filter((person) => person.requestDirection === "outgoing")
  };
}

export async function searchPeople(
  client: SupabaseClient,
  currentUserId: string,
  query: string
): Promise<SocialPerson[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const { data, error } = await client.rpc("search_anthra_profiles", {
    search_text: normalized,
    result_limit: 20
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    user_id: string;
    display_name: string | null;
    handle: string | null;
    avatar_path: string | null;
    friendship_id: string | null;
    friendship_status: string | null;
    requested_by: string | null;
  }>;
  const signedUrls = await avatarUrls(client, currentUserId, rows.map((row) => row.avatar_path));
  return Promise.all(
    rows.map((row) =>
      hydratePerson(
        {
          user_id: row.user_id,
          display_name: row.display_name,
          handle: row.handle,
          avatar_path: row.avatar_path
        },
        row.friendship_id && asStatus(row.friendship_status)
          ? {
              id: row.friendship_id,
              user_low_id: "",
              user_high_id: "",
              requested_by: row.requested_by ?? "",
              status: asStatus(row.friendship_status)!
            }
          : null,
        currentUserId,
        signedUrls
      )
    )
  );
}

export async function sendFriendRequest(client: SupabaseClient, targetUserId: string): Promise<void> {
  const { error } = await client.rpc("send_friend_request", { target_user: targetUserId });
  if (error) throw error;
}

export async function respondToFriendRequest(
  client: SupabaseClient,
  requestId: string,
  accept: boolean
): Promise<void> {
  const { error } = await client.rpc("respond_to_friend_request", {
    request_id: requestId,
    accept_request: accept
  });
  if (error) throw error;
}

export async function cancelFriendRequest(client: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await client.rpc("cancel_friend_request", { request_id: requestId });
  if (error) throw error;
}

export async function removeFriend(client: SupabaseClient, friendshipId: string): Promise<void> {
  const { error } = await client.rpc("remove_friend", { friendship_id: friendshipId });
  if (error) throw error;
}

export async function loadSocialPrivacy(
  client: SupabaseClient,
  userId: string
): Promise<SocialPrivacy> {
  const fullResult = await client
    .from("privacy_settings")
    .select("share_steps,share_workout_streak,share_workout_count,appear_in_leaderboards,share_activity_notifications,receive_activity_notifications")
    .eq("user_id", userId)
    .maybeSingle();
  let data = fullResult.data;
  if (fullResult.error) {
    const message = fullResult.error.message.toLowerCase();
    const missingNotificationColumns =
      fullResult.error.code === "42703"
      || fullResult.error.code === "PGRST204"
      || message.includes("share_activity_notifications")
      || message.includes("receive_activity_notifications");
    if (!missingNotificationColumns) throw fullResult.error;
    const legacyResult = await client
      .from("privacy_settings")
      .select("share_steps,share_workout_streak,share_workout_count,appear_in_leaderboards")
      .eq("user_id", userId)
      .maybeSingle();
    if (legacyResult.error) throw legacyResult.error;
    data = legacyResult.data
      ? { ...legacyResult.data, share_activity_notifications: false, receive_activity_notifications: false }
      : null;
  }
  return {
    shareSteps: Boolean(data?.share_steps),
    shareWorkoutStreak: Boolean(data?.share_workout_streak),
    shareWorkoutCount: Boolean(data?.share_workout_count),
    appearInLeaderboards: Boolean(data?.appear_in_leaderboards),
    shareActivityNotifications: Boolean(data?.share_activity_notifications),
    receiveActivityNotifications: Boolean(data?.receive_activity_notifications)
  };
}

export async function saveSocialPrivacy(
  client: SupabaseClient,
  userId: string,
  privacy: SocialPrivacy
): Promise<void> {
  const { error } = await client.from("privacy_settings").upsert(
    {
      user_id: userId,
      share_steps: privacy.shareSteps,
      share_workout_streak: privacy.shareWorkoutStreak,
      share_workout_count: privacy.shareWorkoutCount,
      appear_in_leaderboards: privacy.appearInLeaderboards,
      share_activity_notifications: privacy.shareActivityNotifications,
      receive_activity_notifications: privacy.receiveActivityNotifications,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
  if (error) {
    const message = error.message.toLowerCase();
    const missingNotificationColumns =
      error.code === "42703"
      || error.code === "PGRST204"
      || message.includes("share_activity_notifications")
      || message.includes("receive_activity_notifications");
    if (!missingNotificationColumns) throw error;
    if (privacy.shareActivityNotifications || privacy.receiveActivityNotifications) {
      throw new Error("Friend activity notifications require Supabase migration 007.");
    }
    const { error: legacyError } = await client.from("privacy_settings").upsert(
      {
        user_id: userId,
        share_steps: privacy.shareSteps,
        share_workout_streak: privacy.shareWorkoutStreak,
        share_workout_count: privacy.shareWorkoutCount,
        appear_in_leaderboards: privacy.appearInLeaderboards,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (legacyError) throw legacyError;
  }
}

export async function publishFriendActivityEvent(
  client: SupabaseClient,
  kind: FriendActivityKind
): Promise<void> {
  const timezone = getDeviceTimeZone();
  const { error } = await client.functions.invoke("notify-friend-activity", {
    body: {
      kind,
      dateKey: getTodayLabelInTimeZone(timezone),
      timezone,
      occurredAt: new Date().toISOString()
    }
  });
  if (error) throw error;
}

export async function publishTodaySocialStats(client: SupabaseClient): Promise<void> {
  const timezone = getDeviceTimeZone();
  const dateKey = getTodayLabelInTimeZone(timezone);
  const day = getDayPartsInTimeZone(Date.now(), 0, timezone);
  const nextDay = getDayPartsInTimeZone(Date.now(), 1, timezone);
  const start = zonedDateTimeToTimestamp(day.year, day.month, day.day, 0, 0, timezone);
  const end = zonedDateTimeToTimestamp(nextDay.year, nextDay.month, nextDay.day, 0, 0, timezone);
  const [activity, activitySettings, workoutCount, dashboard] = await Promise.all([
    getActivityDailySummary(dateKey),
    getActivitySettings(),
    getCompletedWorkoutCountInRange(start, end),
    getDashboardStats()
  ]);
  const { error } = await client.rpc("publish_daily_stats", {
    stat_date: dateKey,
    stat_timezone: timezone,
    stat_steps: activity?.authoritativeSteps ?? 0,
    stat_workout_count: workoutCount,
    stat_workout_streak: dashboard.currentStreak,
    stat_step_source:
      activity?.authoritativeSource === "health_connect"
        ? "health_connect"
        : activity?.authoritativeSource === "phone_sensor"
          ? "phone_sensor"
          : "unknown",
    stat_client_updated_at: new Date(
      Math.max(activity?.updatedAt ?? 0, Date.now())
    ).toISOString()
  });
  if (error) throw error;
  if ((activity?.authoritativeSteps ?? 0) >= activitySettings.dailyGoal) {
    await publishFriendActivityEvent(client, "daily_step_goal_completed").catch(() => undefined);
  }
}

export async function loadTodayLeaderboard(
  client: SupabaseClient,
  currentUserId: string
): Promise<LeaderboardEntry[]> {
  const dateKey = getTodayLabelInTimeZone(getDeviceTimeZone());
  const { data: statsData, error: statsError } = await client
    .from("daily_social_stats")
    .select("user_id,steps,workout_count,workout_streak")
    .eq("date_key", dateKey);
  if (statsError) throw statsError;
  const stats = statsData ?? [];
  if (stats.length === 0) return [];
  const userIds = [...new Set(stats.map((row) => String(row.user_id)))];
  const { data: profileData, error: profileError } = await client
    .from("profiles")
    .select("user_id,display_name,handle,avatar_path")
    .in("user_id", userIds);
  if (profileError) throw profileError;
  const profiles = new Map(
    ((profileData ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile])
  );
  const signedUrls = await avatarUrls(
    client,
    currentUserId,
    [...profiles.values()].map((profile) => profile.avatar_path)
  );
  return Promise.all(
    stats.map(async (row) => {
      const userId = String(row.user_id);
      const profile = profiles.get(userId);
      return {
        userId,
        displayName: profile?.display_name?.trim() || profile?.handle || "Anthra user",
        handle: profile?.handle ?? "",
        avatarUrl: profile?.avatar_path ? signedUrls.get(profile.avatar_path) ?? null : null,
        steps: row.steps == null ? null : Number(row.steps),
        workoutCount: row.workout_count == null ? null : Number(row.workout_count),
        workoutStreak: row.workout_streak == null ? null : Number(row.workout_streak),
        isCurrentUser: userId === currentUserId
      };
    })
  );
}

export type SocialSnapshotData = {
  overview: SocialOverview;
  privacy: SocialPrivacy;
  leaderboard: LeaderboardEntry[];
};

/** Loads the complete Friends payload with one profile query and one batched avatar-signing request. */
export async function loadSocialSnapshotData(
  client: SupabaseClient,
  currentUserId: string
): Promise<SocialSnapshotData> {
  const dateKey = getTodayLabelInTimeZone(getDeviceTimeZone());
  const [friendshipResult, privacy, statsResult] = await Promise.all([
    client
      .from("friendships")
      .select("id,user_low_id,user_high_id,requested_by,status")
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false }),
    loadSocialPrivacy(client, currentUserId),
    client
      .from("daily_social_stats")
      .select("user_id,steps,workout_count,workout_streak")
      .eq("date_key", dateKey)
  ]);
  if (friendshipResult.error) throw friendshipResult.error;
  if (statsResult.error) throw statsResult.error;

  const friendships = (friendshipResult.data ?? []) as FriendshipRow[];
  const stats = statsResult.data ?? [];
  const userIds = new Set<string>();
  for (const friendship of friendships) {
    userIds.add(friendship.user_low_id === currentUserId ? friendship.user_high_id : friendship.user_low_id);
  }
  for (const row of stats) userIds.add(String(row.user_id));

  let profileRows: ProfileRow[] = [];
  if (userIds.size > 0) {
    const { data, error } = await client
      .from("profiles")
      .select("user_id,display_name,handle,avatar_path")
      .in("user_id", [...userIds]);
    if (error) throw error;
    profileRows = (data ?? []) as ProfileRow[];
  }
  const profiles = new Map(profileRows.map((profile) => [profile.user_id, profile]));
  const signedUrls = await avatarUrls(
    client,
    currentUserId,
    profileRows.map((profile) => profile.avatar_path)
  );
  const people = await Promise.all(friendships.map(async (friendship) => {
    const otherId = friendship.user_low_id === currentUserId
      ? friendship.user_high_id
      : friendship.user_low_id;
    const profile = profiles.get(otherId) ?? {
      user_id: otherId,
      display_name: "Anthra user",
      handle: null,
      avatar_path: null
    };
    return hydratePerson(profile, friendship, currentUserId, signedUrls);
  }));

  return {
    overview: {
      friends: people.filter((person) => person.friendshipStatus === "accepted"),
      incoming: people.filter((person) => person.requestDirection === "incoming"),
      outgoing: people.filter((person) => person.requestDirection === "outgoing")
    },
    privacy,
    leaderboard: stats.map((row) => {
      const userId = String(row.user_id);
      const profile = profiles.get(userId);
      return {
        userId,
        displayName: profile?.display_name?.trim() || profile?.handle || "Anthra user",
        handle: profile?.handle ?? "",
        avatarUrl: profile?.avatar_path ? signedUrls.get(profile.avatar_path) ?? null : null,
        steps: row.steps == null ? null : Number(row.steps),
        workoutCount: row.workout_count == null ? null : Number(row.workout_count),
        workoutStreak: row.workout_streak == null ? null : Number(row.workout_streak),
        isCurrentUser: userId === currentUserId
      };
    })
  };
}
