import type { NutritionCatalogueFood } from "./nutritionTypes";

export interface NutritionDataProvider {
  readonly id: string;
  search(query: string, limit?: number): Promise<NutritionCatalogueFood[]>;
  findByBarcode(barcode: string): Promise<NutritionCatalogueFood | null>;
}

/**
 * Provider composition only. Anthra intentionally ships no guessed nutrient
 * rows; production deployments should import licensed/attributable IFCT/NIN
 * and USDA datasets as described in docs/nutrition.md.
 */
export class CompositeNutritionDataProvider implements NutritionDataProvider {
  readonly id = "composite";
  constructor(private readonly providers: NutritionDataProvider[]) {}
  async search(query: string, limit = 20) {
    const results = (await Promise.all(this.providers.map((provider) => provider.search(query, limit)))).flat();
    return [...new Map(results.map((food) => [food.id, food])).values()].slice(0, limit);
  }
  async findByBarcode(barcode: string) {
    for (const provider of this.providers) {
      const result = await provider.findByBarcode(barcode);
      if (result) return result;
    }
    return null;
  }
}
