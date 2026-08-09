import type { NutritionEntry, NutritionGoals, Nutrients } from "./nutritionTypes";

export const EMPTY_NUTRIENTS: Nutrients = {
  calories: 0,
  proteinGrams: 0,
  carbohydrateGrams: 0,
  fatGrams: 0,
  fibreGrams: 0,
  sugarGrams: 0,
  sodiumMilligrams: 0
};

export function safeNutrient(value: number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function scaleNutrients(nutrients: Nutrients, multiplier: number): Nutrients {
  const scale = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 0;
  const result = {} as Nutrients;
  for (const key of Object.keys(EMPTY_NUTRIENTS) as (keyof Nutrients)[]) {
    result[key] = nutrients[key] == null ? null : safeNutrient(nutrients[key]) * scale;
  }
  return result;
}

export function sumNutrients(values: Array<Partial<Nutrients>>): Nutrients {
  const result = { ...EMPTY_NUTRIENTS };
  for (const value of values) {
    for (const key of Object.keys(result) as (keyof Nutrients)[]) {
      result[key] = safeNutrient(result[key]) + safeNutrient(value[key]);
    }
  }
  return result;
}

export function dailyTotals(entries: NutritionEntry[]): Nutrients {
  return sumNutrients(
    entries
      .filter((entry) => entry.deletedAt == null)
      .flatMap((entry) => entry.items.filter((item) => item.deletedAt == null))
  );
}

export function groupEntriesByMeal(entries: NutritionEntry[]) {
  return {
    breakfast: entries.filter((entry) => entry.mealType === "breakfast" && entry.deletedAt == null),
    lunch: entries.filter((entry) => entry.mealType === "lunch" && entry.deletedAt == null),
    dinner: entries.filter((entry) => entry.mealType === "dinner" && entry.deletedAt == null),
    snack: entries.filter((entry) => entry.mealType === "snack" && entry.deletedAt == null)
  };
}

export function goalProgress(total: number | null, goal: number | null): number {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(1, safeNutrient(total) / goal));
}

export function goalProgressForTotals(totals: Nutrients, goals: NutritionGoals) {
  return {
    calories: goalProgress(totals.calories, goals.calorieGoal),
    protein: goalProgress(totals.proteinGrams, goals.proteinGoalGrams),
    carbohydrates: goalProgress(totals.carbohydrateGrams, goals.carbohydrateGoalGrams),
    fat: goalProgress(totals.fatGrams, goals.fatGoalGrams),
    fibre: goalProgress(totals.fibreGrams, goals.fibreGoalGrams)
  };
}

export function convertServingQuantity(
  value: number,
  fromUnit: string,
  toUnit: string,
  gramsPerServing?: number | null
): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const normalizedFrom = fromUnit.trim().toLowerCase();
  const normalizedTo = toUnit.trim().toLowerCase();
  if (normalizedFrom === normalizedTo) return value;
  const weights: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, mg: 0.001 };
  const fromWeight = weights[normalizedFrom];
  const toWeight = weights[normalizedTo];
  if (fromWeight && toWeight) return (value * fromWeight) / toWeight;
  if (gramsPerServing && gramsPerServing > 0) {
    if (["serving", "scoop", "tablet", "capsule"].includes(normalizedFrom) && toWeight) {
      return (value * gramsPerServing) / toWeight;
    }
    if (fromWeight && ["serving", "scoop", "tablet", "capsule"].includes(normalizedTo)) {
      return (value * fromWeight) / gramsPerServing;
    }
  }
  return null;
}
