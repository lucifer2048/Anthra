import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import {
  BellRing,
  Check,
  Dumbbell,
  Eye,
  Flame,
  Footprints,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  UserMinus,
  UserPlus,
  UsersRound,
  X
} from "lucide-react-native";

import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import {
  BottomTabBar,
  Button,
  Card,
  EmptyState,
  IconButton,
  KeyboardAwareScrollView,
  ScreenHeader,
  SegmentedControl,
  SkeletonRow,
  StatusBanner,
  SwitchRow,
  TextField
} from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { useAccount } from "../account/AccountProvider";
import { supabase } from "../../services/supabaseClient";
import {
  cancelFriendRequest,
  publishTodaySocialStats,
  removeFriend,
  respondToFriendRequest,
  saveSocialPrivacy,
  searchPeople,
  sendFriendRequest
} from "./socialService";
import { useSocial } from "./SocialProvider";
import type {
  LeaderboardEntry,
  LeaderboardMetric,
  SocialOverview,
  SocialPerson,
  SocialPrivacy
} from "./socialTypes";
import { registerFriendActivityPushToken } from "./friendActivityNotifications";
import { FriendsListView, LeaderboardView, SocialPrivacyView } from "./FriendsViews";

type SocialTab = "friends" | "requests" | "leaderboard" | "privacy";

const EMPTY_OVERVIEW: SocialOverview = { friends: [], incoming: [], outgoing: [] };
const PRIVATE_DEFAULTS: SocialPrivacy = {
  shareSteps: false,
  shareWorkoutStreak: false,
  shareWorkoutCount: false,
  appearInLeaderboards: false,
  shareActivityNotifications: false,
  receiveActivityNotifications: false
};

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The social action could not be completed.";
}

function PersonAvatar({ person, size = 48 }: { person: Pick<SocialPerson, "displayName" | "avatarUrl">; size?: number }) {
  const theme = useAnthraTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (person.avatarUrl !== failedUrl) setFailedUrl(null);
  }, [person.avatarUrl]);
  const initials = person.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: theme.colors.brandBorder,
        backgroundColor: theme.colors.brandSoft
      }}
    >
      {person.avatarUrl && person.avatarUrl !== failedUrl ? (
        <Image
          source={{ uri: person.avatarUrl }}
          onError={() => setFailedUrl(person.avatarUrl)}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Text style={[theme.typography.bodyStrong, { color: theme.colors.brand }]}>{initials}</Text>
      )}
    </View>
  );
}

function PersonIdentity({ person }: { person: SocialPerson }) {
  const theme = useAnthraTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>
        {person.displayName}
      </Text>
      <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
        {person.handle ? `@${person.handle}` : "Username not set"}
      </Text>
    </View>
  );
}

/** A friend card that deliberately stacks its action below the identity on phones. */
function SocialPersonCard({ person, action }: { person: SocialPerson; action?: ReactNode }) {
  const theme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const stackAction = width < 430 || fontScale >= 1.2;

  return (
    <Card padding="medium" radius="xlarge" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}>
      <View
        style={{
          flexDirection: stackAction ? "column" : "row",
          alignItems: stackAction ? "stretch" : "center",
          gap: theme.spacing.md
        }}
      >
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
          <PersonAvatar person={person} />
          <PersonIdentity person={person} />
        </View>
        {action ? (
          <View style={{ alignSelf: stackAction ? "stretch" : "center", flexShrink: 0 }}>
            {action}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export function FriendsScreen({
  onBack,
  onOpenAccount,
  initialTab = "friends"
}: {
  onBack: () => void;
  onOpenAccount: () => void;
  initialTab?: SocialTab;
}) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const account = useAccount();
  const social = useSocial();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.25;
  const [tab, setTab] = useState<SocialTab>(initialTab);
  const [privacy, setPrivacy] = useState<SocialPrivacy>(PRIVATE_DEFAULTS);
  const privacyRef = useRef<SocialPrivacy>(PRIVATE_DEFAULTS);
  const privacyDirtyRef = useRef(false);
  const [privacyDirty, setPrivacyDirty] = useState(false);
  const [privacySaveFailed, setPrivacySaveFailed] = useState(false);
  const [metric, setMetric] = useState<LeaderboardMetric>("steps");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialPerson[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const overview = social.snapshot?.overview ?? EMPTY_OVERVIEW;
  const leaderboard = social.snapshot?.leaderboard ?? [];
  const loading = social.loading && !social.snapshot;
  const refreshing = social.refreshing;

  const refresh = useCallback(async (showSpinner = false) => {
    try {
      setNotice(null);
      const next = await social.refresh({ force: showSpinner });
      // Never replace a setting the user has just changed locally with a
      // slower snapshot response.
      if (next && !privacyDirtyRef.current) setPrivacy(next.privacy);
    } catch (error) {
      setNotice({ type: "error", message: messageOf(error) });
    }
  }, [social.refresh]);

  useEffect(() => {
    privacyRef.current = privacy;
  }, [privacy]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    if (social.snapshot && !privacyDirtyRef.current) setPrivacy(social.snapshot.privacy);
  }, [social.snapshot?.fetchedAt]);

  const run = async (id: string, task: () => Promise<void>, successMessage?: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await task();
      await refresh(true);
      if (query.trim().length >= 2 && supabase && account.user) {
        setResults(await searchPeople(supabase, account.user.id, query));
      }
      if (successMessage) setNotice({ type: "success", message: successMessage });
    } catch (error) {
      setNotice({ type: "error", message: messageOf(error) });
    } finally {
      setBusyId(null);
    }
  };

  const persistPrivacy = useCallback(async (target: SocialPrivacy, announceSuccess = false) => {
    if (!supabase || !account.user) return;
    setBusyId("privacy");
    setNotice(null);
    setPrivacySaveFailed(false);
    try {
      if (target.receiveActivityNotifications) {
        const registered = await registerFriendActivityPushToken(supabase!, true);
        if (!registered) throw new Error("Allow notifications to receive friend activity alerts.");
      }
      await saveSocialPrivacy(supabase!, account.user.id, target);
      await publishTodaySocialStats(supabase!);
      if (privacyRef.current === target) {
        privacyDirtyRef.current = false;
        setPrivacyDirty(false);
        await refresh(true);
        if (announceSuccess) setNotice({ type: "success", message: "Sharing choices saved." });
      }
    } catch (error) {
      setPrivacySaveFailed(true);
      setNotice({ type: "error", message: messageOf(error) });
    } finally {
      setBusyId(null);
    }
  }, [account.user, refresh]);

  const updatePrivacy = useCallback((updater: (current: SocialPrivacy) => SocialPrivacy) => {
    const next = updater(privacyRef.current);
    privacyRef.current = next;
    privacyDirtyRef.current = true;
    setPrivacy(next);
    setPrivacyDirty(true);
    setPrivacySaveFailed(false);
  }, []);

  // Sharing controls are settings, not a temporary form. Persist them shortly
  // after each interaction so an app update or accidental navigation cannot
  // silently discard a choice before the user reaches the old footer action.
  useEffect(() => {
    if (!privacyDirty || privacySaveFailed || busyId === "privacy") return undefined;
    const timer = setTimeout(() => {
      persistPrivacy(privacyRef.current).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [busyId, persistPrivacy, privacy, privacyDirty, privacySaveFailed]);

  const search = async () => {
    if (!supabase || !account.user || query.trim().length < 2) return;
    setBusyId("search");
    setNotice(null);
    try {
      setResults(await searchPeople(supabase, account.user.id, query));
    } catch (error) {
      setNotice({ type: "error", message: messageOf(error) });
    } finally {
      setBusyId(null);
    }
  };

  const ranked = useMemo(() => {
    const value = (entry: LeaderboardEntry) =>
      metric === "steps"
        ? entry.steps
        : metric === "workouts"
          ? entry.workoutCount
          : entry.workoutStreak;
    return leaderboard
      .filter((entry) => value(entry) != null)
      .sort((a, b) => Number(value(b)) - Number(value(a)));
  }, [leaderboard, metric]);
  const enabledSharingCount = Object.values(privacy).filter(Boolean).length;
  const enabledLeaderboardMetricCount = [
    privacy.shareSteps,
    privacy.shareWorkoutCount,
    privacy.shareWorkoutStreak
  ].filter(Boolean).length;

  const tabs: Array<{ id: SocialTab; label: string; icon: typeof UsersRound; badge?: number }> = [
    { id: "friends", label: "Friends", icon: UsersRound },
    { id: "requests", label: "Requests", icon: Inbox, badge: overview.incoming.length },
    { id: "leaderboard", label: "Ranks", icon: Trophy },
    { id: "privacy", label: "Sharing", icon: ShieldCheck }
  ];

  const relationshipActions = (person: SocialPerson) => {
    if (!supabase || !person.friendshipId && person.friendshipStatus === "accepted") return null;
    if (person.friendshipStatus === "accepted") {
      return <Text style={[theme.typography.caption, { color: theme.colors.success }]}>Friends</Text>;
    }
    if (person.requestDirection === "outgoing" && person.friendshipId) {
      return (
        <Button
          label="Cancel"
          size="small"
          variant="outline"
          loading={busyId === person.userId}
          onPress={() => run(person.userId, () => cancelFriendRequest(supabase!, person.friendshipId!), "Request cancelled.")}
        />
      );
    }
    if (person.requestDirection === "incoming" && person.friendshipId) {
      return (
        <Button
          label="Accept"
          size="small"
          icon={Check}
          loading={busyId === person.userId}
          onPress={() => run(person.userId, () => respondToFriendRequest(supabase!, person.friendshipId!, true), "Friend request accepted.")}
        />
      );
    }
    return (
      <Button
        label="Add"
        size="small"
        icon={UserPlus}
        loading={busyId === person.userId}
        onPress={() => run(person.userId, () => sendFriendRequest(supabase!, person.userId), "Friend request sent.")}
      />
    );
  };

  const personRow = (person: SocialPerson, action: ReactNode) => (
    <SocialPersonCard key={person.userId} person={person} action={action} />
  );

  if (!account.user) {
    return (
      <ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "left", "right", "bottom"]}>
        <View style={{ flex: 1, width: "100%", maxWidth: theme.layout.contentMaxWidth, alignSelf: "center", paddingHorizontal: theme.layout.screenPadding }}>
          <ScreenHeader eyebrow="ANTHRA SOCIAL" title="Friends" onBack={onBack} />
          <EmptyState
            icon={UsersRound}
            title="Sign in to connect"
            description="Your offline Anthra data stays available. Sign in when you want friend requests and private leaderboards."
            action={{ label: "Open account", onPress: onOpenAccount, icon: UserPlus }}
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "left", "right"]}>
      <View style={{ flex: 1 }}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider, paddingHorizontal: theme.layout.screenPadding }}>
          <ScreenHeader
            eyebrow="ANTHRA SOCIAL"
            title={
              tab === "friends" ? "Friends" :
              tab === "requests" ? "Requests" :
              tab === "leaderboard" ? "Leaderboard" : "Sharing"
            }
            subtitle={
              tab === "friends" ? "Connect privately and share only the progress you choose." :
              tab === "requests" ? "Manage incoming and outgoing requests." :
              tab === "leaderboard" ? "Private standings updated from opted-in friends." :
              "Choose what milestones and rankings you share."
            }
            onBack={onBack}
            action={
              <IconButton
                icon={RefreshCw}
                accessibilityLabel="Refresh friends"
                onPress={() => refresh(true)}
                variant="outline"
                haptic="selection"
              />
            }
            style={{ width: "100%", maxWidth: theme.layout.contentMaxWidth, alignSelf: "center" }}
          />
        </View>

        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          extraKeyboardSpace={theme.spacing["3xl"]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} />}
          contentContainerStyle={{
            width: "100%",
            maxWidth: theme.layout.contentMaxWidth,
            alignSelf: "center",
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing["4xl"]
          }}
        >
          {notice && (
            <StatusBanner
              variant={notice.type === "success" ? "success" : "danger"}
              title={notice.type === "success" ? "Done" : "Could not update friends"}
              message={notice.message}
              style={{ marginBottom: theme.spacing.lg }}
            />
          )}

          {loading ? (
            <Card><View style={{ gap: theme.spacing.lg }}><SkeletonRow /><SkeletonRow /><SkeletonRow /></View></Card>
          ) : tab === "friends" ? (
            <FriendsListView>
              <Card variant="brand" padding="large" radius="xlarge" style={{ borderColor: theme.colors.brandBorder }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      flexShrink: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: theme.radii.lg,
                      borderWidth: 1,
                      borderColor: theme.colors.brandBorder,
                      backgroundColor: theme.colors.surfaceElevated
                    }}
                  >
                    <UsersRound accessible={false} color={theme.colors.brand} size={23} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary }]}>Your circle</Text>
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>A private space for the people you choose to add.</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", marginTop: theme.spacing.xl }}>
                  {[
                    { label: "Friends", value: overview.friends.length },
                    { label: "Requests", value: overview.incoming.length }
                  ].map((stat, index) => (
                    <View
                      key={stat.label}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        paddingHorizontal: theme.spacing.md,
                        borderLeftWidth: index === 0 ? 0 : theme.borderWidths.standard,
                        borderLeftColor: theme.colors.brandBorder
                      }}
                    >
                      <Text style={[theme.typography.metric, { color: theme.colors.brand, fontSize: 28, lineHeight: 34 }]}>{stat.value}</Text>
                      <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs }]}>{stat.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card padding="large">
                <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Find people</Text>
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>Search using a name or Anthra username. Email addresses are never exposed.</Text>
                <TextField
                  label="Name or username"
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    if (value.trim().length < 2) setResults([]);
                  }}
                  leadingIcon={Search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={() => search()}
                  placeholder="Search @username"
                  containerStyle={{ marginTop: theme.spacing.lg }}
                  trailing={
                    query.trim().length >= 2 ? (
                      <Button
                        label="Search"
                        size="small"
                        variant="primary"
                        loading={busyId === "search"}
                        onPress={search}
                      />
                    ) : query.length > 0 ? (
                      <IconButton
                        icon={X}
                        size="small"
                        accessibilityLabel="Clear search"
                        onPress={() => {
                          setQuery("");
                          setResults([]);
                        }}
                        variant="ghost"
                      />
                    ) : null
                  }
                />
              </Card>

              {results.length > 0 && (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>SEARCH RESULTS</Text>
                  {results.map((person) => personRow(person, relationshipActions(person)))}
                </View>
              )}

              <View style={{ gap: theme.spacing.sm }}>
                <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>YOUR FRIENDS · {overview.friends.length}</Text>
                {overview.friends.length === 0 ? (
                  <EmptyState icon={UsersRound} title="No friends yet" description="Search for someone using their Anthra username." />
                ) : overview.friends.map((person) => personRow(person,
                  <Button
                    label="Remove"
                    size="small"
                    variant="outline"
                    icon={UserMinus}
                    loading={busyId === person.userId}
                    onPress={() => Alert.alert(
                      "Remove friend?",
                      `${person.displayName} will no longer see your shared progress.`,
                      [
                        { text: "Keep friend", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => run(person.userId, () => removeFriend(supabase!, person.friendshipId!), "Friend removed.") }
                      ]
                    )}
                  />
                ))}
              </View>
            </FriendsListView>
          ) : tab === "requests" ? (
            <FriendsListView>
              <View style={{ gap: theme.spacing.sm }}>
                <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>INCOMING · {overview.incoming.length}</Text>
                {overview.incoming.length === 0 ? (
                  <EmptyState icon={Inbox} title="No incoming requests" variant="inline" />
                ) : overview.incoming.map((person) => personRow(person,
                  <View style={{ gap: theme.spacing.xs }}>
                    <Button label="Accept" size="small" icon={Check} loading={busyId === person.userId} onPress={() => run(person.userId, () => respondToFriendRequest(supabase!, person.friendshipId!, true), "Friend request accepted.")} />
                    <Button label="Decline" size="small" variant="ghost" icon={X} disabled={busyId !== null} onPress={() => run(person.userId, () => respondToFriendRequest(supabase!, person.friendshipId!, false), "Request declined.")} />
                  </View>
                ))}
              </View>
              <View style={{ gap: theme.spacing.sm }}>
                <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>SENT · {overview.outgoing.length}</Text>
                {overview.outgoing.length === 0 ? (
                  <EmptyState icon={UserPlus} title="No pending requests" variant="inline" />
                ) : overview.outgoing.map((person) => personRow(person,
                  <Button label="Cancel" size="small" variant="outline" loading={busyId === person.userId} onPress={() => run(person.userId, () => cancelFriendRequest(supabase!, person.friendshipId!), "Request cancelled.")} />
                ))}
              </View>
            </FriendsListView>
          ) : tab === "leaderboard" ? (
            <LeaderboardView>
              <Card
                padding="none"
                radius="xlarge"
                style={{
                  overflow: "hidden",
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  ...theme.shadows.medium
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md,
                    padding: compact ? theme.spacing.lg : theme.spacing.xl,
                    backgroundColor: theme.colors.brandSoft
                  }}
                >
                  <View
                    style={{
                      width: compact ? 40 : 44,
                      height: compact ? 40 : 44,
                      flexShrink: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: theme.radii.md,
                      borderWidth: 1,
                      borderColor: theme.colors.brandBorder,
                      backgroundColor: theme.colors.surfaceElevated
                    }}
                  >
                    <Trophy accessible={false} color={theme.colors.brand} size={compact ? 20 : 22} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary }]}>
                      Friends Leaderboard
                    </Text>
                    {/* <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.25}
                      style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 1 }]}
                    >
                      Private standings updated today from opted-in friends
                    </Text> */}
                  </View>
                  <View
                    style={{
                      flexShrink: 0,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.xs,
                      borderRadius: theme.radii.full,
                      borderWidth: 1,
                      borderColor: theme.colors.brandBorder,
                      backgroundColor: theme.colors.surfaceElevated
                    }}
                  >
                    <Text style={[theme.typography.eyebrow, { color: theme.colors.brand }]}>
                      LIVE
                    </Text>
                  </View>
                </View>
                <View style={{ padding: theme.spacing.lg, borderTopWidth: theme.borderWidths.standard, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surfaceSubtle }}>
                  <SegmentedControl options={[{ value: "steps", label: "Steps", icon: Footprints }, { value: "workouts", label: "Workouts", icon: Dumbbell }, { value: "streak", label: "Streak", icon: Flame }]} value={metric} onChange={setMetric} />
                </View>
              </Card>

              {ranked.length === 0 ? (
                <EmptyState icon={Trophy} title="No shared results today" description="Friends appear after they enable leaderboard sharing for this metric." />
              ) : (
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md }}>
                    <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>TODAY’S STANDINGS</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{ranked.length} ranked</Text>
                  </View>
                  {ranked.map((entry, index) => {
                    const value = metric === "steps" ? entry.steps : metric === "workouts" ? entry.workoutCount : entry.workoutStreak;
                    const person: SocialPerson = { userId: entry.userId, displayName: entry.displayName, handle: entry.handle, avatarPath: null, avatarUrl: entry.avatarUrl, friendshipId: null, friendshipStatus: null, requestDirection: null };
                    const isFirst = index === 0;
                    return (
                      <Card
                        key={entry.userId}
                        padding="small"
                        radius="large"
                        variant={isFirst ? "brand" : "default"}
                        style={{
                          borderColor: isFirst ? theme.colors.brandBorder : theme.colors.border,
                          backgroundColor: isFirst ? theme.colors.brandSoft : theme.colors.surfaceElevated
                        }}
                      >
                        <View
                          style={{
                            minWidth: 0,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: compact ? theme.spacing.sm : theme.spacing.md,
                            padding: compact ? theme.spacing.xs : theme.spacing.sm
                          }}
                        >
                          <View
                            style={{
                              width: compact ? 32 : 36,
                              height: compact ? 32 : 36,
                              flexShrink: 0,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: theme.radii.full,
                              borderWidth: 1,
                              borderColor: isFirst ? theme.colors.brandBorder : theme.colors.border,
                              backgroundColor: theme.colors.surfaceElevated
                            }}
                          >
                            <Text
                              style={[
                                theme.typography.bodyStrong,
                                { color: isFirst ? theme.colors.brand : theme.colors.textSecondary, fontSize: 13 }
                              ]}
                            >
                              #{index + 1}
                            </Text>
                          </View>
                          <PersonAvatar person={person} size={compact ? 42 : 46} />
                          <PersonIdentity person={person} />
                          <View style={{ minWidth: 0, maxWidth: compact ? 80 : 120, flexShrink: 1, alignItems: "flex-end" }}>
                            <Text
                              style={[theme.typography.titleMedium, { color: isFirst ? theme.colors.brand : theme.colors.textPrimary, textAlign: "right" }]}
                            >
                              {Number(value).toLocaleString()}
                            </Text>
                            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, }]}>
                              {metric === "steps" ? "steps" : metric === "workouts" ? "today" : "days"}
                            </Text>
                          </View>
                        </View>
                      </Card>
                    );
                  })}
                </View>
              )}
            </LeaderboardView>
          ) : (
            <SocialPrivacyView>
              {/* Privacy Overview Header Card */}
              <Card
                padding="large"
                radius="xlarge"
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  ...theme.shadows.medium
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <View
                    style={{
                      width: compact ? 40 : 44,
                      height: compact ? 40 : 44,
                      flexShrink: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: theme.radii.md,
                      borderWidth: 1,
                      borderColor: theme.colors.brandBorder,
                      backgroundColor: theme.colors.brandSoft
                    }}
                  >
                    <ShieldCheck accessible={false} color={theme.colors.brand} size={compact ? 20 : 22} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary }]}>
                      Sharing & Privacy
                    </Text>
                    <Text
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.25}
                      style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 1 }]}
                    >
                      Private by default. Only accepted friends see what you enable below.
                    </Text>
                  </View>
                  <View
                    style={{
                      flexShrink: 0,
                      alignItems: "center",
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: 4,
                      borderRadius: theme.radii.full,
                      borderWidth: 1,
                      borderColor: theme.colors.brandBorder,
                      backgroundColor: theme.colors.brandSoft
                    }}
                  >
                    <Text style={[theme.typography.caption, { color: theme.colors.brand, fontWeight: "700", }]}>
                      {enabledSharingCount}/6 ON
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Permission Block Card 1: Activity Notifications */}
              <Card
                padding="large"
                radius="xlarge"
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  gap: theme.spacing.md
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: theme.radii.md,
                      backgroundColor: theme.colors.brandSoft
                    }}
                  >
                    <BellRing accessible={false} color={theme.colors.brand} size={16} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>Activity Alerts</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Choose what milestone updates you send and receive</Text>
                  </View>
                </View>

                <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                  <SwitchRow
                    appearance="embedded"
                    label="Share milestones"
                    description="Workout starts and verified step-goal wins."
                    value={privacy.shareActivityNotifications}
                    onValueChange={(value) => updatePrivacy((current) => ({ ...current, shareActivityNotifications: value }))}
                  />
                  <View style={{ height: 1, backgroundColor: theme.colors.divider }} />
                  <SwitchRow
                    appearance="embedded"
                    label="Friend alerts"
                    description="Milestones your friends choose to share."
                    value={privacy.receiveActivityNotifications}
                    onValueChange={(value) => updatePrivacy((current) => ({ ...current, receiveActivityNotifications: value }))}
                  />
                </View>
              </Card>

              {/* Permission Block Card 2: Leaderboard Sharing */}
              <Card
                padding="large"
                radius="xlarge"
                style={{
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surfaceElevated,
                  gap: theme.spacing.md
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: theme.radii.md,
                      backgroundColor: theme.colors.brandSoft
                    }}
                  >
                    <Trophy accessible={false} color={theme.colors.brand} size={16} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>Leaderboard Sharing</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>One master control, then choose individual metrics</Text>
                  </View>
                  {privacy.appearInLeaderboards && (
                    <View
                      style={{
                        paddingHorizontal: theme.spacing.sm,
                        paddingVertical: 2,
                        borderRadius: theme.radii.full,
                        backgroundColor: theme.colors.brandSoft
                      }}
                    >
                      <Text style={[theme.typography.caption, { color: theme.colors.brand, fontWeight: "600", }]}>
                        {enabledLeaderboardMetricCount}/3 METRICS
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                  <SwitchRow
                    appearance="embedded"
                    label="Join daily rankings"
                    description={privacy.appearInLeaderboards
                      ? "On — choose visible metrics below."
                      : "Off — none of your progress is ranked."}
                    value={privacy.appearInLeaderboards}
                    onValueChange={(value) => updatePrivacy((current) => ({ ...current, appearInLeaderboards: value }))}
                  />

                  {privacy.appearInLeaderboards && (
                    <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.divider }}>
                      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>VISIBLE METRICS</Text>
                      <SwitchRow
                        appearance="embedded"
                        label="Verified steps"
                        description="Sensor-recorded steps only. Manual entries stay private."
                        value={privacy.shareSteps}
                        onValueChange={(value) => updatePrivacy((current) => ({ ...current, shareSteps: value }))}
                      />
                      <View style={{ height: 1, backgroundColor: theme.colors.divider }} />
                      <SwitchRow
                        appearance="embedded"
                        label="Daily workouts"
                        description="Completed Anthra workouts from today."
                        value={privacy.shareWorkoutCount}
                        onValueChange={(value) => updatePrivacy((current) => ({ ...current, shareWorkoutCount: value }))}
                      />
                      <View style={{ height: 1, backgroundColor: theme.colors.divider }} />
                      <SwitchRow
                        appearance="embedded"
                        label="Workout streak"
                        description="Your current completed-workout streak."
                        value={privacy.shareWorkoutStreak}
                        onValueChange={(value) => updatePrivacy((current) => ({ ...current, shareWorkoutStreak: value }))}
                      />
                    </View>
                  )}
                </View>
              </Card>

              {/* Permission Save Action Card */}
              <Card padding="medium" radius="xlarge" style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}>
                <Text style={[theme.typography.caption, { color: privacySaveFailed ? theme.colors.danger : theme.colors.textSecondary, marginBottom: theme.spacing.sm, textAlign: "center" }]}>
                  {privacySaveFailed
                    ? "Could not save automatically. Try again when you are connected."
                    : busyId === "privacy"
                      ? "Saving your sharing choices…"
                      : "Sharing choices save automatically."}
                </Text>
                <Button
                  label={privacySaveFailed ? "Retry saving choices" : "Save now"}
                  icon={ShieldCheck}
                  size="large"
                  fullWidth
                  loading={busyId === "privacy"}
                  onPress={() => persistPrivacy(privacyRef.current, true)}
                />
              </Card>
            </SocialPrivacyView>
          )}
        </KeyboardAwareScrollView>
        <BottomTabBar
          tabs={tabs}
          activeTab={tab}
          onChange={setTab}
          safeArea
          accessibilityHintPrefix="Opens social"
        />
      </View>
    </ScreenLayout>
  );
}
