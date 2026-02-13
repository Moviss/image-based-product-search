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

## Step 2.5: Promptfoo setup + prompt evaluation

- `npx promptfoo@latest init`, configure `promptfooconfig.yaml` with Anthropic provider
- Version prompt files in `prompts/` directory (image-analysis.txt, reranking.txt)
- Define 10-15 test cases with furniture images and expected categories/types
- Assertions: correct category, correct type in top 3, valid JSON output
- Run `promptfoo eval` → establish baseline metrics (Category Accuracy, Type Accuracy)
- Iterate on prompts comparing variants in promptfoo dashboard

## Step 3: Search pipeline (orchestration)

- Cascading MongoDB query: type match → category match → broader query, capped at 50 candidates
- Pipeline orchestration: analyze image → query MongoDB → re-rank → return results
- Two-phase architecture: streaming response (ReadableStream in Route Handler) — first chunk after image analysis + MongoDB (~1-2s), second chunk after re-ranking (~3-5s)
- Verify: call pipeline with test image, check two-phase output with sensible results

## Step 4: API Route Handlers

- `POST /api/key` — validate Anthropic API key
- `POST /api/search` — image upload (FormData) + optional prompt, returns streaming results
- `GET /api/admin/config` — read current configuration
- `PUT /api/admin/config` — update configuration (immediate apply)
- `GET /api/admin/taxonomy` — categories and types from MongoDB
- `POST /api/feedback` — save thumbs up/down rating (in-memory store)
- All inputs validated with Zod at the boundary (file type/size, prompt length max 500 chars, config ranges, API key format)
- Verify: curl each endpoint, confirm validation rejects bad inputs

## Step 5: App shell — layout, navigation, API key context

- Root layout with header and nav links (/ ↔ /admin)
- React Context for API key (client-side memory, passed via headers per-request)
- Gate: block access to search/admin without valid key
- Verify: navigation works, context preserves key between pages

## Step 6: API key UI

- Entry form with validation via `POST /api/key`
- Redirect to search on success
- Error messages for invalid key
- Option to change/clear key
- Verify: enter key → validate → access search; bad key → error message

## Step 7: Search UI (main feature)

- Drag-and-drop upload area + file picker with image preview
- Client-side validation: format (JPEG/PNG/WebP), size (max 10 MB)
- Optional text prompt input
- "Search" button with staged progress messages ("Analyzing image...", "Searching catalog...", "Ranking results...")
- Two-phase display: show MongoDB results first, replace with re-ranked results
- Responsive grid 2x3 (adapts 375px–1920px)
- Result cards: title, description, price, dimensions, match score %, AI justification
- Verify: full end-to-end upload → analysis → two-phase results

## Step 8: Admin panel

- System prompt editors (image analysis + re-ranking) with non-empty validation
- Numeric controls: results count (3-12), max candidates (10-100), score threshold (0-100)
- Taxonomy display: categories with expandable type lists, fetched from MongoDB
- Save with immediate apply (no restart)
- Verify: change prompt in admin → new search reflects different behavior

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
