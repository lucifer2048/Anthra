import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/202608080007_friend_activity_notifications.sql", import.meta.url),
  "utf8"
);
const edgeFunction = readFileSync(
  new URL("../../../../supabase/functions/notify-friend-activity/index.ts", import.meta.url),
  "utf8"
);

test("friend activity events are private, opt-in, and deduplicated by day", () => {
  assert.match(migration, /share_activity_notifications boolean not null default false/);
  assert.match(migration, /receive_activity_notifications boolean not null default false/);
  assert.match(migration, /unique\(actor_id, kind, date_key\)/);
  assert.match(migration, /friend_activity_events enable row level security/);
  assert.equal(/create policy .*friend_activity_events/i.test(migration), false);
});

test("push token registration is authenticated and does not expose tokens to friends", () => {
  assert.match(migration, /caller uuid := auth\.uid\(\)/);
  assert.match(migration, /register_device_push_token/);
  assert.match(migration, /grant execute .* to authenticated/);
  assert.doesNotMatch(migration, /push_tokens_friend/i);
});

test("dispatcher limits delivery to accepted, unblocked, opted-in friends", () => {
  assert.match(edgeFunction, /\.eq\("status", "accepted"\)/);
  assert.match(edgeFunction, /receive_activity_notifications/);
  assert.match(edgeFunction, /blockedIds/);
  assert.match(edgeFunction, /already_sent/);
  assert.match(edgeFunction, /rate_limited/);
  assert.match(edgeFunction, /slice\(offset, offset \+ 100\)/);
});

test("leaderboard metric tabs use explicit theme-safe selected colors", () => {
  const screen = readFileSync(new URL("../FriendsScreen.tsx", import.meta.url), "utf8");
  const segmentedControl = readFileSync(new URL("../../../components/ui/SegmentedControl.tsx", import.meta.url), "utf8");
  assert.match(screen, /<SegmentedControl/);
  assert.match(segmentedControl, /accessibilityRole="tablist"/);
  assert.match(segmentedControl, /accessibilityRole="tab"/);
  assert.match(segmentedControl, /backgroundColor: selected/);
  assert.match(segmentedControl, /theme\.colors\.brandSolid/);
  assert.match(segmentedControl, /theme\.colors\.textOnBrandSolid/);
  assert.match(segmentedControl, /theme\.colors\.surface/);
});

test("friends remain usable before notification migration 007 is deployed", () => {
  const service = readFileSync(new URL("../socialService.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../FriendsScreen.tsx", import.meta.url), "utf8");
  assert.match(service, /PGRST204/);
  assert.match(service, /share_activity_notifications: false/);
  assert.match(service, /Friend activity notifications require Supabase migration 007/);
  assert.match(screen, /publishTodaySocialStats\(supabase!\)/);
});

test("social data uses an account-scoped persistent stale-while-revalidate cache", () => {
  const schema = readFileSync(new URL("../socialSchema.ts", import.meta.url), "utf8");
  const repository = readFileSync(new URL("../socialCacheRepository.ts", import.meta.url), "utf8");
  const provider = readFileSync(new URL("../SocialProvider.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../FriendsScreen.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../hub/AnthraHomeScreen.tsx", import.meta.url), "utf8");

  assert.match(schema, /accountId TEXT PRIMARY KEY NOT NULL/);
  assert.match(repository, /ON CONFLICT\(accountId\) DO UPDATE/);
  assert.match(repository, /DELETE FROM social_snapshot_cache WHERE accountId = \?/);
  assert.match(provider, /SOCIAL_CACHE_FRESH_MS = 60_000/);
  assert.match(provider, /inFlightRef/);
  assert.match(provider, /loadSocialSnapshotCache/);
  assert.match(provider, /deleteSocialSnapshotCache/);
  assert.match(screen, /const social = useSocial\(\)/);
  assert.match(home, /const social = useSocial\(\)/);
});

test("social snapshots batch avatar signing instead of making one request per person", () => {
  const service = readFileSync(new URL("../socialService.ts", import.meta.url), "utf8");
  assert.match(service, /createSignedUrls\(missing, AVATAR_URL_TTL_SECONDS\)/);
  assert.match(service, /loadSocialSnapshotData/);
  assert.match(service, /const \[friendshipResult, privacy, statsResult\] = await Promise\.all/);
});
