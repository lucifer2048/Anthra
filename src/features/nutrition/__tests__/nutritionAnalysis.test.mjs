import assert from "node:assert/strict";
import test from "node:test";

import nutritionAnalysisValidation from "../nutritionAnalysisValidation.ts";
const { MAX_ANALYSIS_IMAGE_BYTES, validateImageUpload, validateNutritionAnalysisResponse } = nutritionAnalysisValidation;

const match = (name) => ({ name, servingQuantity: 1, servingUnit: "bowl", servingGrams: 180,
  calories: 210, proteinGrams: 9, carbohydrateGrams: 32, fatGrams: 5, fibreGrams: 6,
  sugarGrams: null, sodiumMilligrams: 400, nutrientSource: "IFCT-import",
  nutrientSourceRef: "dataset-row-1", servingAssumption: "180 g bowl", confidence: 0.7 });

test("accepts multiple resolved foods from one mixed-meal image", () => {
  const result = validateNutritionAnalysisResponse({ requestId: "r1", provider: "self-hosted", model: "food-v1", confidence: 0.62,
    candidates: [
      { candidateId: "1", names: ["dal"], portionDescription: "one katori", estimatedGrams: 180, confidence: 0.8, catalogueMatch: match("Dal") },
      { candidateId: "2", names: ["rice"], portionDescription: "one cup", estimatedGrams: 160, confidence: 0.58, catalogueMatch: match("Rice") }
    ], warnings: ["Oil cannot be observed reliably"] });
  assert.equal(result.candidates.length, 2); assert.equal(result.candidates[1].catalogueMatch.name, "Rice");
});

test("preserves low confidence so the UI can warn instead of claiming certainty", () => {
  const result = validateNutritionAnalysisResponse({ requestId: "r2", provider: "hosted", model: "v1", confidence: 0.2,
    candidates: [{ candidateId: "1", names: ["curry"], portionDescription: "unknown", estimatedGrams: null, confidence: 0.2, catalogueMatch: null }] });
  assert.equal(result.confidence, 0.2); assert.equal(result.candidates[0].catalogueMatch, null);
});

test("rejects failed, untrusted, and unattributed model responses", () => {
  assert.throws(() => validateNutritionAnalysisResponse({ candidates: [] }));
  assert.throws(() => validateNutritionAnalysisResponse({ requestId: "x", provider: "p", model: "m", confidence: 2,
    candidates: [{ candidateId: "1", names: ["food"], confidence: 0.5 }] }));
  assert.throws(() => validateNutritionAnalysisResponse({ requestId: "x", provider: "p", model: "m", confidence: 0.5,
    candidates: [{ candidateId: "1", names: ["food"], confidence: 0.5, catalogueMatch: { ...match("Food"), nutrientSource: "" } }] }));
});

test("enforces compressed image size and MIME", () => {
  assert.doesNotThrow(() => validateImageUpload(MAX_ANALYSIS_IMAGE_BYTES, "image/jpeg"));
  assert.throws(() => validateImageUpload(MAX_ANALYSIS_IMAGE_BYTES + 1, "image/jpeg"));
  assert.throws(() => validateImageUpload(100, "application/pdf"));
  assert.throws(() => validateImageUpload(0, "image/png"));
});
