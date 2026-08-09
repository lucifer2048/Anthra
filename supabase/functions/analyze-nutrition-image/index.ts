import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BYTES = 1_500_000;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const IDENTIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    confidence: { type: "number", minimum: 0, maximum: 1 },
    candidates: {
      type: "array", minItems: 1, maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: { type: "string" },
          names: { type: "array", minItems: 1, items: { type: "string" } },
          portionDescription: { type: "string" },
          estimatedGrams: { type: ["number", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["candidateId", "names", "portionDescription", "estimatedGrams", "confidence"]
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["confidence", "candidates", "warnings"]
};

type Candidate = { candidateId: string; names: string[]; portionDescription: string; estimatedGrams: number | null; confidence: number };
type Identification = { confidence: number; candidates: Candidate[]; warnings?: string[] };

interface VisionProvider { id: string; model: string; identify(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<Identification>; }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function validSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return mime === "image/webp" && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

function unwrapProviderJson(value: unknown): unknown {
  let parsed = value;
  for (let depth = 0; depth < 3 && typeof parsed === "string"; depth += 1) {
    let source = parsed.trim();
    const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) source = fenced[1].trim();
    parsed = JSON.parse(source);
  }
  return parsed;
}

function validateIdentification(value: unknown): Identification {
  value = unwrapProviderJson(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider response is not an object");
  const root = value as Record<string, unknown>;
  if (typeof root.confidence !== "number" || root.confidence < 0 || root.confidence > 1) throw new Error("Invalid confidence");
  if (!Array.isArray(root.candidates) || root.candidates.length < 1 || root.candidates.length > 20) throw new Error("Invalid candidates");
  const candidates = root.candidates.map((raw, index): Candidate => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid candidate");
    const item = raw as Record<string, unknown>;
    if (!Array.isArray(item.names) || !item.names.length || !item.names.every((name) => typeof name === "string")) throw new Error("Candidate names required");
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) throw new Error("Invalid candidate confidence");
    return { candidateId: typeof item.candidateId === "string" ? item.candidateId : `candidate-${index + 1}`,
      names: item.names as string[], portionDescription: typeof item.portionDescription === "string" ? item.portionDescription : "Needs confirmation",
      estimatedGrams: item.estimatedGrams == null ? null : Number(item.estimatedGrams), confidence: item.confidence };
  });
  return { confidence: root.confidence, candidates, warnings: Array.isArray(root.warnings) ? root.warnings.filter((item): item is string => typeof item === "string") : [] };
}

class OpenAICompatibleProvider implements VisionProvider {
  id = "openai-compatible";
  model = Deno.env.get("NUTRITION_VISION_MODEL") || "";
  async identify(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<Identification> {
    const baseUrl = Deno.env.get("NUTRITION_VISION_BASE_URL"); const apiKey = Deno.env.get("NUTRITION_VISION_API_KEY");
    if (!baseUrl || !apiKey || !this.model) throw new Error("Hosted vision provider is not configured");
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal,
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: this.model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: [
        { type: "text", text: "Identify visible foods and plausible portion descriptions. Return JSON: confidence 0..1, candidates array with candidateId, names (include Indian/local names), portionDescription, estimatedGrams or null, confidence. Do not return calories or nutrients." },
        { type: "image_url", image_url: { url: `data:${mime};base64,${btoa(binary)}` } }
      ] }] }) });
    if (!response.ok) {
      let providerDetail = "";
      try {
        const failure = await response.json();
        const rawDetail = failure?.error?.message;
        if (typeof rawDetail === "string") {
          providerDetail = rawDetail.replaceAll(apiKey, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 240);
        }
      } catch {
        // The HTTP status remains actionable when the provider returns a non-JSON error page.
      }
      throw new Error(`Vision provider failed (${response.status})${providerDetail ? `: ${providerDetail}` : ""}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return validateIdentification(content);
  }
}

class GeminiProvider implements VisionProvider {
  id = "gemini";
  model = Deno.env.get("NUTRITION_VISION_MODEL") || "";
  async identify(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<Identification> {
    const apiKey = Deno.env.get("NUTRITION_VISION_API_KEY");
    if (!apiKey || !this.model) throw new Error("Gemini vision provider is not configured");
    let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await fetch(endpoint, { method: "POST", signal,
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [
        { inlineData: { mimeType: mime, data: btoa(binary) } },
        { text: "Identify visible foods and plausible portion descriptions. Return JSON: confidence 0..1, candidates array with candidateId, names (include Indian/local names), portionDescription, estimatedGrams or null, confidence. Do not return calories or nutrients." }
      ] }], generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: IDENTIFICATION_SCHEMA
      } }) });
    if (!response.ok) {
      let providerDetail = "";
      try {
        const failure = await response.json();
        const rawDetail = failure?.error?.message;
        if (typeof rawDetail === "string") providerDetail = rawDetail.replaceAll(apiKey, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 240);
      } catch {
        // The HTTP status remains actionable when Gemini returns a non-JSON error page.
      }
      throw new Error(`Gemini provider failed (${response.status})${providerDetail ? `: ${providerDetail}` : ""}`);
    }
    const payload = await response.json();
    const content = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: unknown }) => typeof part.text === "string" ? part.text : "")
      .join("")
      .trim();
    if (!content) throw new Error("Gemini returned no food-identification result");
    return validateIdentification(content);
  }
}

class SelfHostedProvider implements VisionProvider {
  id = "self-hosted"; model = Deno.env.get("NUTRITION_SELF_HOSTED_MODEL") || "self-hosted";
  async identify(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<Identification> {
    const endpoint = Deno.env.get("NUTRITION_SELF_HOSTED_URL"); if (!endpoint) throw new Error("Self-hosted analyzer is not configured");
    const response = await fetch(endpoint, { method: "POST", signal, headers: { "content-type": mime }, body: bytes });
    if (!response.ok) throw new Error(`Self-hosted analyzer failed (${response.status})`);
    return validateIdentification(await response.json());
  }
}

function provider(): VisionProvider {
  const configured = Deno.env.get("NUTRITION_ANALYZER_PROVIDER")?.trim();
  const selected = configured
    || (Deno.env.get("NUTRITION_SELF_HOSTED_URL") ? "self-hosted" : "")
    || (Deno.env.get("NUTRITION_VISION_BASE_URL")
      && Deno.env.get("NUTRITION_VISION_API_KEY")
      && Deno.env.get("NUTRITION_VISION_MODEL") ? "openai-compatible" : "")
    || "development";
  if (selected === "openai-compatible") return new OpenAICompatibleProvider();
  if (selected === "gemini") return new GeminiProvider();
  if (selected === "self-hosted") return new SelfHostedProvider();
  throw new Error("Development provider is active; photo analysis is intentionally unavailable");
}

function finiteNutrient(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function scaledNutrient(food: Record<string, unknown>, nutrientNumbers: string[], grams: number): number | null {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const nutrient = nutrients.find((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const item = raw as Record<string, unknown>;
    return nutrientNumbers.includes(String(item.nutrientNumber ?? item.number ?? ""));
  }) as Record<string, unknown> | undefined;
  const per100Grams = finiteNutrient(nutrient?.value ?? nutrient?.amount);
  return per100Grams == null ? null : Math.round(per100Grams * grams) / 100;
}

async function resolveWithUsda(candidate: Candidate, signal: AbortSignal) {
  const apiKey = Deno.env.get("USDA_FDC_API_KEY");
  if (!apiKey) return null;
  const query = candidate.names.find((name) => name.trim())?.trim();
  if (!query) return null;
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search", {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query, dataType: ["Foundation", "SR Legacy"], pageSize: 5 })
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const food = Array.isArray(payload?.foods)
    ? payload.foods.find((item: unknown) => item && typeof item === "object" && !Array.isArray(item))
    : null;
  if (!food) return null;
  const record = food as Record<string, unknown>;
  const fdcId = finiteNutrient(record.fdcId);
  const grams = candidate.estimatedGrams != null && candidate.estimatedGrams > 0
    ? Math.min(candidate.estimatedGrams, 5000)
    : 100;
  const description = typeof record.description === "string" && record.description.trim()
    ? record.description.trim()
    : query;
  const reference = fdcId == null ? "https://fdc.nal.usda.gov/" : `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`;
  return {
    name: description,
    servingQuantity: grams,
    servingUnit: "g",
    servingGrams: grams,
    calories: scaledNutrient(record, ["1008", "2047", "2048"], grams),
    proteinGrams: scaledNutrient(record, ["1003"], grams),
    carbohydrateGrams: scaledNutrient(record, ["1005"], grams),
    fatGrams: scaledNutrient(record, ["1004"], grams),
    fibreGrams: scaledNutrient(record, ["1079"], grams),
    sugarGrams: scaledNutrient(record, ["2000", "1063"], grams),
    sodiumMilligrams: scaledNutrient(record, ["1093"], grams),
    nutrientSource: "USDA FoodData Central",
    nutrientSourceRef: reference,
    servingAssumption: candidate.estimatedGrams != null
      ? `${candidate.portionDescription}; nutrients scaled to the ${Math.round(grams * 10) / 10} g image estimate`
      : `100 g reference because the image weight could not be estimated`,
    confidence: candidate.confidence
  };
}

async function resolveCandidate(candidate: Candidate, signal: AbortSignal) {
  const endpoint = Deno.env.get("NUTRITION_CATALOGUE_URL");
  if (!endpoint) return { ...candidate, catalogueMatch: await resolveWithUsda(candidate, signal) };
  const response = await fetch(endpoint, { method: "POST", signal, headers: { "content-type": "application/json",
    ...(Deno.env.get("NUTRITION_CATALOGUE_TOKEN") ? { authorization: `Bearer ${Deno.env.get("NUTRITION_CATALOGUE_TOKEN")}` } : {}) },
    body: JSON.stringify({ names: candidate.names, estimatedGrams: candidate.estimatedGrams }) });
  if (!response.ok) return { ...candidate, catalogueMatch: null };
  const match = await response.json();
  // The catalogue service owns nutrient validation/attribution. Never combine
  // model-generated nutrient values with this response.
  return { ...candidate, catalogueMatch: match?.nutrientSource && match?.name ? match : null };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = request.headers.get("authorization"); if (!auth?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const token = auth.slice("Bearer ".length).trim(); if (!token) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY"); const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string" || !userId) return json({ error: "Authentication required" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const limit = Math.max(0, Number(Deno.env.get("NUTRITION_DAILY_ANALYSIS_LIMIT") || 20));
  let body: { imageBase64?: string; mimeType?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.imageBase64 || !body.mimeType || !MIME.has(body.mimeType)) return json({ error: "Invalid image MIME type" }, 415);
  let bytes: Uint8Array; try { bytes = decodeBase64(body.imageBase64); } catch { return json({ error: "Invalid image data" }, 400); }
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: "Image must be 1.5 MB or smaller" }, 413);
  if (!validSignature(bytes, body.mimeType)) return json({ error: "Image content does not match its MIME type" }, 415);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(Deno.env.get("NUTRITION_ANALYSIS_TIMEOUT_MS") || 20000)));
  try {
    const adapter = provider();
    const { data: quotaAllowed, error: quotaError } = await admin.rpc("consume_nutrition_analysis_quota", {
      target_user_id: userId, daily_limit: limit,
      request_cost_microunits: Math.max(0, Number(Deno.env.get("NUTRITION_ESTIMATED_COST_MICROUNITS") || 0))
    });
    if (quotaError) throw new Error("Analysis quota check failed");
    if (!quotaAllowed) return json({ error: "Daily photo-analysis limit reached. Manual logging is still available." }, 429);
    const identification = await adapter.identify(bytes, body.mimeType, controller.signal);
    const candidates = await Promise.all(identification.candidates.map((candidate) => resolveCandidate(candidate, controller.signal)));
    return json({ requestId: crypto.randomUUID(), provider: adapter.id, model: adapter.model,
      confidence: identification.confidence, candidates, warnings: identification.warnings || [] });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Analysis timed out" : error instanceof Error ? error.message : "Analysis failed";
    return json({ error: message }, message.includes("Development provider") || message.includes("not configured") ? 503 : 502);
  } finally { clearTimeout(timeout); }
});
