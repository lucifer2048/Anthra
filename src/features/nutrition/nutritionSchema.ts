export const NUTRITION_TABLE_NAMES = [
  "nutrition_goals",
  "nutrition_entries",
  "nutrition_entry_items",
  "nutrition_custom_foods",
  "nutrition_sync_queue"
] as const;

// These migrations are deliberately additive. Stable text IDs are generated on
// device so the same mutation can be retried locally and in Supabase safely.
export const NUTRITION_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS nutrition_goals (
    id TEXT PRIMARY KEY NOT NULL,
    ownerId TEXT,
    calorieGoal REAL NOT NULL DEFAULT 2000,
    proteinGoalGrams REAL NOT NULL DEFAULT 100,
    carbohydrateGoalGrams REAL NOT NULL DEFAULT 250,
    fatGoalGrams REAL NOT NULL DEFAULT 65,
    fibreGoalGrams REAL,
    syncState TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS nutrition_entries (
    id TEXT PRIMARY KEY NOT NULL,
    ownerId TEXT,
    mealType TEXT NOT NULL CHECK (mealType IN ('breakfast','lunch','dinner','snack')),
    source TEXT NOT NULL CHECK (source IN ('photo','barcode','supplement','search','quick-add','manual')),
    consumedAt INTEGER NOT NULL,
    localDate TEXT NOT NULL,
    timezone TEXT NOT NULL,
    imageReference TEXT,
    imageMime TEXT,
    analyzerProvider TEXT,
    analyzerModel TEXT,
    analyzerRequestId TEXT,
    confidence REAL,
    syncState TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );`,
  `CREATE INDEX IF NOT EXISTS idx_nutrition_entries_date
    ON nutrition_entries(localDate, mealType, consumedAt);`,
  `CREATE INDEX IF NOT EXISTS idx_nutrition_entries_sync
    ON nutrition_entries(syncState, updatedAt);`,
  `CREATE TABLE IF NOT EXISTS nutrition_entry_items (
    id TEXT PRIMARY KEY NOT NULL,
    entryId TEXT NOT NULL,
    foodId TEXT,
    name TEXT NOT NULL,
    servingQuantity REAL NOT NULL,
    servingUnit TEXT NOT NULL,
    servingGrams REAL,
    calories REAL,
    proteinGrams REAL,
    carbohydrateGrams REAL,
    fatGrams REAL,
    fibreGrams REAL,
    sugarGrams REAL,
    sodiumMilligrams REAL,
    nutrientSource TEXT NOT NULL,
    nutrientSourceRef TEXT,
    servingAssumption TEXT,
    confidence REAL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER,
    FOREIGN KEY (entryId) REFERENCES nutrition_entries(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_nutrition_items_entry
    ON nutrition_entry_items(entryId, sortOrder);`,
  `CREATE TABLE IF NOT EXISTS nutrition_custom_foods (
    id TEXT PRIMARY KEY NOT NULL,
    ownerId TEXT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'food',
    barcode TEXT,
    servingQuantity REAL NOT NULL,
    servingUnit TEXT NOT NULL,
    servingGrams REAL,
    calories REAL,
    proteinGrams REAL,
    carbohydrateGrams REAL,
    fatGrams REAL,
    fibreGrams REAL,
    sugarGrams REAL,
    sodiumMilligrams REAL,
    nutrientSource TEXT NOT NULL DEFAULT 'user_label',
    nutrientSourceRef TEXT,
    servingAssumption TEXT,
    syncState TEXT NOT NULL DEFAULT 'pending',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_nutrition_custom_barcode
    ON nutrition_custom_foods(ownerId, barcode) WHERE barcode IS NOT NULL AND deletedAt IS NULL;`,
  `CREATE TABLE IF NOT EXISTS nutrition_sync_queue (
    resourceType TEXT NOT NULL,
    resourceId TEXT NOT NULL,
    operation TEXT NOT NULL DEFAULT 'upsert',
    attempts INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt INTEGER NOT NULL DEFAULT 0,
    lastError TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY (resourceType, resourceId)
  );`,
  `INSERT OR IGNORE INTO nutrition_goals (
    id, ownerId, calorieGoal, proteinGoalGrams, carbohydrateGoalGrams,
    fatGoalGrams, fibreGoalGrams, syncState, createdAt, updatedAt, deletedAt
  ) VALUES ('default', NULL, 2000, 100, 250, 65, NULL, 'pending', 0, 0, NULL);`
] as const;
