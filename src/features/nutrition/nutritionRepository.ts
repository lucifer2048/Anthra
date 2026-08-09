import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { NUTRITION_MIGRATIONS } from "./nutritionSchema";
import type {
  NutritionCatalogueFood,
  NutritionEntry,
  NutritionEntryDraft,
  NutritionEntryItem,
  NutritionGoals
} from "./nutritionTypes";

let nutritionDb: ReturnType<typeof SQLite.openDatabaseSync> | null = null;
type SqlValue = string | number | null;
type Row = Record<string, unknown>;

function db() {
  if (!nutritionDb) nutritionDb = SQLite.openDatabaseSync("anthra.db");
  return nutritionDb;
}

function id(): string {
  return Crypto.randomUUID();
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export async function initNutritionDatabase(): Promise<void> {
  await db().execAsync("PRAGMA foreign_keys = ON;");
  for (const migration of NUTRITION_MIGRATIONS) await db().execAsync(migration);
}

export async function getNutritionGoals(): Promise<NutritionGoals> {
  const row = await db().getFirstAsync<Row>("SELECT * FROM nutrition_goals WHERE id = 'default' LIMIT 1;");
  return {
    id: "default",
    ownerId: row?.ownerId == null ? null : String(row.ownerId),
    calorieGoal: Number(row?.calorieGoal ?? 2000),
    proteinGoalGrams: Number(row?.proteinGoalGrams ?? 100),
    carbohydrateGoalGrams: Number(row?.carbohydrateGoalGrams ?? 250),
    fatGoalGrams: Number(row?.fatGoalGrams ?? 65),
    fibreGoalGrams: nullableNumber(row?.fibreGoalGrams),
    updatedAt: Number(row?.updatedAt ?? 0)
  };
}

export async function saveNutritionGoals(values: Omit<NutritionGoals, "id" | "ownerId" | "updatedAt">): Promise<void> {
  const now = Date.now();
  await db().runAsync(
    `UPDATE nutrition_goals SET calorieGoal = ?, proteinGoalGrams = ?,
      carbohydrateGoalGrams = ?, fatGoalGrams = ?, fibreGoalGrams = ?,
      syncState = 'pending', updatedAt = ? WHERE id = 'default';`,
    Math.max(1, values.calorieGoal),
    Math.max(0, values.proteinGoalGrams),
    Math.max(0, values.carbohydrateGoalGrams),
    Math.max(0, values.fatGoalGrams),
    values.fibreGoalGrams == null ? null : Math.max(0, values.fibreGoalGrams),
    now
  );
  await queue("goal", "default", now);
}

function mapItem(row: Row): NutritionEntryItem {
  return {
    id: String(row.id), entryId: String(row.entryId), foodId: row.foodId == null ? null : String(row.foodId),
    name: String(row.name), servingQuantity: Number(row.servingQuantity), servingUnit: String(row.servingUnit),
    servingGrams: nullableNumber(row.servingGrams), calories: nullableNumber(row.calories),
    proteinGrams: nullableNumber(row.proteinGrams), carbohydrateGrams: nullableNumber(row.carbohydrateGrams),
    fatGrams: nullableNumber(row.fatGrams), fibreGrams: nullableNumber(row.fibreGrams),
    sugarGrams: nullableNumber(row.sugarGrams), sodiumMilligrams: nullableNumber(row.sodiumMilligrams),
    nutrientSource: String(row.nutrientSource), nutrientSourceRef: row.nutrientSourceRef == null ? null : String(row.nutrientSourceRef),
    servingAssumption: row.servingAssumption == null ? null : String(row.servingAssumption),
    confidence: nullableNumber(row.confidence), sortOrder: Number(row.sortOrder), createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt), deletedAt: nullableNumber(row.deletedAt)
  };
}

export async function getNutritionEntriesForDate(localDate: string): Promise<NutritionEntry[]> {
  const rows = await db().getAllAsync<Row>(
    "SELECT * FROM nutrition_entries WHERE localDate = ? AND deletedAt IS NULL ORDER BY consumedAt ASC;",
    localDate
  );
  if (!rows.length) return [];
  const entryIds = rows.map((row) => String(row.id));
  const placeholders = entryIds.map(() => "?").join(",");
  const itemRows = await db().getAllAsync<Row>(
    `SELECT * FROM nutrition_entry_items WHERE entryId IN (${placeholders}) AND deletedAt IS NULL ORDER BY sortOrder ASC;`,
    ...entryIds
  );
  const items = itemRows.map(mapItem);
  return rows.map((row) => ({
    id: String(row.id), ownerId: row.ownerId == null ? null : String(row.ownerId),
    mealType: row.mealType as NutritionEntry["mealType"], source: row.source as NutritionEntry["source"],
    consumedAt: Number(row.consumedAt), localDate: String(row.localDate), timezone: String(row.timezone),
    imageReference: row.imageReference == null ? null : String(row.imageReference),
    imageMime: row.imageMime == null ? null : String(row.imageMime),
    analyzerProvider: row.analyzerProvider == null ? null : String(row.analyzerProvider),
    analyzerModel: row.analyzerModel == null ? null : String(row.analyzerModel),
    analyzerRequestId: row.analyzerRequestId == null ? null : String(row.analyzerRequestId),
    confidence: nullableNumber(row.confidence), syncState: row.syncState as NutritionEntry["syncState"],
    createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt), deletedAt: nullableNumber(row.deletedAt),
    items: items.filter((item) => item.entryId === String(row.id))
  }));
}

async function queue(resourceType: string, resourceId: string, now = Date.now()): Promise<void> {
  await db().runAsync(
    `INSERT INTO nutrition_sync_queue (resourceType, resourceId, operation, attempts, nextAttemptAt, lastError, createdAt, updatedAt)
     VALUES (?, ?, 'upsert', 0, 0, NULL, ?, ?)
     ON CONFLICT(resourceType, resourceId) DO UPDATE SET operation = 'upsert', attempts = 0,
       nextAttemptAt = 0, lastError = NULL, updatedAt = excluded.updatedAt;`,
    resourceType, resourceId, now, now
  );
}

export async function saveNutritionEntry(draft: NutritionEntryDraft): Promise<string> {
  if (!draft.items.length) throw new Error("Add at least one food item.");
  const now = Date.now();
  const entryId = draft.id ?? id();
  await db().withTransactionAsync(async () => {
    const existing = await db().getFirstAsync<{ createdAt: number }>("SELECT createdAt FROM nutrition_entries WHERE id = ?;", entryId);
    await db().runAsync(
      `INSERT INTO nutrition_entries (id, ownerId, mealType, source, consumedAt, localDate, timezone,
       imageReference, imageMime, analyzerProvider, analyzerModel, analyzerRequestId, confidence,
       syncState, createdAt, updatedAt, deletedAt)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET mealType=excluded.mealType, source=excluded.source,
       consumedAt=excluded.consumedAt, localDate=excluded.localDate, timezone=excluded.timezone,
       imageReference=excluded.imageReference, imageMime=excluded.imageMime,
       analyzerProvider=excluded.analyzerProvider, analyzerModel=excluded.analyzerModel,
       analyzerRequestId=excluded.analyzerRequestId, confidence=excluded.confidence,
       syncState='pending', updatedAt=excluded.updatedAt, deletedAt=NULL;`,
      entryId, draft.mealType, draft.source, draft.consumedAt, draft.localDate, draft.timezone,
      draft.imageReference ?? null, draft.imageMime ?? null, draft.analyzerProvider ?? null,
      draft.analyzerModel ?? null, draft.analyzerRequestId ?? null, draft.confidence ?? null,
      existing?.createdAt ?? now, now
    );
    const retained = new Set<string>();
    for (let index = 0; index < draft.items.length; index += 1) {
      const item = draft.items[index];
      const itemId = item.id ?? id();
      retained.add(itemId);
      const old = await db().getFirstAsync<{ createdAt: number }>("SELECT createdAt FROM nutrition_entry_items WHERE id = ?;", itemId);
      const values: SqlValue[] = [
        itemId, entryId, item.foodId ?? null, item.name.trim(), Math.max(0, item.servingQuantity), item.servingUnit.trim(),
        item.servingGrams ?? null, item.calories ?? null, item.proteinGrams ?? null, item.carbohydrateGrams ?? null,
        item.fatGrams ?? null, item.fibreGrams ?? null, item.sugarGrams ?? null, item.sodiumMilligrams ?? null,
        item.nutrientSource, item.nutrientSourceRef ?? null, item.servingAssumption ?? null,
        item.confidence ?? null, index, old?.createdAt ?? now, now
      ];
      await db().runAsync(
        `INSERT INTO nutrition_entry_items (id, entryId, foodId, name, servingQuantity, servingUnit, servingGrams,
          calories, proteinGrams, carbohydrateGrams, fatGrams, fibreGrams, sugarGrams, sodiumMilligrams,
          nutrientSource, nutrientSourceRef, servingAssumption, confidence, sortOrder, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, servingQuantity=excluded.servingQuantity,
          servingUnit=excluded.servingUnit, servingGrams=excluded.servingGrams, calories=excluded.calories,
          proteinGrams=excluded.proteinGrams, carbohydrateGrams=excluded.carbohydrateGrams,
          fatGrams=excluded.fatGrams, fibreGrams=excluded.fibreGrams, sugarGrams=excluded.sugarGrams,
          sodiumMilligrams=excluded.sodiumMilligrams, nutrientSource=excluded.nutrientSource,
          nutrientSourceRef=excluded.nutrientSourceRef, servingAssumption=excluded.servingAssumption,
          confidence=excluded.confidence, sortOrder=excluded.sortOrder, updatedAt=excluded.updatedAt, deletedAt=NULL;`,
        ...values
      );
    }
    const previous = await db().getAllAsync<{ id: string }>("SELECT id FROM nutrition_entry_items WHERE entryId = ? AND deletedAt IS NULL;", entryId);
    for (const item of previous) {
      if (!retained.has(item.id)) await db().runAsync("UPDATE nutrition_entry_items SET deletedAt=?, updatedAt=? WHERE id=?;", now, now, item.id);
    }
    await queue("entry", entryId, now);
  });
  return entryId;
}

export async function deleteNutritionEntry(entryId: string): Promise<void> {
  const now = Date.now();
  await db().withTransactionAsync(async () => {
    await db().runAsync("UPDATE nutrition_entries SET deletedAt=?, updatedAt=?, syncState='pending' WHERE id=?;", now, now, entryId);
    await db().runAsync("UPDATE nutrition_entry_items SET deletedAt=?, updatedAt=? WHERE entryId=? AND deletedAt IS NULL;", now, now, entryId);
    await queue("entry", entryId, now);
  });
}

export async function getRecentNutritionFoods(limit = 12): Promise<NutritionCatalogueFood[]> {
  const rows = await db().getAllAsync<Row>(
    `SELECT i.* FROM nutrition_entry_items i JOIN nutrition_entries e ON e.id=i.entryId
     WHERE i.deletedAt IS NULL AND e.deletedAt IS NULL
     GROUP BY lower(i.name), i.servingUnit ORDER BY MAX(e.consumedAt) DESC LIMIT ?;`,
    limit
  );
  return rows.map((row) => ({
    id: String(row.foodId ?? row.id), name: String(row.name), aliases: [],
    category: "food", servingQuantity: Number(row.servingQuantity), servingUnit: String(row.servingUnit),
    servingGrams: nullableNumber(row.servingGrams), calories: nullableNumber(row.calories),
    proteinGrams: nullableNumber(row.proteinGrams), carbohydrateGrams: nullableNumber(row.carbohydrateGrams),
    fatGrams: nullableNumber(row.fatGrams), fibreGrams: nullableNumber(row.fibreGrams),
    sugarGrams: nullableNumber(row.sugarGrams), sodiumMilligrams: nullableNumber(row.sodiumMilligrams),
    nutrientSource: String(row.nutrientSource), nutrientSourceRef: String(row.nutrientSourceRef ?? ""),
    servingAssumption: String(row.servingAssumption ?? `${row.servingQuantity} ${row.servingUnit}`)
  }));
}

export async function saveCustomNutritionFood(
  food: Omit<NutritionCatalogueFood, "id" | "aliases">,
  existingId?: string
): Promise<string> {
  const foodId = existingId ?? id();
  const now = Date.now();
  await db().withTransactionAsync(async () => {
    await db().runAsync(
      `INSERT INTO nutrition_custom_foods (id, ownerId, name, category, barcode, servingQuantity, servingUnit,
       servingGrams, calories, proteinGrams, carbohydrateGrams, fatGrams, fibreGrams, sugarGrams,
       sodiumMilligrams, nutrientSource, nutrientSourceRef, servingAssumption, syncState, createdAt, updatedAt, deletedAt)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, barcode=excluded.barcode,
       servingQuantity=excluded.servingQuantity, servingUnit=excluded.servingUnit, servingGrams=excluded.servingGrams,
       calories=excluded.calories, proteinGrams=excluded.proteinGrams, carbohydrateGrams=excluded.carbohydrateGrams,
       fatGrams=excluded.fatGrams, fibreGrams=excluded.fibreGrams, sugarGrams=excluded.sugarGrams,
       sodiumMilligrams=excluded.sodiumMilligrams, nutrientSource=excluded.nutrientSource,
       nutrientSourceRef=excluded.nutrientSourceRef, servingAssumption=excluded.servingAssumption,
       syncState='pending', updatedAt=excluded.updatedAt, deletedAt=NULL;`,
      foodId, food.name.trim(), food.category, food.barcode ?? null, food.servingQuantity, food.servingUnit,
      food.servingGrams, food.calories, food.proteinGrams, food.carbohydrateGrams, food.fatGrams,
      food.fibreGrams, food.sugarGrams, food.sodiumMilligrams, food.nutrientSource,
      food.nutrientSourceRef, food.servingAssumption, now, now
    );
    await queue("custom_food", foodId, now);
  });
  return foodId;
}

export async function searchCustomNutritionFoods(query: string, category?: "food" | "supplement" | "packaged") {
  const normalized = query.trim();
  const rows = await db().getAllAsync<Row>(
    `SELECT * FROM nutrition_custom_foods WHERE deletedAt IS NULL
      AND (? = '' OR name LIKE '%' || ? || '%' COLLATE NOCASE)
      AND (? IS NULL OR category = ?) ORDER BY updatedAt DESC LIMIT 30;`,
    normalized, normalized, category ?? null, category ?? null
  );
  return rows.map((row): NutritionCatalogueFood => ({
    id: String(row.id), name: String(row.name), aliases: [], category: row.category as NutritionCatalogueFood["category"],
    barcode: row.barcode == null ? undefined : String(row.barcode), servingQuantity: Number(row.servingQuantity),
    servingUnit: String(row.servingUnit), servingGrams: nullableNumber(row.servingGrams), calories: nullableNumber(row.calories),
    proteinGrams: nullableNumber(row.proteinGrams), carbohydrateGrams: nullableNumber(row.carbohydrateGrams),
    fatGrams: nullableNumber(row.fatGrams), fibreGrams: nullableNumber(row.fibreGrams), sugarGrams: nullableNumber(row.sugarGrams),
    sodiumMilligrams: nullableNumber(row.sodiumMilligrams), nutrientSource: String(row.nutrientSource),
    nutrientSourceRef: String(row.nutrientSourceRef ?? ""), servingAssumption: String(row.servingAssumption ?? "")
  }));
}

export async function getNutritionDateRange(startDate: string, endDate: string): Promise<NutritionEntry[]> {
  const days: NutritionEntry[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    days.push(...await getNutritionEntriesForDate(key));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function getNutritionDatabaseForSync() { return db(); }
