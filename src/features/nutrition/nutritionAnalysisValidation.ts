import type { NutritionAnalysisResult, NutritionItemDraft } from "./nutritionTypes";

export const MAX_ANALYSIS_IMAGE_BYTES = 1_500_000;
export const ALLOWED_ANALYSIS_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function optionalFinite(value: unknown): number | null {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function validateResolvedItem(value: unknown): NutritionItemDraft | null {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Analyzer returned an invalid catalogue match.");
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || !item.name.trim()) throw new Error("Analyzer returned a food without a name.");
  if (typeof item.servingQuantity !== "number" || item.servingQuantity <= 0 || typeof item.servingUnit !== "string") throw new Error("Analyzer returned an invalid serving.");
  if (typeof item.nutrientSource !== "string" || !item.nutrientSource.trim()) throw new Error("Analyzer did not attribute the nutrition source.");
  return {
    name: item.name.trim(), servingQuantity: item.servingQuantity, servingUnit: item.servingUnit,
    servingGrams: optionalFinite(item.servingGrams), calories: optionalFinite(item.calories),
    proteinGrams: optionalFinite(item.proteinGrams), carbohydrateGrams: optionalFinite(item.carbohydrateGrams),
    fatGrams: optionalFinite(item.fatGrams), fibreGrams: optionalFinite(item.fibreGrams),
    sugarGrams: optionalFinite(item.sugarGrams), sodiumMilligrams: optionalFinite(item.sodiumMilligrams),
    nutrientSource: item.nutrientSource, nutrientSourceRef: typeof item.nutrientSourceRef === "string" ? item.nutrientSourceRef : null,
    servingAssumption: typeof item.servingAssumption === "string" ? item.servingAssumption : null,
    confidence: optionalFinite(item.confidence)
  };
}

export function validateNutritionAnalysisResponse(value: unknown): NutritionAnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Analyzer returned an invalid response.");
  const root = value as Record<string, unknown>;
  if (typeof root.requestId !== "string" || typeof root.provider !== "string" || typeof root.model !== "string") throw new Error("Analyzer response metadata is incomplete.");
  if (!Array.isArray(root.candidates) || root.candidates.length < 1 || root.candidates.length > 20) throw new Error("Analyzer returned no usable foods.");
  const candidates = root.candidates.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Analyzer returned an invalid food candidate.");
    const item = raw as Record<string, unknown>;
    if (typeof item.candidateId !== "string" || !Array.isArray(item.names) || !item.names.length || !item.names.every((name) => typeof name === "string")) throw new Error("Analyzer returned an invalid food candidate.");
    const confidence = optionalFinite(item.confidence);
    if (confidence == null || confidence > 1) throw new Error("Analyzer confidence must be between 0 and 1.");
    return { candidateId: item.candidateId, names: item.names as string[],
      portionDescription: typeof item.portionDescription === "string" ? item.portionDescription : "Serving needs confirmation",
      estimatedGrams: optionalFinite(item.estimatedGrams), confidence,
      catalogueMatch: validateResolvedItem(item.catalogueMatch) };
  });
  const confidence = optionalFinite(root.confidence);
  if (confidence == null || confidence > 1) throw new Error("Analyzer confidence must be between 0 and 1.");
  return { requestId: root.requestId, provider: root.provider, model: root.model, confidence, candidates,
    warnings: Array.isArray(root.warnings) ? root.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 10) : [] };
}

export function validateImageUpload(size: number, mimeType: string): void {
  if (!ALLOWED_ANALYSIS_MIME_TYPES.includes(mimeType as (typeof ALLOWED_ANALYSIS_MIME_TYPES)[number])) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ANALYSIS_IMAGE_BYTES) throw new Error("The compressed meal photo is too large. Try another photo.");
}
