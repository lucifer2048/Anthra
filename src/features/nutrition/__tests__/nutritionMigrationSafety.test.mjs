import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import nutritionSchema from "../nutritionSchema.ts";
const { NUTRITION_MIGRATIONS, NUTRITION_TABLE_NAMES } = nutritionSchema;
const DatabaseSync = await import("node:sqlite").then((module) => module.DatabaseSync).catch(() => null);

test("local migrations are additive and repeat-safe for a populated legacy database", () => {
  const sql = NUTRITION_MIGRATIONS.join("\n").toUpperCase();
  for (const table of NUTRITION_TABLE_NAMES) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table.toUpperCase()}`));
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE\s+FROM)\b/);
  assert.match(sql, /INSERT OR IGNORE INTO NUTRITION_GOALS/);
  assert.match(sql, /PRIMARY KEY \(RESOURCETYPE, RESOURCEID\)/);
});

test("applying nutrition migrations twice preserves representative legacy rows", {
  skip: !DatabaseSync && "node:sqlite requires Node 22 or newer"
}, () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE reminders (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE activity_daily_summary (dateKey TEXT PRIMARY KEY, authoritativeSteps INTEGER NOT NULL);
    INSERT INTO plans VALUES (7, 'Months-old workout plan');
    INSERT INTO reminders VALUES (11, 'Legacy reminder');
    INSERT INTO activity_daily_summary VALUES ('2026-08-07', 8432);
  `);
  const before = {
    plans: db.prepare("SELECT * FROM plans").all(), reminders: db.prepare("SELECT * FROM reminders").all(),
    activity: db.prepare("SELECT * FROM activity_daily_summary").all()
  };
  for (const migration of NUTRITION_MIGRATIONS) db.exec(migration);
  db.exec("INSERT INTO nutrition_entries VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'lunch', 'manual', 1, '2026-08-08', 'Asia/Kolkata', NULL, NULL, NULL, NULL, NULL, NULL, 'pending', 1, 1, NULL)");
  for (const migration of NUTRITION_MIGRATIONS) db.exec(migration);
  assert.deepEqual(db.prepare("SELECT * FROM plans").all(), before.plans);
  assert.deepEqual(db.prepare("SELECT * FROM reminders").all(), before.reminders);
  assert.deepEqual(db.prepare("SELECT * FROM activity_daily_summary").all(), before.activity);
  assert.equal(db.prepare("SELECT COUNT(*) total FROM nutrition_entries").get().total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) total FROM nutrition_goals").get().total, 1);
});

test("cloud migration enables RLS and keeps nutrition owner-only", () => {
  const sql = readFileSync(new URL("../../../../supabase/migrations/202608080006_private_nutrition.sql", import.meta.url), "utf8").toLowerCase();
  for (const table of ["nutrition_entries", "nutrition_entry_items", "nutrition_goals", "nutrition_custom_foods", "nutrition_analysis_usage"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /\btruncate\b|\bdrop table\b|\bdelete from\b/);
  assert.match(sql, /anthra-meal-images/);
  const edge = readFileSync(new URL("../../../../supabase/functions/analyze-nutrition-image/index.ts", import.meta.url), "utf8");
  assert.match(edge, /validSignature/); assert.match(edge, /MAX_BYTES = 1_500_000/);
  assert.match(edge, /auth\.getClaims\(token\)/);
  assert.match(edge, /claimsData\?\.claims\?\.sub/);
  assert.doesNotMatch(edge, /auth\.getUser\(\)/);
  assert.match(edge, /consume_nutrition_analysis_quota/);
  assert.match(edge, /NUTRITION_SELF_HOSTED_URL.*self-hosted/s);
  assert.match(edge, /NUTRITION_VISION_API_KEY.*openai-compatible/s);
  assert.match(edge, /class GeminiProvider/);
  assert.match(edge, /"x-goog-api-key": apiKey/);
  assert.match(edge, /:generateContent/);
  assert.match(edge, /unwrapProviderJson/);
  assert.match(edge, /IDENTIFICATION_SCHEMA/);
  assert.match(edge, /responseMimeType: "application\/json"/);
  assert.match(edge, /responseJsonSchema: IDENTIFICATION_SCHEMA/);
  assert.match(edge, /USDA_FDC_API_KEY/);
  assert.match(edge, /api\.nal\.usda\.gov\/fdc\/v1\/foods\/search/);
  assert.match(edge, /nutrientSource: "USDA FoodData Central"/);
  assert.match(edge, /AbortController/); assert.doesNotMatch(edge, /console\.(log|error)/);
});

test("photo analysis surfaces actionable Edge Function errors", () => {
  const source = readFileSync(new URL("../nutritionImageAnalyzer.ts", import.meta.url), "utf8");
  assert.match(source, /FunctionsHttpError/);
  assert.match(source, /await response\?\.json\?\.\(\)/);
  assert.match(source, /Photo analysis is not configured on the server yet/);
  assert.match(source, /Sign in before analyzing a meal photo/);
  assert.doesNotMatch(source, /throw new Error\(error\.message \|\| "Meal analysis failed\."\)/);
});

test("sync writes are idempotent and legacy rows link without deletion", () => {
  const source = readFileSync(new URL("../nutritionSync.ts", import.meta.url), "utf8");
  assert.match(source, /upsert\(/); assert.match(source, /onConflict: "id"/);
  assert.match(source, /ownerId IS NULL/); assert.doesNotMatch(source, /DELETE FROM nutrition_entries/);
});
