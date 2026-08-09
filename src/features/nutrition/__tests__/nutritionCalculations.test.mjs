import assert from "node:assert/strict";
import test from "node:test";

import nutritionCalculations from "../nutritionCalculations.ts";
const { convertServingQuantity, dailyTotals, goalProgress, goalProgressForTotals,
  groupEntriesByMeal, scaleNutrients, sumNutrients } = nutritionCalculations;

const nutrients = (calories, protein, carbs, fat, fibre = null) => ({
  calories, proteinGrams: protein, carbohydrateGrams: carbs, fatGrams: fat,
  fibreGrams: fibre, sugarGrams: null, sodiumMilligrams: null
});

test("scales nutrition immediately when serving quantity changes", () => {
  assert.deepEqual(scaleNutrients(nutrients(120, 6, 20, 2), 1.5), nutrients(180, 9, 30, 3));
});

test("converts weight and configured scoop serving units", () => {
  assert.equal(convertServingQuantity(750, "g", "kg"), 0.75);
  assert.equal(convertServingQuantity(2, "scoop", "g", 30), 60);
  assert.equal(convertServingQuantity(15, "g", "scoop", 30), 0.5);
  assert.equal(convertServingQuantity(1, "cup", "g"), null);
});

test("daily totals include multiple foods but exclude soft-deleted rows", () => {
  const entry = { id: "e1", mealType: "lunch", deletedAt: null, items: [
    { ...nutrients(200, 5, 40, 2), deletedAt: null },
    { ...nutrients(150, 10, 8, 9), deletedAt: null },
    { ...nutrients(999, 99, 99, 99), deletedAt: 1 }
  ] };
  assert.deepEqual(dailyTotals([entry]), { calories: 350, proteinGrams: 15,
    carbohydrateGrams: 48, fatGrams: 11, fibreGrams: 0, sugarGrams: 0, sodiumMilligrams: 0 });
});

test("meal grouping and goal progress remain bounded", () => {
  const entries = [
    { id: "b", mealType: "breakfast", deletedAt: null },
    { id: "s", mealType: "snack", deletedAt: null },
    { id: "d", mealType: "dinner", deletedAt: 10 }
  ];
  const grouped = groupEntriesByMeal(entries);
  assert.equal(grouped.breakfast.length, 1); assert.equal(grouped.snack.length, 1); assert.equal(grouped.dinner.length, 0);
  assert.equal(goalProgress(2500, 2000), 1); assert.equal(goalProgress(500, 2000), 0.25); assert.equal(goalProgress(10, null), 0);
  const progress = goalProgressForTotals(sumNutrients([nutrients(1000, 50, 100, 20, 15)]), {
    calorieGoal: 2000, proteinGoalGrams: 100, carbohydrateGoalGrams: 200, fatGoalGrams: 40, fibreGoalGrams: 30
  });
  assert.deepEqual(progress, { calories: 0.5, protein: 0.5, carbohydrates: 0.5, fat: 0.5, fibre: 0.5 });
});
