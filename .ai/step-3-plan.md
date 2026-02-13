# Step 3 — Search Pipeline (Orchestration)

## 1. Overview

Step 3 builds the search pipeline — the orchestration layer that connects image analysis (Claude Vision), product retrieval (MongoDB), and re-ranking (Claude Text) into a coherent search flow. This module is the bridge between the AI/data services (Steps 1–2) and the HTTP layer (Step 4).

The pipeline introduces two key pieces of new logic:

1. **Cascading MongoDB query** — a multi-level retrieval strategy that progressively broadens the search filter (type → category → broad) to ensure enough candidates for meaningful re-ranking, capped at `maxCandidates` from admin config.

2. **Two-phase orchestration** — the pipeline is split into two functions (`searchPhase1` and `searchPhase2`) so the Route Handler (Step 4) can stream preliminary results to the client before re-ranking completes, matching the PRD's two-phase display requirement (RF-022).

The module lives in `lib/` as pure business logic. It has no HTTP concerns — no `Request`/`Response`, no streaming, no status codes. The Route Handler owns all of that.

---

## 2. Assumptions

1. **Two-function split over generator/callback.** The pipeline is split into `searchPhase1` (analyze + query) and `searchPhase2` (rerank). This gives the Route Handler explicit control over when to emit each phase to the client, without coupling the pipeline to any streaming mechanism. The alternative — an async generator — was rejected because it adds complexity with little benefit for a two-step flow.

2. **No price-range filtering in MongoDB queries.** The `ImageAnalysisResult.priceRange` is an AI estimate and may be inaccurate. Using it as a MongoDB filter could exclude good candidates. Price relevance is better handled during re-ranking, where Claude can weigh it as one factor among many. MongoDB queries filter only on `category` and `type` — the most reliable classification fields.

3. **No explicit sort in MongoDB queries.** The preliminary results (phase 1) are unranked — the client shows them as a loading state. Final ordering comes from re-ranking (phase 2). Adding sorts without indexes would cost performance on a collection with no custom indexes.

4. **`_id` serialization via `.lean()`.** Mongoose's `.lean()` returns plain objects where `_id` is an `ObjectId`. The pipeline converts these to `Product` type (which has `_id: string`) using a mapping function. This matches what `rerankCandidates` in `lib/claude.ts` expects (line 150: `candidates.map((c) => [c._id, c])`).

5. **Level 3 (broad) query is a safety net.** With ~2,500 products across 63 types (~40 products/type average), level 1 (type match) should return enough candidates for most queries. Level 2 (category match) adds variety. Level 3 (no filter) only triggers when a type/category has very few products. It fills the remaining slots with arbitrary products — the re-ranking step sorts out relevance.

6. **Score threshold is a consumer concern.** The `scoreThreshold` from admin config determines which results are marked as low-relevance. This is a display concern — the pipeline returns all `ScoredProduct[]` items, and the consumer (Route Handler → client) compares each `score` against the threshold. No `lowRelevance` field is added to the schema.

7. **Null category/type handling.** `ImageAnalysisResult.category` and `ImageAnalysisResult.type` are nullable. When `isFurniture: true` but these fields are null (edge case — Claude uncertain about classification), the cascading query skips the corresponding levels and falls through to broader queries.

---

## 3. File Structure

```
New files:
  lib/search-pipeline.ts    — Cascading query + two-phase orchestration

Existing files (unchanged):
  lib/claude.ts              — analyzeImage, rerankCandidates (called by pipeline)
  lib/config-store.ts        — getConfig() provides maxCandidates, resultsCount
  lib/db.ts                  — connectDB() used by findCandidates
  lib/models/product.ts      — Product model for MongoDB queries
  lib/schemas/product.ts     — Product, ScoredProduct types
  lib/schemas/search.ts      — ImageAnalysisResult type
```

---

## 4. Implementation Tasks

### 4.1 Types and Interfaces

**File:** `lib/search-pipeline.ts`

Define the input/output types for the two pipeline phases:

```typescript
import type { ImageAnalysisResult, Product, ScoredProduct } from "@/lib/schemas";

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

/** Shared input for both pipeline phases. */
export interface SearchInput {
  apiKey: string;
  imageBase64: string;
  mimeType: ImageMimeType;
  userPrompt?: string;
}

/** Phase 1 result: image classified as not-furniture. */
interface NotFurnitureResult {
  isFurniture: false;
  analysis: ImageAnalysisResult;
}

/** Phase 1 result: furniture detected, candidates retrieved. */
interface CandidatesResult {
  isFurniture: true;
  analysis: ImageAnalysisResult;
  candidates: Product[];
}

/** Discriminated union — the Route Handler checks `isFurniture` to decide next step. */
export type SearchPhase1Result = NotFurnitureResult | CandidatesResult;
```

**Design decisions:**

- `SearchInput` groups the common parameters passed from the Route Handler. The alternative — 4 positional parameters — is harder to read and extend.
- `SearchPhase1Result` is a discriminated union on `isFurniture`. When the Route Handler checks `result.isFurniture`, TypeScript narrows the type and guarantees `candidates` is available.
- `searchPhase2` returns `ScoredProduct[]` directly — no wrapper type needed since the existing `ScoredProduct` (from `lib/schemas/product.ts`) already contains `score` and `justification`.

---

### 4.2 Document-to-Product Mapping

**File:** `lib/search-pipeline.ts`

A private helper that converts Mongoose `.lean()` output (with `ObjectId`) to the `Product` type (with `string` `_id`):

```typescript
/**
 * Converts a Mongoose lean document to a Product.
 * Lean documents have ObjectId `_id`; Product expects string.
 */
function toProduct(doc: Record<string, unknown>): Product {
  return {
    _id: String(doc._id),
    title: doc.title as string,
    description: doc.description as string,
    category: doc.category as string,
    type: doc.type as string,
    price: doc.price as number,
    width: doc.width as number,
    height: doc.height as number,
    depth: doc.depth as number,
  };
}
```

**Why `String(doc._id)` instead of `doc._id.toString()`:** Both work for `ObjectId`, but `String()` is safer — it handles `null`/`undefined` without throwing, which adds a layer of defense if a document has an unexpected shape. In practice, `_id` is always present.

---

### 4.3 Cascading MongoDB Query

**File:** `lib/search-pipeline.ts`

This is the core new logic in Step 3. It implements the cascading retrieval strategy described in the PRD (RF-014) and implementation plan.

```typescript
import { connectDB } from "@/lib/db";
import { Product as ProductModel } from "@/lib/models/product";

/**
 * Retrieves product candidates using a cascading query strategy:
 *   Level 1 — exact type match (most relevant)
 *   Level 2 — same category, different type (related products)
 *   Level 3 — no filter (broad fallback)
 *
 * Each level fills remaining capacity up to `maxCandidates`.
 * Stops early if the cap is reached.
 */
async function findCandidates(
  analysis: ImageAnalysisResult,
  maxCandidates: number
): Promise<Product[]> {
  await connectDB();

  const candidates: Product[] = [];
  const seenIds: string[] = [];

  // --- Level 1: Type match ---
  if (analysis.type) {
    const docs = await ProductModel.find({ type: analysis.type })
      .limit(maxCandidates)
      .lean();

    for (const doc of docs) {
      const product = toProduct(doc as Record<string, unknown>);
      candidates.push(product);
      seenIds.push(product._id);
    }
  }

  // --- Level 2: Category match (excluding already-found type) ---
  if (candidates.length < maxCandidates && analysis.category) {
    const remaining = maxCandidates - candidates.length;

    const filter: Record<string, unknown> = {
      category: analysis.category,
    };

    // Exclude type from level 1 to avoid duplicates
    if (analysis.type) {
      filter.type = { $ne: analysis.type };
    }

    const docs = await ProductModel.find(filter)
      .limit(remaining)
      .lean();

    for (const doc of docs) {
      const product = toProduct(doc as Record<string, unknown>);
      candidates.push(product);
      seenIds.push(product._id);
    }
  }

  // --- Level 3: Broad fallback (any product not yet selected) ---
  if (candidates.length < maxCandidates && seenIds.length > 0) {
    const remaining = maxCandidates - candidates.length;

    const docs = await ProductModel.find({
      _id: { $nin: seenIds },
    })
      .limit(remaining)
      .lean();

    for (const doc of docs) {
      candidates.push(toProduct(doc as Record<string, unknown>));
    }
  }

  // Edge case: no type AND no category (very rare — Claude uncertain)
  if (candidates.length === 0) {
    const docs = await ProductModel.find({})
      .limit(maxCandidates)
      .lean();

    for (const doc of docs) {
      candidates.push(toProduct(doc as Record<string, unknown>));
    }
  }

  return candidates;
}
```

**Cascade flow (example):**

Given `analysis = { category: "Bedroom Furniture", type: "Beds" }` and `maxCandidates = 50`:

1. **Level 1:** `find({ type: "Beds" }).limit(50)` → returns 35 products.
2. **Level 2:** `find({ category: "Bedroom Furniture", type: { $ne: "Beds" } }).limit(15)` → returns 15 nightstands, dressers, wardrobes.
3. **Level 3:** Not reached — `candidates.length === 50 === maxCandidates`.

Total: 50 candidates (35 exact type + 15 same category).

**Null field handling:**

| `analysis.type` | `analysis.category` | Levels executed |
|---|---|---|
| non-null | non-null | 1 → 2 → 3 (if needed) |
| null | non-null | skip 1 → 2 → 3 (if needed) |
| non-null | null | 1 → skip 2 → 3 (if needed) |
| null | null | skip 1 → skip 2 → fallback (any products) |

**Why `$nin` with string IDs works:** Mongoose automatically casts string values in `$nin` to `ObjectId` when querying the `_id` field (defined as `Schema.Types.ObjectId` by default). This avoids manual `ObjectId` conversion.

**Why no explicit sort:** Adding `.sort()` without a matching index triggers an in-memory sort in MongoDB. With ~2500 documents this is negligible, but there's no benefit — the final ordering comes from Claude re-ranking. The preliminary results (phase 1) are a transient loading state.

---

### 4.4 Search Phase 1: Analyze + Query

**File:** `lib/search-pipeline.ts`

```typescript
import { analyzeImage } from "@/lib/claude";
import { getConfig } from "@/lib/config-store";

/**
 * Phase 1: Analyze the image and retrieve candidates from MongoDB.
 *
 * Returns a discriminated union:
 * - `isFurniture: false` → image is not furniture (no search performed)
 * - `isFurniture: true`  → analysis + candidates ready for re-ranking
 *
 * The Route Handler sends phase 1 results to the client as preliminary
 * data, then proceeds to phase 2 (re-ranking).
 */
export async function searchPhase1(
  input: SearchInput
): Promise<SearchPhase1Result> {
  const { apiKey, imageBase64, mimeType } = input;

  // 1. Analyze the image
  const analysis = await analyzeImage(apiKey, imageBase64, mimeType);

  // 2. Early return if not furniture (RF-011)
  if (!analysis.isFurniture) {
    return { isFurniture: false, analysis };
  }

  // 3. Retrieve candidates via cascading query
  const config = getConfig();
  const candidates = await findCandidates(analysis, config.maxCandidates);

  return { isFurniture: true, analysis, candidates };
}
```

**Flow:**

1. Calls `analyzeImage()` from `lib/claude.ts` — sends the image to Claude Vision, returns `ImageAnalysisResult`.
2. If `isFurniture: false`, returns immediately. The Route Handler sends a "not furniture" message to the client. No MongoDB query is made (RF-011).
3. If furniture, reads `maxCandidates` from the admin config and calls `findCandidates()` with the cascading strategy.
4. Returns the analysis (for client display — category, type, style, etc.) and the candidates (for preliminary results display + phase 2 input).

**Error handling:** Errors from `analyzeImage` (Anthropic SDK errors, JSON parse failures, Zod validation errors) and `findCandidates` (MongoDB connection errors) propagate to the caller. The Route Handler (Step 4) maps these to HTTP responses per the error table in the Step 2 plan (section 4.3.6).

---

### 4.5 Search Phase 2: Re-rank

**File:** `lib/search-pipeline.ts`

```typescript
import { rerankCandidates } from "@/lib/claude";

/**
 * Phase 2: Re-rank candidates using Claude.
 *
 * Takes the candidates from phase 1, sends them to Claude with the
 * reference image and optional user prompt, and returns scored results
 * sorted by relevance.
 *
 * The Route Handler sends phase 2 results to the client, replacing
 * the preliminary candidates from phase 1.
 */
export async function searchPhase2(
  input: SearchInput,
  candidates: Product[]
): Promise<ScoredProduct[]> {
  const { apiKey, imageBase64, mimeType, userPrompt } = input;

  return rerankCandidates(apiKey, imageBase64, mimeType, candidates, userPrompt);
}
```

**Why a thin wrapper instead of calling `rerankCandidates` directly?**

1. **Consistent interface** — the Route Handler imports from one module (`lib/search-pipeline.ts`) for the entire search flow. No need to know about `lib/claude.ts` internals.
2. **Single place to add post-processing** — if we later need to add score threshold filtering, result deduplication, or logging, it goes here. The Route Handler code doesn't change.
3. **Testability** — the pipeline module can be mocked as a single unit in tests.

The wrapper is intentionally thin. It delegates to `rerankCandidates` without adding logic. This follows KISS — the current task doesn't need post-processing, and we don't add it preemptively.

---

### 4.6 Module Exports

**File:** `lib/search-pipeline.ts`

The module exports exactly what the Route Handler needs:

```typescript
export type { SearchInput, SearchPhase1Result };
export { searchPhase1, searchPhase2 };
```

`findCandidates` and `toProduct` are private — they're implementation details of the cascading strategy. The Route Handler doesn't call them directly.

---

### 4.7 Verification Script

**File:** `scripts/verify-step3.ts`

A manual verification script that tests the full pipeline end-to-end against the live MongoDB and Claude API. Same pattern as `scripts/verify-step2.ts`.

```typescript
/**
 * Step 3 verification — search pipeline end-to-end.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-step3.ts
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env.local
 *   - A test image at promptfoo/test-images/modern-sofa.jpg (or any furniture image)
 */
```

**What it tests:**

1. **Phase 1 — furniture image:**
   - Reads `promptfoo/test-images/modern-sofa.jpg` (reuses existing test image from Step 2.5).
   - Calls `searchPhase1()`.
   - Verifies: `isFurniture: true`, `analysis.category` and `analysis.type` are non-null, `candidates.length > 0` and `candidates.length <= maxCandidates`.
   - Prints: analysis result + candidate count + breakdown by type/category.

2. **Phase 2 — re-ranking:**
   - Calls `searchPhase2()` with the candidates from phase 1.
   - Verifies: results are sorted by score descending, all scores are 0–100, `results.length <= config.resultsCount`.
   - Prints: top results with score and justification.

3. **Edge case — non-furniture image:**
   - Reads `promptfoo/test-images/landscape.jpg` (reuses existing test image).
   - Calls `searchPhase1()`.
   - Verifies: `isFurniture: false`, no candidates.

4. **Cascading query levels:**
   - Calls `findCandidates()` indirectly via `searchPhase1()` — verifies the total count fills up to `maxCandidates` by observing that candidates span multiple types/categories (not all from the exact detected type).
   - Prints: unique types and categories in the candidate set.

**Expected output:**

```
1. Testing searchPhase1 (furniture image)...
   Analysis: { isFurniture: true, category: "Living Room Furniture", type: "Sofas", ... }
   Candidates: 50 products
     - 38 × type "Sofas" (level 1)
     - 12 × category "Living Room Furniture" / other types (level 2)
   ✓ Phase 1 returned furniture analysis + 50 candidates

2. Testing searchPhase2 (re-ranking)...
   #1 [Score: 92] Modern Fabric Sofa — "Strong visual match: similar..."
   #2 [Score: 85] Contemporary Couch — "Similar style and proportions..."
   ...
   ✓ Phase 2 returned 6 scored results (sorted desc)

3. Testing searchPhase1 (non-furniture image)...
   Analysis: { isFurniture: false, ... }
   ✓ Correctly classified as non-furniture, no candidates

Step 3 verification complete.
```

**Implementation note:** The script imports `searchPhase1` and `searchPhase2` from `@/lib/search-pipeline`. It uses `process.exit()` after completion to close the MongoDB connection (same pattern as `scripts/verify-step2.ts`).

---

## 5. Route Handler Integration (Preview for Step 4)

This section describes how the Route Handler will use the pipeline. It is **not** implemented in Step 3 — it provides context for the pipeline design decisions.

The `POST /api/search` Route Handler will:

```
1. Parse FormData: extract image (File), optional prompt (string)
2. Validate: image type (JPEG/PNG/WebP), size (≤10 MB), prompt length (≤500)
3. Convert image to base64
4. Create a ReadableStream with two chunks:

   ┌─────────────────────────────────────────────────┐
   │ Phase 1: searchPhase1(input)                    │
   │   → If not furniture: send { phase: "not-       │
   │     furniture", analysis } → close stream        │
   │   → If furniture: send { phase: "candidates",   │
   │     analysis, candidates } → continue            │
   ├─────────────────────────────────────────────────┤
   │ Phase 2: searchPhase2(input, candidates)        │
   │   → Send { phase: "results", results }           │
   │   → close stream                                 │
   └─────────────────────────────────────────────────┘

5. Return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } })
```

The stream uses newline-delimited JSON (NDJSON) — each phase is a JSON object followed by `\n`. The client reads the stream line by line, parsing each chunk independently.

**Score threshold handling:** The Route Handler reads `config.scoreThreshold` and includes it in the phase 2 response. The client compares each result's `score` against the threshold to render the low-relevance indicator. The pipeline itself does not filter or mark results.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | `findCandidates` returns products for a valid analysis result | Verification script — `candidates.length > 0` |
| 2 | Cascading works: level 1 (type) fills first, level 2 (category) adds variety | Verification script — candidates contain multiple types from the same category |
| 3 | Candidate count never exceeds `config.maxCandidates` | Verification script — `candidates.length <= 50` |
| 4 | `searchPhase1` returns `isFurniture: false` for non-furniture images | Verification script — `result.isFurniture === false`, no candidates |
| 5 | `searchPhase1` returns analysis + candidates for furniture images | Verification script — `result.isFurniture === true`, `result.candidates.length > 0` |
| 6 | `searchPhase2` returns `ScoredProduct[]` sorted by score descending | Verification script — scores are in descending order |
| 7 | `searchPhase2` respects `config.resultsCount` | Verification script — `results.length <= config.resultsCount` |
| 8 | All `Product._id` values are strings (not ObjectId) | Verification script — `typeof candidates[0]._id === "string"` |
| 9 | Pipeline errors propagate without wrapping | Anthropic errors, MongoDB errors, and Zod errors reach the caller with original types |
| 10 | `tsc --noEmit` clean | No new TypeScript errors |
| 11 | `eslint` clean | No new linting errors |

---

## 7. Out of Scope for Step 3

These items are deliberately deferred to later steps:

- **Route Handler** — Step 4 (the pipeline functions are called by `POST /api/search`, not exposed as endpoints)
- **Streaming/NDJSON protocol** — Step 4 (the Route Handler owns the `ReadableStream` and chunk encoding)
- **Score threshold marking** — Step 7/10 (UI concern — the client reads `scoreThreshold` from config and marks low-relevance results)
- **Error-to-HTTP mapping** — Step 4 (Route Handlers catch pipeline errors and return appropriate HTTP responses)
- **Client-side two-phase display** — Step 7 (React component reads NDJSON stream and swaps preliminary results for re-ranked results)
- **User prompt influence testing** — Step 2.5 covers prompt evaluation; full pipeline integration testing is covered by the verification script
- **Caching of analysis results** — Out of scope per PRD (section 4: "Caching of Claude API queries" is out of scope)
