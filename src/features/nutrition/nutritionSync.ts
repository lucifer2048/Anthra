import type { SupabaseClient } from "@supabase/supabase-js";
import { getNutritionDatabaseForSync } from "./nutritionRepository";

type Row = Record<string, unknown>;

function iso(value: unknown): string | null {
  return value == null ? null : new Date(Number(value)).toISOString();
}

function millis(value: unknown): number { const result = Date.parse(String(value ?? "")); return Number.isFinite(result) ? result : 0; }

function entryCloud(row: Row, userId: string) {
  return {
    id: row.id, user_id: userId, meal_type: row.mealType, source: row.source,
    consumed_at: iso(row.consumedAt), local_date: row.localDate, timezone: row.timezone,
    image_path: row.imageReference, image_mime: row.imageMime, analyzer_provider: row.analyzerProvider,
    analyzer_model: row.analyzerModel, analyzer_request_id: row.analyzerRequestId, confidence: row.confidence,
    client_created_at: iso(row.createdAt), client_updated_at: iso(row.updatedAt), deleted_at: iso(row.deletedAt)
  };
}

function itemCloud(row: Row, userId: string) {
  return {
    id: row.id, entry_id: row.entryId, user_id: userId, food_id: row.foodId, name: row.name,
    serving_quantity: row.servingQuantity, serving_unit: row.servingUnit, serving_grams: row.servingGrams,
    calories: row.calories, protein_grams: row.proteinGrams, carbohydrate_grams: row.carbohydrateGrams,
    fat_grams: row.fatGrams, fibre_grams: row.fibreGrams, sugar_grams: row.sugarGrams,
    sodium_milligrams: row.sodiumMilligrams, nutrient_source: row.nutrientSource,
    nutrient_source_ref: row.nutrientSourceRef, serving_assumption: row.servingAssumption,
    confidence: row.confidence, sort_order: row.sortOrder, client_created_at: iso(row.createdAt),
    client_updated_at: iso(row.updatedAt), deleted_at: iso(row.deletedAt)
  };
}

/** Last-write-wins uses client_updated_at. IDs are stable and every cloud write
 * is an upsert, so retries cannot duplicate meals. Local rows remain canonical. */
export async function syncNutrition(client: SupabaseClient, userId: string): Promise<void> {
  const db = getNutritionDatabaseForSync();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE nutrition_entries SET ownerId=? WHERE ownerId IS NULL;", userId);
    await db.runAsync("UPDATE nutrition_goals SET ownerId=? WHERE ownerId IS NULL;", userId);
    await db.runAsync("UPDATE nutrition_custom_foods SET ownerId=? WHERE ownerId IS NULL;", userId);
  });
  const queue = await db.getAllAsync<{ resourceType: string; resourceId: string; attempts: number }>(
    "SELECT * FROM nutrition_sync_queue WHERE nextAttemptAt <= ? ORDER BY createdAt LIMIT 50;", now
  );
  for (const job of queue) {
    try {
      if (job.resourceType === "entry") {
        const entry = await db.getFirstAsync<Row>("SELECT * FROM nutrition_entries WHERE id=?;", job.resourceId);
        if (entry) {
          const items = await db.getAllAsync<Row>("SELECT * FROM nutrition_entry_items WHERE entryId=?;", job.resourceId);
          const entryResult = await client.from("nutrition_entries").upsert(entryCloud(entry, userId), { onConflict: "id" });
          if (entryResult.error) throw entryResult.error;
          if (items.length) {
            const itemResult = await client.from("nutrition_entry_items").upsert(items.map((item) => itemCloud(item, userId)), { onConflict: "id" });
            if (itemResult.error) throw itemResult.error;
          }
          await db.runAsync("UPDATE nutrition_entries SET syncState='synced' WHERE id=?;", job.resourceId);
        }
      } else if (job.resourceType === "goal") {
        const goal = await db.getFirstAsync<Row>("SELECT * FROM nutrition_goals WHERE id='default';");
        if (goal) {
          const result = await client.from("nutrition_goals").upsert({
            user_id: userId, calorie_goal: goal.calorieGoal, protein_goal_grams: goal.proteinGoalGrams,
            carbohydrate_goal_grams: goal.carbohydrateGoalGrams, fat_goal_grams: goal.fatGoalGrams,
            fibre_goal_grams: goal.fibreGoalGrams, client_updated_at: iso(goal.updatedAt), deleted_at: iso(goal.deletedAt)
          }, { onConflict: "user_id" });
          if (result.error) throw result.error;
          await db.runAsync("UPDATE nutrition_goals SET syncState='synced' WHERE id='default';");
        }
      } else if (job.resourceType === "custom_food") {
        const food = await db.getFirstAsync<Row>("SELECT * FROM nutrition_custom_foods WHERE id=?;", job.resourceId);
        if (food) {
          const result = await client.from("nutrition_custom_foods").upsert({
            id: food.id, user_id: userId, name: food.name, category: food.category, barcode: food.barcode,
            serving_quantity: food.servingQuantity, serving_unit: food.servingUnit, serving_grams: food.servingGrams,
            calories: food.calories, protein_grams: food.proteinGrams, carbohydrate_grams: food.carbohydrateGrams,
            fat_grams: food.fatGrams, fibre_grams: food.fibreGrams, sugar_grams: food.sugarGrams,
            sodium_milligrams: food.sodiumMilligrams, nutrient_source: food.nutrientSource,
            nutrient_source_ref: food.nutrientSourceRef, serving_assumption: food.servingAssumption,
            client_created_at: iso(food.createdAt), client_updated_at: iso(food.updatedAt), deleted_at: iso(food.deletedAt)
          }, { onConflict: "id" });
          if (result.error) throw result.error;
          await db.runAsync("UPDATE nutrition_custom_foods SET syncState='synced' WHERE id=?;", job.resourceId);
        }
      }
      await db.runAsync("DELETE FROM nutrition_sync_queue WHERE resourceType=? AND resourceId=?;", job.resourceType, job.resourceId);
    } catch (error) {
      const attempts = job.attempts + 1;
      const delay = Math.min(3_600_000, 5_000 * 2 ** Math.min(attempts, 8));
      const message = error instanceof Error ? error.message.slice(0, 500) : "Sync failed";
      await db.runAsync(
        "UPDATE nutrition_sync_queue SET attempts=?, nextAttemptAt=?, lastError=?, updatedAt=? WHERE resourceType=? AND resourceId=?;",
        attempts, now + delay, message, now, job.resourceType, job.resourceId
      );
      if (job.resourceType === "entry") await db.runAsync("UPDATE nutrition_entries SET syncState='failed' WHERE id=?;", job.resourceId);
    }
  }

  // Pull after pushes. A newer local pending edit wins; otherwise the remote
  // client_updated_at snapshot is applied without creating a new queue item.
  const [entryResult, itemResult, goalResult, foodResult] = await Promise.all([
    client.from("nutrition_entries").select("*").order("client_updated_at", { ascending: false }).limit(2000),
    client.from("nutrition_entry_items").select("*").order("client_updated_at", { ascending: false }).limit(5000),
    client.from("nutrition_goals").select("*").maybeSingle(),
    client.from("nutrition_custom_foods").select("*").order("client_updated_at", { ascending: false }).limit(2000)
  ]);
  if (entryResult.error || itemResult.error || goalResult.error || foodResult.error) return;
  await db.withTransactionAsync(async () => {
    for (const row of entryResult.data ?? []) {
      const remoteUpdated = millis(row.client_updated_at);
      const local = await db.getFirstAsync<{ updatedAt: number }>("SELECT updatedAt FROM nutrition_entries WHERE id=?;", row.id);
      if (local && local.updatedAt >= remoteUpdated) continue;
      await db.runAsync(
        `INSERT INTO nutrition_entries (id, ownerId, mealType, source, consumedAt, localDate, timezone, imageReference,
         imageMime, analyzerProvider, analyzerModel, analyzerRequestId, confidence, syncState, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ownerId=excluded.ownerId, mealType=excluded.mealType, source=excluded.source,
         consumedAt=excluded.consumedAt, localDate=excluded.localDate, timezone=excluded.timezone,
         imageReference=excluded.imageReference, imageMime=excluded.imageMime, analyzerProvider=excluded.analyzerProvider,
         analyzerModel=excluded.analyzerModel, analyzerRequestId=excluded.analyzerRequestId, confidence=excluded.confidence,
         syncState='synced', updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt;`,
        row.id, userId, row.meal_type, row.source, millis(row.consumed_at), row.local_date, row.timezone,
        row.image_path, row.image_mime, row.analyzer_provider, row.analyzer_model, row.analyzer_request_id,
        row.confidence, millis(row.client_created_at), remoteUpdated, row.deleted_at ? millis(row.deleted_at) : null
      );
    }
    for (const row of itemResult.data ?? []) {
      const remoteUpdated = millis(row.client_updated_at);
      const local = await db.getFirstAsync<{ updatedAt: number }>("SELECT updatedAt FROM nutrition_entry_items WHERE id=?;", row.id);
      if (local && local.updatedAt >= remoteUpdated) continue;
      await db.runAsync(
        `INSERT INTO nutrition_entry_items (id, entryId, foodId, name, servingQuantity, servingUnit, servingGrams,
         calories, proteinGrams, carbohydrateGrams, fatGrams, fibreGrams, sugarGrams, sodiumMilligrams,
         nutrientSource, nutrientSourceRef, servingAssumption, confidence, sortOrder, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, servingQuantity=excluded.servingQuantity,
         servingUnit=excluded.servingUnit, servingGrams=excluded.servingGrams, calories=excluded.calories,
         proteinGrams=excluded.proteinGrams, carbohydrateGrams=excluded.carbohydrateGrams, fatGrams=excluded.fatGrams,
         fibreGrams=excluded.fibreGrams, sugarGrams=excluded.sugarGrams, sodiumMilligrams=excluded.sodiumMilligrams,
         nutrientSource=excluded.nutrientSource, nutrientSourceRef=excluded.nutrientSourceRef,
         servingAssumption=excluded.servingAssumption, confidence=excluded.confidence, sortOrder=excluded.sortOrder,
         updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt;`,
        row.id, row.entry_id, row.food_id, row.name, row.serving_quantity, row.serving_unit, row.serving_grams,
        row.calories, row.protein_grams, row.carbohydrate_grams, row.fat_grams, row.fibre_grams, row.sugar_grams,
        row.sodium_milligrams, row.nutrient_source, row.nutrient_source_ref, row.serving_assumption, row.confidence,
        row.sort_order, millis(row.client_created_at), remoteUpdated, row.deleted_at ? millis(row.deleted_at) : null
      );
    }
    const goal = goalResult.data;
    if (goal) {
      const remoteUpdated = millis(goal.client_updated_at);
      const local = await db.getFirstAsync<{ updatedAt: number }>("SELECT updatedAt FROM nutrition_goals WHERE id='default';");
      if (!local || local.updatedAt < remoteUpdated) await db.runAsync(
        `UPDATE nutrition_goals SET ownerId=?, calorieGoal=?, proteinGoalGrams=?, carbohydrateGoalGrams=?,
         fatGoalGrams=?, fibreGoalGrams=?, syncState='synced', updatedAt=?, deletedAt=? WHERE id='default';`,
        userId, goal.calorie_goal, goal.protein_goal_grams, goal.carbohydrate_goal_grams, goal.fat_goal_grams,
        goal.fibre_goal_grams, remoteUpdated, goal.deleted_at ? millis(goal.deleted_at) : null
      );
    }
    for (const row of foodResult.data ?? []) {
      const remoteUpdated = millis(row.client_updated_at);
      const local = await db.getFirstAsync<{ updatedAt: number }>("SELECT updatedAt FROM nutrition_custom_foods WHERE id=?;", row.id);
      if (local && local.updatedAt >= remoteUpdated) continue;
      await db.runAsync(
        `INSERT INTO nutrition_custom_foods (id, ownerId, name, category, barcode, servingQuantity, servingUnit,
         servingGrams, calories, proteinGrams, carbohydrateGrams, fatGrams, fibreGrams, sugarGrams,
         sodiumMilligrams, nutrientSource, nutrientSourceRef, servingAssumption, syncState, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET ownerId=excluded.ownerId, name=excluded.name, category=excluded.category,
         barcode=excluded.barcode, servingQuantity=excluded.servingQuantity, servingUnit=excluded.servingUnit,
         servingGrams=excluded.servingGrams, calories=excluded.calories, proteinGrams=excluded.proteinGrams,
         carbohydrateGrams=excluded.carbohydrateGrams, fatGrams=excluded.fatGrams, fibreGrams=excluded.fibreGrams,
         sugarGrams=excluded.sugarGrams, sodiumMilligrams=excluded.sodiumMilligrams,
         nutrientSource=excluded.nutrientSource, nutrientSourceRef=excluded.nutrientSourceRef,
         servingAssumption=excluded.servingAssumption, syncState='synced', updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt;`,
        row.id, userId, row.name, row.category, row.barcode, row.serving_quantity, row.serving_unit, row.serving_grams,
        row.calories, row.protein_grams, row.carbohydrate_grams, row.fat_grams, row.fibre_grams, row.sugar_grams,
        row.sodium_milligrams, row.nutrient_source, row.nutrient_source_ref, row.serving_assumption,
        millis(row.client_created_at), remoteUpdated, row.deleted_at ? millis(row.deleted_at) : null
      );
    }
  });
}
