# Implementation Plan

## Step 1: Foundation — Zod schemas + MongoDB + config store [DONE]

- [x] Zod 4 schemas (7 files in `lib/schemas/`): Product, ScoredProduct, SearchRequest, ImageAnalysisResult, AdminConfig, FeedbackRequest, ApiKeyRequest, TaxonomyCategory — all with `z.infer<>` type derivation
- [x] Barrel re-exports from `lib/schemas/index.ts`
- [x] Mongoose connection singleton (`lib/db.ts`) with globalThis caching for dev hot reloads
- [x] Product model (`lib/models/product.ts`) mapping to read-only `products` collection
- [x] In-memory config store (`lib/config-store.ts`) with default prompts and tunable parameters
- [x] Verified: Atlas connection, 5 products validated, 15 categories / 63 types aggregated, config store getConfig/updateConfig confirmed
- [x] All acceptance criteria from `.ai/step-1-plan.md` passed (tsc clean, eslint clean, .env.local gitignored)

## Step 2: Claude service (Vision + Text) [DONE]

- [x] Prompt template renderer (`lib/prompt.ts`): `{{taxonomy}}`, `{{resultsCount}}`, conditional `{{#userPrompt}}` block
- [x] Cached taxonomy fetcher (`lib/taxonomy.ts`): MongoDB aggregation, 5-min TTL, formatted string for prompts
- [x] `analyzeImage`: base64 image → Claude Vision → Zod-validated `ImageAnalysisResult`
- [x] `rerankCandidates`: candidates + image + optional user prompt → `ScoredProduct[]` sorted by score
- [x] `validateApiKey`: minimal API call, catches `AuthenticationError` → `false`
- [x] JSON extraction strips markdown fences, descriptive error on parse failure
- [x] Prompt injection defense: user prompt in system prompt as data with guard sentence, schema validation on output, product ID verification
- [x] Verification script (`scripts/verify-step2.ts`) for manual end-to-end testing
- [x] tsc clean, eslint clean

## Step 2.5: Promptfoo setup + prompt evaluation [DONE]

- [x] Extracted prompts from `config-store.ts` into `prompts/image-analysis.txt` and `prompts/reranking.txt` — single source of truth for app and eval
- [x] Modified `config-store.ts` to load defaults via `fs.readFileSync()` from `prompts/*.txt`
- [x] Installed promptfoo as devDependency, added `eval:setup`, `eval`, `eval:view` npm scripts
- [x] Setup script (`scripts/setup-promptfoo.ts`) fetches taxonomy from MongoDB and saves as fixture
- [x] Self-contained custom provider (`promptfoo/providers/image-analysis.ts`) — no `@/lib/` imports
- [x] 12 test cases (10 furniture + 2 non-furniture) with expected labels matched to live taxonomy
- [x] 5 assertion metrics: `json-valid`, `schema-valid`, `furniture-detection`, `category-accuracy`, `type-accuracy` + latency bound
- [x] `temperature: 0` in `lib/claude.ts` (analyzeImage + rerankCandidates) — deterministic classification
- [x] `.gitignore` updated for promptfoo output/cache/fixtures
- [x] Baseline: 12/12 (100%), deterministic with `--repeat 3`
- [x] tsc clean, eslint clean

## Step 3: Search pipeline (orchestration) [DONE]

- [x] `lib/search-pipeline.ts` — two-phase orchestration module
- [x] `SearchInput` + `SearchPhase1Result` (discriminated union on `isFurniture`) types
- [x] `toProduct()` — converts Mongoose `.lean()` document (ObjectId → string `_id`)
- [x] `findCandidates()` — cascading MongoDB query: type match → category match (excluding type) → broad fallback ($nin seen IDs), capped at `maxCandidates`; handles null type/category edge cases
- [x] `searchPhase1()` — `analyzeImage` + `findCandidates`, returns discriminated union
- [x] `searchPhase2()` — thin wrapper on `rerankCandidates`
- [x] Verification script (`scripts/verify-step3.ts`): furniture image (50 candidates, cascading confirmed), re-ranking (6 scored results, sorted desc), non-furniture edge case
- [x] tsc clean, eslint clean

## Step 4: API Route Handlers [DONE]

- [x] `POST /api/key` — validate Anthropic API key
- [x] `POST /api/search` — image upload (FormData) + optional prompt, returns streaming results
- [x] `GET /api/admin/config` — read current configuration
- [x] `PUT /api/admin/config` — update configuration (immediate apply)
- [x] `GET /api/admin/taxonomy` — categories and types from MongoDB
- [x] `POST /api/feedback` — save thumbs up/down rating (in-memory store)
- [x] All inputs validated with Zod at the boundary (file type/size, prompt length max 500 chars, config ranges, API key format)
- [x] Verification script (`scripts/verify-step4.ts`) — 12 end-to-end tests covering all endpoints
- [x] tsc clean, eslint clean

## Step 5: App shell — layout, navigation, API key context [DONE]

- [x] Root layout with header and nav links (/ ↔ /admin)
- [x] React Context for API key (client-side memory, passed via headers per-request)
- [x] Gate: block access to search/admin without valid key
- [x] tsc clean, eslint clean

## Step 6: API key UI [DONE]

- [x] Entry form with validation via `POST /api/key`
- [x] Redirect to search on success
- [x] Error messages for invalid key
- [x] Option to change/clear key
- [x] tsc clean, eslint clean

## Step 7: Search UI (main feature) [DONE]

- [x] `hooks/use-search.ts` — `useReducer` state machine (6 statuses), NDJSON stream reader, AbortController for cancellation
- [x] `components/image-upload.tsx` — drag-and-drop + file picker, `FileWithPreview` value/onChange API, client-side MIME/size validation, preview with `next/image`
- [x] `components/result-card.tsx` — Product/ScoredProduct card with score Badge (color-coded: green ≥70, neutral ≥threshold, destructive below), low-relevance styling
- [x] `components/result-grid.tsx` — status-driven rendering: spinner, alerts (not-furniture, error with retry), responsive grid (`sm:grid-cols-2 lg:grid-cols-3`), preliminary results during ranking
- [x] `components/search-page.tsx` — client component orchestrator, connects `useApiKey` + `useSearch` + `ImageUpload` + `Textarea` (with character counter)
- [x] `app/page.tsx` — replaced placeholder with `<SearchPage />`
- [x] shadcn components added: badge, textarea, alert
- [x] tsc clean, eslint clean, 17 manual test scenarios passed

## Step 8: Admin panel [DONE]

- [x] shadcn `slider` component installed via CLI
- [x] `app/admin/page.tsx` — async Server Component fetching config (`getConfig`) and taxonomy (`getTaxonomy`), passes as props to client orchestrator; uses `await connection()` for dynamic rendering
- [x] `components/admin-panel.tsx` — Client Component orchestrator: `useState<AdminConfig>` for form + server baseline, field-by-field dirty tracking, save via `PUT /api/admin/config`, discard, inline success/error messages (auto-clear 3s)
- [x] `components/prompt-editor.tsx` — labeled `Textarea` (monospace, rows=10) for system prompt editing (used 2x: image analysis + re-ranking)
- [x] `components/config-controls.tsx` — three labeled `Slider` controls: resultsCount (3–12, step 1), maxCandidates (10–100, step 5), scoreThreshold (0–100, step 1); `tabular-nums` value display
- [x] `components/taxonomy-display.tsx` — native `<details>`/`<summary>` expandable list with chevron rotation (`group-open:rotate-90`), category count, type tags; empty-state fallback for MongoDB unavailability
- [x] `lib/config-store.ts` — migrated from module-level `let` to `globalThis.__adminConfig` to survive Next.js dev module re-evaluations (same pattern as `lib/db.ts`)
- [x] tsc clean, eslint clean, 15 manual test scenarios passed

## Step 9: Feedback (thumbs up/down)

- Thumbs up/down buttons on result cards
- Visual state change on click
- `POST /api/feedback` to server
- In-memory store per session
- Verify: click → icon changes → data persisted in server memory

## Step 10: Edge cases, error handling, polish + red teaming

- "Not-furniture" classification → "No furniture detected in the image" message
- Low-relevance indicators when results below score threshold
- API errors: 401 (key issue), 429 (rate limit), 500/timeout (service issue) with retry option
- MongoDB connection error → "catalog unavailable" message
- Server-side file validation (format, size) as second line of defense
- Responsive verification across breakpoints
- `promptfoo redteam` — test adversarial user prompts against injection
- Finalize README and CHANGELOG
