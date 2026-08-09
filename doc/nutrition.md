# Anthra nutrition architecture

Nutrition is offline-first. `nutrition_entries`, `nutrition_entry_items`, `nutrition_goals`,
`nutrition_custom_foods`, and `nutrition_sync_queue` live in the existing `anthra.db`; they are
created with additive `CREATE … IF NOT EXISTS` statements. Existing rows and legacy databases are
never replaced during startup. Version 6 backups include nutrition while older backups continue to
restore without touching nutrition tables.

Edits and soft deletes are saved locally first. Device-generated UUIDs and Supabase upserts make
retries idempotent. The queue uses exponential backoff. It runs after authenticated legacy-data
linking, on foreground, once a minute while active, and after nutrition changes. Anonymous rows are
linked only to the authenticated account already accepted by Anthra's legacy migration guard.

Conflict policy is last-write-wins using `client_updated_at`. A pending local row whose timestamp is
newer than the cloud row is retained; a newer cloud row is applied locally without creating another
queue job. Nutrition is never published to friends, leaderboards, streaks, or social stats.

## Supabase setup

Apply `supabase/migrations/202608080006_private_nutrition.sql` after migration 005. It creates the
private tables, owner-only RLS policies, indexes, atomic quota function, and an optional private
`anthra-meal-images` bucket. The app currently keeps only the compressed local image reference. It
does not upload retained meal photos automatically. If an explicit future "keep photo" option is
added, store only under `<auth.uid()>/…`; the included Storage policies enforce that path.

Deploy the function:

```sh
supabase functions deploy analyze-nutrition-image
```

Set server-side secrets/configuration (never use `EXPO_PUBLIC_` for these):

```text
NUTRITION_ANALYZER_PROVIDER=development|gemini|self-hosted|openai-compatible
NUTRITION_DAILY_ANALYSIS_LIMIT=20
NUTRITION_ANALYSIS_TIMEOUT_MS=20000
NUTRITION_ESTIMATED_COST_MICROUNITS=0

# Native Gemini (no base URL required)
NUTRITION_VISION_API_KEY=server-secret
NUTRITION_VISION_MODEL=gemini-2.5-flash-lite
USDA_FDC_API_KEY=server-secret-from-api.data.gov

# self-hosted
NUTRITION_SELF_HOSTED_URL=https://private-analyzer.example/analyze
NUTRITION_SELF_HOSTED_MODEL=model-version

# OpenAI-compatible hosted endpoint
NUTRITION_VISION_BASE_URL=https://provider.example/v1
NUTRITION_VISION_API_KEY=server-secret
NUTRITION_VISION_MODEL=provider-model

# trusted nutrient resolver
NUTRITION_CATALOGUE_URL=https://nutrition-data.example/resolve
NUTRITION_CATALOGUE_TOKEN=server-secret-if-required
```

`NUTRITION_ANALYZER_PROVIDER` is recommended for an explicit production configuration. If it is
omitted, the function now selects `self-hosted` when `NUTRITION_SELF_HOSTED_URL` exists, or
`openai-compatible` when all three hosted vision variables are present. With neither configuration,
photo analysis remains safely disabled and the app shows a specific setup message instead of a
generic Edge Function error.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the Edge
Function environment. The service-role key is used only for atomic quota accounting and must never
be copied into the mobile `.env` or logs.

`NUTRITION_ESTIMATED_COST_MICROUNITS` is an operator-supplied estimated cost per accepted analysis
request, in millionths of the chosen billing currency. It is accounting metadata, not a charge. Set
it from the selected provider's current pricing and review it whenever the model changes.

The `development` provider deliberately returns HTTP 503; it never fabricates a production result.
Manual, recent, barcode-label, supplement, and custom-food logging remain available when analysis is
unconfigured, offline, timed out, or quota-limited.

## Image and privacy flow

The mobile app resizes photos to 1280 px wide, converts to JPEG at 70% quality, and rejects the
result if it exceeds 1.5 MB. The original full-resolution asset is never sent. The function requires
a valid user JWT, checks JSON, MIME, decoded size, and file signature, applies an atomic daily limit,
and aborts provider/catalogue requests at the configured timeout. It does not log images, tokens, or
provider secrets. Images are passed in-memory and are not written to Storage, so temporary server
retention ends with the request.

The vision adapter is instructed to identify food names and plausible portions only. It must not
supply nutrients. Every candidate is resolved through `NUTRITION_CATALOGUE_URL`; unresolved foods
return with `catalogueMatch: null` and require user-entered values. The mobile confirmation sheet is
always shown and exposes names, quantities, units, calories, protein, carbohydrates, fat, individual
confidence, multi-food removal/addition, and immediate quantity scaling. Estimates are labelled and
no medical claim is made.

## Nutrition datasets

Anthra does not ship guessed nutrient values. The repository includes a provider composition layer
in `nutritionCatalogue.ts`, supplement name templates with blank label values, custom foods, recent
foods, and barcode storage. Production must load attributable data before enabling automatic
nutrient resolution:

- Import IFCT data only after confirming the current NIN/ICMR licence permits the intended copying,
  redistribution, attribution, and commercial use. Preserve the edition, food code, edible portion,
  cooking state, per-100-g basis, and source URL/version for every row.
- Use the official USDA FoodData Central API or downloadable datasets under its current terms for
  international foods. Preserve the FDC ID, data type, publication date, serving weight, and nutrient
  IDs rather than flattening away provenance.
- For packaged foods and supplements, store values from the product label or an attributable product
  data provider. Keep brand, barcode, serving amount, unit, label revision/source, and country.
- Never infer calories from a food name alone. Pure creatine and other non-caloric products may have
  `calories = 0` when that value comes from the verified product label; calories may also remain null.

The resolver response must include `name`, `servingQuantity`, `servingUnit`, `nutrientSource`,
`nutrientSourceRef`, `servingAssumption`, and nullable nutrient fields. This provenance is copied into
every saved entry item, so later catalogue changes cannot silently rewrite historical logs.

When `NUTRITION_CATALOGUE_URL` is not set and `USDA_FDC_API_KEY` is available, the Edge Function
searches USDA FoodData Central Foundation/SR Legacy foods directly. It sends only the model-produced
food name, never the meal image, and scales the attributable per-100 g values to the model-estimated
weight. Users must still confirm the selected food and portion before saving.
