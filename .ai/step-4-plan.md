# Step 4 — API Route Handlers

## 1. Overview

Step 4 builds the HTTP layer — six Route Handlers that expose the business logic from Steps 1–3 as REST endpoints. Each handler is a thin adapter: parse input, validate with Zod, call the appropriate `lib/` function, map errors to HTTP status codes, and serialize the response.

The most complex handler is `POST /api/search`, which streams results to the client in two phases using NDJSON (newline-delimited JSON). The remaining five endpoints are standard request/response JSON handlers.

This step also introduces two small supporting modules:

- **`lib/feedback-store.ts`** — in-memory store for thumbs up/down feedback (needed by `POST /api/feedback`)
- **`lib/api-error.ts`** — shared error-to-HTTP-response mapper used by all Route Handlers

---

## 2. Assumptions

### 2.1 Streaming Protocol: NDJSON

**Decision:** Use NDJSON (newline-delimited JSON) for `POST /api/search`.

**Alternatives considered:**

| Protocol | Pros | Cons |
|---|---|---|
| **NDJSON** | Simple — each line is `JSON.stringify(chunk) + "\n"`. No event types, no framing overhead. Standard `fetch()` + `ReadableStream` reader on client. | No built-in reconnection (not needed — one-shot search). |
| **SSE** | Browser-native `EventSource` API with auto-reconnection. | Requires `text/event-stream` content type, `data:` prefix per line, event type framing. `EventSource` doesn't support POST — we'd need a polyfill or custom reader anyway. Reconnection is irrelevant for a one-shot search. |
| **JSON array** | Single response, no streaming. | Defeats the purpose of two-phase display (RF-022). The client would wait for the full response including re-ranking. |

**Rationale:** NDJSON is the simplest protocol that supports two-phase streaming. The client uses `fetch()` + `getReader()` to process chunks as they arrive — no library needed. SSE adds framing complexity and doesn't support POST natively. This aligns with the Step 3 plan (section 5) which already specified NDJSON.

### 2.2 Feedback Store: Separate Module

**Decision:** New file `lib/feedback-store.ts` with a module-level `Map<string, "up" | "down">`.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **New `lib/feedback-store.ts`** | Clear separation of concerns. Feedback is a distinct domain from admin config. Easy to extend later (persistence, analytics). | One more file. |
| **Extend `config-store.ts`** | Fewer files. | Conflates admin config (system parameters) with user feedback (per-search ratings). Different lifecycle, different access patterns. |
| **Inline in route handler** | No new module. | State tied to the route file. Can't be shared (e.g., if a future GET /api/feedback endpoint needs access). Harder to test. |

**Rationale:** Feedback and admin config are separate concerns with different lifecycles. The store is tiny (~20 lines) but worth isolating. The `POST /api/feedback` response includes current aggregate counts, satisfying US-023 ("way to read the positive-to-negative ratio") without adding an extra endpoint.

### 2.3 API Key Transport: `X-API-Key` Header

**Decision:** The API key is passed via `X-API-Key` request header for all endpoints that need it.

**Exception:** `POST /api/key` receives the key in the JSON body (it's the endpoint's primary payload — "validate this key").

**Which endpoints require the key:**

| Endpoint | Requires API key? | Why |
|---|---|---|
| `POST /api/key` | In body | Payload being validated |
| `POST /api/search` | Header | Passed to Claude API |
| `GET /api/admin/config` | No | Admin is back-office, no auth (US-022) |
| `PUT /api/admin/config` | No | Same |
| `GET /api/admin/taxonomy` | No | Same |
| `POST /api/feedback` | No | Simple data write, no Claude call |

**Rationale:** Headers are the standard transport for API keys in REST APIs. The PRD specifies "passed to Next.js Route Handlers per-request via headers" (RF-002). `X-API-Key` is a well-known custom header convention. `Authorization: Bearer` was considered but implies an auth system, which we don't have.

### 2.4 Error Handling: Shared Helper + safeParse

**Decision:** Two-layer error handling:

1. **Input validation** — use `schema.safeParse()` at the boundary. If validation fails, return `400` immediately with field-level error details. No try/catch needed.
2. **Business logic errors** — wrap `lib/` calls in try/catch. A shared `mapApiError(error)` function in `lib/api-error.ts` maps error classes to `{ status, message }` pairs.

**Rationale:** `safeParse()` is cleaner than `parse()` + catching `ZodError` for input validation — it avoids exception-based flow control and gives structured error details. The shared helper avoids duplicating the error mapping table (from Step 2 plan, section 4.3.6) across six handlers.

### 2.5 FormData Parsing: Native `request.formData()`

**Decision:** Use the Web API `request.formData()` for `POST /api/search`. Validate the `File` object imperatively (type in `ALLOWED_IMAGE_TYPES`, size ≤ `MAX_IMAGE_SIZE_BYTES`) since Zod has no built-in `File` type. Validate the optional prompt string with `SearchRequestSchema.safeParse()`.

**Image-to-base64 conversion:** `Buffer.from(await file.arrayBuffer()).toString("base64")`. This runs in Node.js (Route Handlers execute server-side), so `Buffer` is available. No external library needed.

### 2.6 No `dynamic` Export Needed

Route Handlers in Next.js 16 are not cached by default. All our handlers access runtime state (config store, MongoDB, Claude API), so they're inherently dynamic. No `export const dynamic = 'force-dynamic'` needed.

### 2.7 Streaming Error Handling

Errors during `POST /api/search` are handled differently depending on when they occur:

- **Before streaming starts** (input validation failures): return a standard JSON error response with appropriate HTTP status code (400).
- **After streaming starts** (pipeline errors during Phase 1 or Phase 2): emit an error chunk in the NDJSON stream and close. The HTTP status is already 200 at this point — the error is conveyed in the payload.

This means the client must always check for `{ phase: "error" }` chunks when reading the stream, regardless of HTTP status.

---

## 3. File Structure

```
New files:
  lib/api-error.ts                     — Shared error-to-Response mapper
  lib/feedback-store.ts                — In-memory feedback store (Map + counts)
  app/api/key/route.ts                 — POST /api/key (validate API key)
  app/api/search/route.ts              — POST /api/search (two-phase streaming)
  app/api/admin/config/route.ts        — GET + PUT /api/admin/config
  app/api/admin/taxonomy/route.ts      — GET /api/admin/taxonomy
  app/api/feedback/route.ts            — POST /api/feedback
  scripts/verify-step4.ts             — End-to-end verification script

Existing files (unchanged):
  lib/search-pipeline.ts               — searchPhase1, searchPhase2
  lib/claude.ts                        — validateApiKey, analyzeImage, rerankCandidates
  lib/config-store.ts                  — getConfig, updateConfig
  lib/taxonomy.ts                      — getTaxonomy
  lib/schemas/                         — All Zod schemas (no changes)
```

---

## 4. Implementation Tasks

### 4.1 Error Handling Helper

**File:** `lib/api-error.ts`

This module exports a function that maps runtime errors to HTTP-appropriate `{ status, message }` pairs. It is used by all Route Handlers in their catch blocks.

```typescript
import Anthropic from "@anthropic-ai/sdk";

interface ApiError {
  status: number;
  message: string;
}

/**
 * Maps known error types to HTTP status codes and user-facing messages.
 * Used by Route Handler catch blocks to produce consistent error responses.
 */
export function mapApiError(error: unknown): ApiError {
  // Anthropic SDK errors
  if (error instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "Invalid API key. Please check your key and try again." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "Rate limit exceeded. Please wait a moment and try again." };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, message: "AI service request timed out. Please try again." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "Could not connect to AI service." };
  }
  if (error instanceof Anthropic.InternalServerError) {
    return { status: 502, message: "AI service is temporarily unavailable. Please try again." };
  }

  // JSON parse / response validation errors (from extractJSON or Zod in claude.ts)
  if (error instanceof Error && error.message.startsWith("Failed to parse Claude response")) {
    return { status: 502, message: "Unexpected response from AI service." };
  }

  // MongoDB connection errors
  if (error instanceof Error && error.name === "MongooseServerSelectionError") {
    return { status: 503, message: "Product catalog is temporarily unavailable." };
  }

  // Fallback
  return { status: 500, message: "An unexpected error occurred." };
}
```

**Design decisions:**

- The function returns a plain object — the Route Handler constructs the `Response`. This keeps the helper framework-agnostic and testable.
- `APIConnectionTimeoutError` is checked before `APIConnectionError` because the timeout error extends the connection error class. Order matters for `instanceof` chains with inheritance.
- MongoDB errors are identified by `error.name` rather than importing Mongoose error classes — simpler, no coupling to Mongoose internals.
- Zod validation errors from `ImageAnalysisResultSchema.parse()` inside `claude.ts` are caught here as generic errors. Since they indicate a malformed Claude response (not bad user input), they map to 502.
- The helper does NOT log errors — the Route Handler decides whether to log (e.g., `console.error` for 5xx, skip for 4xx).

---

### 4.2 Feedback Store

**File:** `lib/feedback-store.ts`

A minimal in-memory store for thumbs up/down ratings. Lost on server restart — acceptable for MVP (PRD section 4, Out of Scope).

```typescript
/**
 * In-memory feedback store (RF-024/RF-025).
 * Stores the latest rating per product ID.
 * Lost on server restart — acceptable for MVP.
 */

const store = new Map<string, "up" | "down">();

/** Records or updates a rating for a product. */
export function addFeedback(productId: string, rating: "up" | "down"): void {
  store.set(productId, rating);
}

/** Returns aggregate counts of all stored feedback. */
export function getFeedbackCounts(): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const rating of store.values()) {
    if (rating === "up") up++;
    else down++;
  }
  return { up, down };
}
```

**Design decisions:**

- `Map<string, "up" | "down">` keyed by `productId` — each product has at most one active rating (latest wins). This matches the UI behavior: clicking thumbs down after thumbs up replaces the previous rating.
- `getFeedbackCounts()` returns simple `{ up, down }` totals. Included in the `POST /api/feedback` response to satisfy US-023 ("way to read the positive-to-negative ratio") without a separate endpoint.
- No session tracking — without authentication, "per session" is ambiguous. All ratings are stored in one global map. Acceptable for MVP.

---

### 4.3 POST /api/key — API Key Validation

**File:** `app/api/key/route.ts`

Validates an Anthropic API key by making a minimal API call. Returns `{ valid: true }` or `{ valid: false }`.

```typescript
import { ApiKeyRequestSchema } from "@/lib/schemas";
import { validateApiKey } from "@/lib/claude";
import { mapApiError } from "@/lib/api-error";

export async function POST(request: Request) {
  // 1. Parse and validate body
  const body = await request.json();
  const parsed = ApiKeyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // 2. Validate the key against Anthropic API
  try {
    const valid = await validateApiKey(parsed.data.apiKey);
    return Response.json({ valid });
  } catch (error) {
    const { status, message } = mapApiError(error);
    return Response.json({ error: message }, { status });
  }
}
```

**Flow:**

1. Parse JSON body. Validate with `ApiKeyRequestSchema.safeParse()` — ensures `apiKey` is a non-empty string.
2. Call `validateApiKey(apiKey)` — makes a minimal Claude API call.
   - If the call succeeds → `{ valid: true }`.
   - If `AuthenticationError` → `validateApiKey` returns `false` → `{ valid: false }`.
   - If other error (429, 500, connection) → `mapApiError` maps to appropriate HTTP status.
3. Return the response.

**Why JSON body (not header) for this endpoint:** The API key is the payload being validated — it's the purpose of the request. Putting it in the body (not a header) makes the semantics clear and matches the `ApiKeyRequestSchema` contract from Step 1.

**`request.json()` error handling:** If the body is not valid JSON, `request.json()` throws. This results in an unhandled error → Next.js returns 500. For MVP, this is acceptable. A more defensive approach would wrap `request.json()` in try/catch, but malformed JSON from our own client is unlikely.

---

### 4.4 POST /api/search — Two-Phase Streaming Search

**File:** `app/api/search/route.ts`

This is the most complex handler. It receives a FormData upload (image + optional prompt), runs the two-phase search pipeline, and streams results as NDJSON.

```typescript
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_PROMPT_LENGTH,
} from "@/lib/schemas";
import { searchPhase1, searchPhase2 } from "@/lib/search-pipeline";
import { getConfig } from "@/lib/config-store";
import { mapApiError } from "@/lib/api-error";
import type { SearchInput } from "@/lib/search-pipeline";

export async function POST(request: Request) {
  // --- 1. Extract API key from header ---
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) {
    return Response.json(
      { error: "Missing X-API-Key header" },
      { status: 401 }
    );
  }

  // --- 2. Parse FormData ---
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  // --- 3. Validate image file ---
  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return Response.json(
      { error: "Missing image file. Send a 'image' field in FormData." },
      { status: 400 }
    );
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) {
    return Response.json(
      { error: `Invalid image type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return Response.json(
      { error: `Image too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB.` },
      { status: 400 }
    );
  }

  // --- 4. Validate optional prompt ---
  const promptRaw = formData.get("prompt");
  const prompt = typeof promptRaw === "string" && promptRaw.trim() !== "" ? promptRaw.trim() : undefined;

  if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      { error: `Prompt too long: ${prompt.length} chars. Maximum: ${MAX_PROMPT_LENGTH}.` },
      { status: 400 }
    );
  }

  // --- 5. Convert image to base64 ---
  const arrayBuffer = await file.arrayBuffer();
  const imageBase64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp";

  // --- 6. Build SearchInput ---
  const input: SearchInput = {
    apiKey,
    imageBase64,
    mimeType,
    userPrompt: prompt,
  };

  // --- 7. Stream results as NDJSON ---
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        // Phase 1: Image analysis + candidate retrieval
        const phase1 = await searchPhase1(input);

        if (!phase1.isFurniture) {
          emit({ phase: "not-furniture", analysis: phase1.analysis });
          controller.close();
          return;
        }

        emit({
          phase: "candidates",
          analysis: phase1.analysis,
          candidates: phase1.candidates,
        });

        // Phase 2: Re-ranking with Claude
        const results = await searchPhase2(input, phase1.candidates);
        const { scoreThreshold } = getConfig();
        emit({ phase: "results", results, scoreThreshold });
        controller.close();
      } catch (error) {
        const { message } = mapApiError(error);
        emit({ phase: "error", message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
```

**Detailed flow:**

1. **API key extraction** — Read `X-API-Key` header. Return 401 if missing.
2. **FormData parsing** — `request.formData()` can throw if the content type is wrong. Catch and return 400.
3. **Image validation** — Check file presence, MIME type against `ALLOWED_IMAGE_TYPES`, size against `MAX_IMAGE_SIZE_BYTES`. Return 400 with descriptive error for each failure.
4. **Prompt validation** — Extract optional `prompt` string from FormData. Trim whitespace. Check length against `MAX_PROMPT_LENGTH`. Return 400 if too long.
5. **Base64 conversion** — `Buffer.from(await file.arrayBuffer()).toString("base64")`. Runs server-side (Node.js), so `Buffer` is available.
6. **Build `SearchInput`** — Assemble the input object for the pipeline.
7. **Stream setup** — Create a `ReadableStream` with an async `start()` method:
   - **Phase 1:** Call `searchPhase1(input)`. If not furniture, emit `{ phase: "not-furniture" }` and close. If furniture, emit `{ phase: "candidates" }` with analysis + candidate products.
   - **Phase 2:** Call `searchPhase2(input, candidates)`. Read `scoreThreshold` from config. Emit `{ phase: "results" }` with scored products and threshold. Close.
   - **Error:** If any pipeline step throws, map to user message via `mapApiError()` and emit `{ phase: "error" }`. Close.

**NDJSON chunk types:**

| Chunk | Fields | When |
|---|---|---|
| `{ phase: "not-furniture", analysis }` | `ImageAnalysisResult` | Image doesn't depict furniture |
| `{ phase: "candidates", analysis, candidates }` | `ImageAnalysisResult`, `Product[]` | Furniture detected, preliminary results |
| `{ phase: "results", results, scoreThreshold }` | `ScoredProduct[]`, `number` | Re-ranking complete, final results |
| `{ phase: "error", message }` | `string` | Pipeline error (Claude/MongoDB/parse) |

**Why `start()` instead of `pull()`:**

The search pipeline produces 2–3 sequential chunks with no backpressure concern. Using `start()` with direct `controller.enqueue()` calls is simpler than the generator + `pull()` adapter pattern from the Next.js docs. Each `enqueue()` makes data available to the consumer immediately.

**Why errors inside the stream (not as HTTP status):**

Once the `ReadableStream` is returned as the response body, the HTTP status (200) is committed. Pipeline errors during Phase 1 or Phase 2 can only be communicated as payload. The client must always check for `{ phase: "error" }` chunks. Input validation errors (steps 1–4) are returned as standard HTTP 400/401 responses before streaming starts.

**Score threshold in response:**

The `scoreThreshold` is included in the Phase 2 response so the client can mark low-relevance results without a separate config fetch. This follows the Step 3 plan (section 2, assumption 6: "scoreThreshold is a consumer concern").

---

### 4.5 GET /api/admin/config — Read Configuration

**File:** `app/api/admin/config/route.ts`

Returns the current admin configuration. No authentication required (US-022).

```typescript
import { getConfig } from "@/lib/config-store";

export async function GET() {
  const config = getConfig();
  return Response.json(config);
}
```

**Notes:**

- `getConfig()` returns a shallow copy, so the response doesn't expose internal state.
- No error handling needed — `getConfig()` is synchronous and cannot fail.

---

### 4.6 PUT /api/admin/config — Update Configuration

**File:** `app/api/admin/config/route.ts` (same file as GET, co-located)

Accepts a partial config update, validates it, merges into current config, and returns the full updated config.

```typescript
import { AdminConfigSchema } from "@/lib/schemas";
import { getConfig, updateConfig } from "@/lib/config-store";

export async function PUT(request: Request) {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 2. Validate partial config
  const parsed = AdminConfigSchema.partial().safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid configuration", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // 3. Reject empty updates
  if (Object.keys(parsed.data).length === 0) {
    return Response.json(
      { error: "No configuration fields provided" },
      { status: 400 }
    );
  }

  // 4. Apply update
  const updated = updateConfig(parsed.data);
  return Response.json(updated);
}
```

**Validation strategy:**

- `AdminConfigSchema.partial().safeParse(body)` validates that any provided fields have correct types and ranges (e.g., `resultsCount` is 3–12, prompts are non-empty).
- `.partial()` makes all fields optional — the client can send just `{ resultsCount: 8 }` without providing prompts.
- Empty updates (`{}`) are rejected to prevent no-op requests.
- The merged result is always valid because: existing config is valid (initialized from defaults) + validated partial updates = valid merged config. No need to re-validate the merged result.

---

### 4.7 GET /api/admin/taxonomy — Product Taxonomy

**File:** `app/api/admin/taxonomy/route.ts`

Returns the full category/type taxonomy from MongoDB.

```typescript
import { getTaxonomy } from "@/lib/taxonomy";
import { mapApiError } from "@/lib/api-error";

export async function GET() {
  try {
    const taxonomy = await getTaxonomy();
    return Response.json(taxonomy);
  } catch (error) {
    const { status, message } = mapApiError(error);
    return Response.json({ error: message }, { status });
  }
}
```

**Notes:**

- `getTaxonomy()` connects to MongoDB and runs an aggregation. It caches results for 5 minutes (TTL from `lib/taxonomy.ts`).
- MongoDB connection errors are caught and mapped to 503 ("catalog unavailable") via `mapApiError`.
- Returns `TaxonomyCategory[]` — array of `{ category: string, types: string[] }`.

---

### 4.8 POST /api/feedback — Submit Feedback

**File:** `app/api/feedback/route.ts`

Records a thumbs up/down rating for a product.

```typescript
import { FeedbackRequestSchema } from "@/lib/schemas";
import { addFeedback, getFeedbackCounts } from "@/lib/feedback-store";

export async function POST(request: Request) {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // 2. Validate feedback request
  const parsed = FeedbackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid feedback", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // 3. Store feedback
  addFeedback(parsed.data.productId, parsed.data.rating);

  // 4. Return success with aggregate counts
  const counts = getFeedbackCounts();
  return Response.json({ success: true, counts });
}
```

**Response includes `counts`:** `{ success: true, counts: { up: 3, down: 1 } }`. This satisfies US-023 ("way to read the positive-to-negative ratio") without a separate endpoint.

---

### 4.9 Verification Script

**File:** `scripts/verify-step4.ts`

An end-to-end verification script that starts the Next.js dev server (or assumes it's running) and tests all 6 endpoints. Uses native `fetch()` — no external HTTP client needed.

```typescript
/**
 * Step 4 verification — API Route Handlers end-to-end.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. In another terminal: npx tsx --env-file=.env.local scripts/verify-step4.ts
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env.local
 *   - A test image at promptfoo/test-images/modern-sofa.jpg
 *   - Next.js dev server running on http://localhost:3000
 */
```

**What it tests:**

#### Test 1: POST /api/key — valid key
- Send `{ apiKey: process.env.ANTHROPIC_API_KEY }`.
- Assert: `200`, `{ valid: true }`.

#### Test 2: POST /api/key — invalid key
- Send `{ apiKey: "sk-ant-invalid" }`.
- Assert: `200`, `{ valid: false }`.

#### Test 3: POST /api/key — missing key
- Send `{}`.
- Assert: `400`, response contains `error`.

#### Test 4: POST /api/search — happy path (furniture image)
- Read `promptfoo/test-images/modern-sofa.jpg`, build FormData with `image` file and `X-API-Key` header.
- Read NDJSON stream line by line.
- Assert: first chunk has `phase: "candidates"`, second chunk has `phase: "results"`.
- Assert: candidates is a non-empty array, results are sorted by score descending.

#### Test 5: POST /api/search — non-furniture image
- Read `promptfoo/test-images/landscape.jpg`, build FormData.
- Assert: single chunk with `phase: "not-furniture"`.

#### Test 6: POST /api/search — validation rejection
- Send FormData with no image → assert 400.
- Send FormData with a `.txt` file → assert 400, error mentions allowed types.
- Send request without `X-API-Key` header → assert 401.

#### Test 7: GET /api/admin/config
- Assert: `200`, response contains `resultsCount`, `maxCandidates`, `scoreThreshold`, `imageAnalysisPrompt`, `rerankingPrompt`.

#### Test 8: PUT /api/admin/config — valid update
- Send `{ resultsCount: 8 }`.
- Assert: `200`, response has `resultsCount: 8` and all other fields unchanged.
- Restore: send `{ resultsCount: 6 }`.

#### Test 9: PUT /api/admin/config — invalid update
- Send `{ resultsCount: 99 }` → assert 400.
- Send `{ imageAnalysisPrompt: "" }` → assert 400.
- Send `{}` → assert 400 (empty update).

#### Test 10: GET /api/admin/taxonomy
- Assert: `200`, response is a non-empty array, each item has `category` (string) and `types` (string[]).

#### Test 11: POST /api/feedback — valid
- Send `{ productId: "test-123", rating: "up" }`.
- Assert: `200`, `{ success: true, counts: { up: 1, down: 0 } }`.

#### Test 12: POST /api/feedback — invalid
- Send `{ productId: "test", rating: "maybe" }` → assert 400.

**Expected output:**

```
Step 4 Verification — API Route Handlers
=========================================

1. POST /api/key (valid key).............. ✓
2. POST /api/key (invalid key)............ ✓
3. POST /api/key (missing key)............ ✓
4. POST /api/search (furniture image)..... ✓
   → Phase 1: 50 candidates (Living Room Furniture / Sofas)
   → Phase 2: 6 scored results [92, 85, 78, 71, 65, 58]
5. POST /api/search (non-furniture)....... ✓
6. POST /api/search (validation).......... ✓
7. GET /api/admin/config.................. ✓
8. PUT /api/admin/config (valid).......... ✓
9. PUT /api/admin/config (invalid)........ ✓
10. GET /api/admin/taxonomy............... ✓
    → 15 categories, 63 types
11. POST /api/feedback (valid)............ ✓
12. POST /api/feedback (invalid).......... ✓

All 12 tests passed.
```

**NDJSON stream reader helper** (used in tests 4, 5):

```typescript
async function readNdjsonStream(response: Response): Promise<unknown[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete last line in buffer

    for (const line of lines) {
      if (line.trim()) {
        chunks.push(JSON.parse(line));
      }
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    chunks.push(JSON.parse(buffer));
  }

  return chunks;
}
```

---

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | `POST /api/key` returns `{ valid: true }` for a valid Anthropic key | Verification script test 1 |
| 2 | `POST /api/key` returns `{ valid: false }` for an invalid key (not an HTTP error) | Verification script test 2 |
| 3 | `POST /api/key` returns 400 for missing/empty `apiKey` field | Verification script test 3 |
| 4 | `POST /api/search` streams NDJSON with `candidates` and `results` phases for a furniture image | Verification script test 4 |
| 5 | `POST /api/search` streams a single `not-furniture` chunk for non-furniture images | Verification script test 5 |
| 6 | `POST /api/search` returns 400 for invalid file type, missing file, or prompt too long | Verification script test 6 |
| 7 | `POST /api/search` returns 401 when `X-API-Key` header is missing | Verification script test 6 |
| 8 | `POST /api/search` `results` chunk includes `scoreThreshold` from admin config | Verification script test 4 — check field presence |
| 9 | `GET /api/admin/config` returns full `AdminConfig` shape | Verification script test 7 |
| 10 | `PUT /api/admin/config` accepts partial updates and returns merged config | Verification script test 8 |
| 11 | `PUT /api/admin/config` rejects invalid field values with 400 | Verification script test 9 |
| 12 | `PUT /api/admin/config` changes are reflected immediately in subsequent GET | Verification script test 8 — GET after PUT |
| 13 | `GET /api/admin/taxonomy` returns `TaxonomyCategory[]` from MongoDB | Verification script test 10 |
| 14 | `POST /api/feedback` stores rating and returns aggregate counts | Verification script test 11 |
| 15 | `POST /api/feedback` rejects invalid rating values with 400 | Verification script test 12 |
| 16 | Anthropic SDK errors map to correct HTTP statuses (401, 429, 502, 504) | `mapApiError` — tested via `POST /api/key` with invalid key + `POST /api/search` error chunk |
| 17 | `tsc --noEmit` clean | No new TypeScript errors |
| 18 | `eslint` clean | No new linting errors |

---

## 6. Out of Scope for Step 4

These items are deliberately deferred to later steps:

- **React components / pages** — Steps 5–8 (Route Handlers are backend-only; the client-side is built later)
- **API key React Context** — Step 5 (client-side key management and `X-API-Key` header injection)
- **Client-side NDJSON stream reader** — Step 7 (React hook that reads the search stream and updates UI)
- **Two-phase UI display** — Step 7 (swapping preliminary candidates for re-ranked results)
- **Score threshold UI** — Step 7/10 (low-relevance visual indicator on result cards)
- **Feedback UI** — Step 9 (thumbs up/down buttons on result cards)
- **Rate limiting / abuse prevention** — Out of scope for MVP
- **Request logging / observability** — Out of scope for MVP
- **CORS headers** — Not needed; client and server are on the same origin (Next.js)
- **Authentication for admin endpoints** — US-022 explicitly says admin is accessible without auth
