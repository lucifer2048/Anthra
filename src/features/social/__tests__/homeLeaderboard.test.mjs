import assert from "node:assert/strict";
import test from "node:test";

import homeLeaderboard from "../homeLeaderboard.ts";
import socialSchema from "../socialSchema.ts";

const { getHomeLeaderboardPositions } = homeLeaderboard;
const { SOCIAL_CACHE_MIGRATIONS, SOCIAL_CACHE_TABLE_NAMES } = socialSchema;
const DatabaseSync = await import("node:sqlite")
  .then((module) => module.DatabaseSync)
  .catch(() => null);

const entry = (userId, values, isCurrentUser = false) => ({
  userId,
  displayName: userId,
  handle: userId,
  avatarUrl: null,
  steps: values.steps,
  workoutCount: values.workouts,
  workoutStreak: values.streak,
  isCurrentUser
});

test("home leaderboard reports the current user's rank for each shared metric", () => {
  const positions = getHomeLeaderboardPositions([
    entry("me", { steps: 7_000, workouts: 1, streak: 5 }, true),
    entry("friend-a", { steps: 9_000, workouts: 0, streak: 5 }),
    entry("friend-b", { steps: 4_000, workouts: 2, streak: null })
  ]);

  assert.deepEqual(positions, [
    { metric: "steps", value: 7_000, rank: 2, participantCount: 3 },
    { metric: "workouts", value: 1, rank: 2, participantCount: 3 },
    { metric: "streak", value: 5, rank: 1, participantCount: 2 }
  ]);
});

test("home leaderboard does not infer a rank for metrics the user does not share", () => {
  const positions = getHomeLeaderboardPositions([
    entry("me", { steps: null, workouts: null, streak: null }, true),
    entry("friend", { steps: 2_000, workouts: 1, streak: 3 })
  ]);

  assert.deepEqual(positions.map(({ rank, value }) => ({ rank, value })), [
    { rank: null, value: null },
    { rank: null, value: null },
    { rank: null, value: null }
  ]);
});

test("social cache migration is additive, account-scoped, and repeat-safe", {
  skip: !DatabaseSync && "node:sqlite requires Node 22 or newer"
}, () => {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL); INSERT INTO plans VALUES (1, 'Keep me');");
  for (const migration of SOCIAL_CACHE_MIGRATIONS) database.exec(migration);
  database.prepare(`INSERT INTO social_snapshot_cache VALUES (?, ?, ?, ?, ?, ?)`).run(
    "account-a", "2026-08-08", '{"friends":[],"incoming":[],"outgoing":[]}', "{}", "[]", 123
  );
  for (const migration of SOCIAL_CACHE_MIGRATIONS) database.exec(migration);

  const retainedPlan = database.prepare("SELECT * FROM plans").get();
  assert.equal(retainedPlan.id, 1);
  assert.equal(retainedPlan.name, "Keep me");
  assert.equal(database.prepare("SELECT COUNT(*) total FROM social_snapshot_cache").get().total, 1);
  assert.deepEqual(SOCIAL_CACHE_TABLE_NAMES, ["social_snapshot_cache"]);
});
