export type NutritionMealType = "breakfast" | "lunch" | "dinner" | "snack";
export type NutritionSource = "photo" | "barcode" | "supplement" | "search" | "quick-add" | "manual";
export type NutritionSyncState = "pending" | "synced" | "failed";

export type Nutrients = {
  calories: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  fibreGrams: number | null;
  sugarGrams: number | null;
  sodiumMilligrams: number | null;
};

export type NutritionGoals = {
  id: string;
  ownerId: string | null;
  calorieGoal: number;
  proteinGoalGrams: number;
  carbohydrateGoalGrams: number;
  fatGoalGrams: number;
  fibreGoalGrams: number | null;
  updatedAt: number;
};

export type NutritionEntryItem = Nutrients & {
  id: string;
  entryId: string;
  foodId: string | null;
  name: string;
  servingQuantity: number;
  servingUnit: string;
  servingGrams: number | null;
  nutrientSource: string;
  nutrientSourceRef: string | null;
  servingAssumption: string | null;
  confidence: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type NutritionEntry = {
  id: string;
  ownerId: string | null;
  mealType: NutritionMealType;
  source: NutritionSource;
  consumedAt: number;
  localDate: string;
  timezone: string;
  imageReference: string | null;
  imageMime: string | null;
  analyzerProvider: string | null;
  analyzerModel: string | null;
  analyzerRequestId: string | null;
  confidence: number | null;
  syncState: NutritionSyncState;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  items: NutritionEntryItem[];
};

export type NutritionItemDraft = Nutrients & {
  id?: string;
  foodId?: string | null;
  name: string;
  servingQuantity: number;
  servingUnit: string;
  servingGrams?: number | null;
  nutrientSource: string;
  nutrientSourceRef?: string | null;
  servingAssumption?: string | null;
  confidence?: number | null;
};

export type NutritionEntryDraft = {
  id?: string;
  mealType: NutritionMealType;
  source: NutritionSource;
  consumedAt: number;
  localDate: string;
  timezone: string;
  imageReference?: string | null;
  imageMime?: string | null;
  analyzerProvider?: string | null;
  analyzerModel?: string | null;
  analyzerRequestId?: string | null;
  confidence?: number | null;
  items: NutritionItemDraft[];
};

export type NutritionCatalogueFood = Nutrients & {
  id: string;
  name: string;
  aliases: string[];
  category: "food" | "supplement" | "packaged";
  servingQuantity: number;
  servingUnit: string;
  servingGrams: number | null;
  nutrientSource: string;
  nutrientSourceRef: string;
  servingAssumption: string;
  barcode?: string;
};

export type AnalyzedFoodCandidate = {
  candidateId: string;
  names: string[];
  portionDescription: string;
  estimatedGrams: number | null;
  confidence: number;
  catalogueMatch: NutritionItemDraft | null;
};

export type NutritionAnalysisResult = {
  requestId: string;
  provider: string;
  model: string;
  confidence: number;
  candidates: AnalyzedFoodCandidate[];
  warnings: string[];
};
