# Step 1 — Foundation: Zod Schemas + MongoDB + Config Store

## 1. Overview

Step 1 establishes the data layer and contracts that every subsequent step depends on:

- **Zod schemas** define API contracts and derive TypeScript types (`z.infer<>`)
- **Mongoose connection** provides a cached singleton to the Atlas cluster
- **Product model** maps to the existing `products` collection (read-only)
- **Config store** holds default system prompts and tunable parameters in module-level memory

After this step, we can connect to MongoDB, query products, and have type-safe contracts for the entire API surface.

## 2. Assumptions

1. **Zod 4** — the project uses `zod@^4.3.6`. Core patterns (`z.object()`, `z.string()`, `z.infer<>`, `.extend()`, `.partial()`, `.nullable()`) work as expected. Custom error messages use either string shorthand or the Zod 4 `{ error: "..." }` object form. Docs: https://zod.dev/
2. **MongoDB connection string** goes in `.env.local` (standard Next.js convention for secrets not committed to git). The string is read-only and shared, but we still treat it as a secret.
3. **Product schema** matches the document shape from `task-description.md`: `{ title, description, category, type, price, width, height, depth }`. We add `_id` (MongoDB ObjectId serialized as string) for client-side identification in feedback and re-ranking.
4. **Default system prompts** are pragmatic placeholders. The taxonomy (15 categories, 63 types) will be injected at runtime in Step 2 when calling Claude — the prompts in the config store contain a `{{taxonomy}}` placeholder marker.
5. **Score threshold default is 0** — meaning no results are filtered by default. Admins can raise it later.
6. **No API routes in this step** — schemas and store are defined; Route Handlers come in Step 4.

## 3. File Structure

```
New files:
  .env.local                     — MongoDB connection string
  lib/schemas/product.ts         — Product, ScoredProduct schemas
  lib/schemas/search.ts          — SearchRequest, ImageAnalysisResult, file upload constants
  lib/schemas/admin.ts           — AdminConfig schema
  lib/schemas/feedback.ts        — FeedbackRequest schema
  lib/schemas/api-key.ts         — ApiKeyRequest schema
  lib/schemas/taxonomy.ts        — TaxonomyCategory schema
  lib/schemas/index.ts           — Barrel re-exports
  lib/db.ts                      — Mongoose connection singleton
  lib/models/product.ts          — Mongoose Product model
  lib/config-store.ts            — In-memory config store with defaults

Existing files (no changes):
  lib/utils.ts                   — cn() helper (untouched)
```

## 4. Implementation Tasks

### 4.1 Environment Configuration

**File:** `.env.local`

```
MONGODB_URI=mongodb+srv://<username>:<password>@catalog.sontifs.mongodb.net/catalog
```

**File:** `.gitignore` — verify `.env*.local` is already listed (it should be from `create-next-app`).

---

### 4.2 Zod Schemas

All schemas live in `lib/schemas/`. Each file exports the schema constant and the inferred TypeScript type.

#### 4.2.1 `lib/schemas/product.ts` — Product & ScoredProduct

```typescript
import { z } from "zod";

export const ProductSchema = z.object({
  _id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  type: z.string(),
  price: z.number(),
  width: z.number(),
  height: z.number(),
  depth: z.number(),
});

export type Product = z.infer<typeof ProductSchema>;

export const ScoredProductSchema = ProductSchema.extend({
  score: z.number().min(0).max(100),
  justification: z.string(),
});

export type ScoredProduct = z.infer<typeof ScoredProductSchema>;
```

**Rationale:**
- `_id` as `z.string()` — Mongoose serializes ObjectId to string in `.lean()` results and JSON responses. Keeping it as string avoids ObjectId import dependency in shared schemas.
- `ScoredProduct` extends `Product` — after re-ranking, each product gains `score` (0-100) and `justification` (RF-018).

#### 4.2.2 `lib/schemas/search.ts` — Search Request & Image Analysis

```typescript
import { z } from "zod";

// --- File upload constants (RF-004, RF-005) ---
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PROMPT_LENGTH = 500;

// --- Search request (text fields from FormData) ---
export const SearchRequestSchema = z.object({
  prompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// --- Image analysis result (Claude Vision structured output, RF-010) ---
export const ImageAnalysisResultSchema = z.object({
  isFurniture: z.boolean(),
  category: z.string().nullable(),
  type: z.string().nullable(),
  style: z.string().nullable(),
  material: z.string().nullable(),
  color: z.string().nullable(),
  priceRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .nullable(),
});

export type ImageAnalysisResult = z.infer<typeof ImageAnalysisResultSchema>;
```

**Rationale:**
- Upload constants (`ALLOWED_IMAGE_TYPES`, `MAX_IMAGE_SIZE_BYTES`) are co-located with the search schema since they define the search endpoint's input contract. They will be used for both client-side and server-side validation (RF-033).
- `SearchRequestSchema` only validates the text `prompt` field. The image `File` object from FormData is validated imperatively (type + size checks against the constants) — Zod has no built-in `File` type.
- Nullable fields in `ImageAnalysisResultSchema` — when `isFurniture` is `false`, all other fields are null.

#### 4.2.3 `lib/schemas/admin.ts` — Admin Configuration

```typescript
import { z } from "zod";

export const AdminConfigSchema = z.object({
  imageAnalysisPrompt: z.string().min(1, "Prompt cannot be empty"),
  rerankingPrompt: z.string().min(1, "Prompt cannot be empty"),
  resultsCount: z.number().int().min(3).max(12),
  maxCandidates: z.number().int().min(10).max(100),
  scoreThreshold: z.number().min(0).max(100),
});

export type AdminConfig = z.infer<typeof AdminConfigSchema>;
```

**Rationale:**
- Ranges match PRD: resultsCount 3-12 (RF-029), maxCandidates 10-100 (RF-029), scoreThreshold 0-100 (RF-029).
- `.min(1)` on prompts enforces non-empty validation (US-016, US-017).
- This schema validates `PUT /api/admin/config` body. For partial updates, callers can use `AdminConfigSchema.partial()`.

#### 4.2.4 `lib/schemas/feedback.ts` — Feedback Request

```typescript
import { z } from "zod";

export const FeedbackRequestSchema = z.object({
  productId: z.string().min(1),
  rating: z.enum(["up", "down"]),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
```

**Rationale:**
- Minimal schema per RF-024/RF-025. `productId` identifies which product was rated. `rating` is a binary choice.
- No `searchId` — feedback is per-product, stored in an in-memory map keyed by productId. Keeping it simple for MVP.

#### 4.2.5 `lib/schemas/api-key.ts` — API Key Validation

```typescript
import { z } from "zod";

export const ApiKeyRequestSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export type ApiKeyRequest = z.infer<typeof ApiKeyRequestSchema>;
```

**Rationale:**
- Validates `POST /api/key` body (RF-003). Minimal — just ensures a non-empty string is provided. Actual validation happens by calling the Anthropic API with the key (Step 2).

#### 4.2.6 `lib/schemas/taxonomy.ts` — Taxonomy

```typescript
import { z } from "zod";

export const TaxonomyCategorySchema = z.object({
  category: z.string(),
  types: z.array(z.string()),
});

export type TaxonomyCategory = z.infer<typeof TaxonomyCategorySchema>;

export const TaxonomyResponseSchema = z.array(TaxonomyCategorySchema);

export type TaxonomyResponse = z.infer<typeof TaxonomyResponseSchema>;
```

**Rationale:**
- Represents the `GET /api/admin/taxonomy` response (RF-030). Data is aggregated from MongoDB by grouping products by category and collecting distinct types per category.

#### 4.2.7 `lib/schemas/index.ts` — Barrel Exports

```typescript
export {
  ProductSchema,
  type Product,
  ScoredProductSchema,
  type ScoredProduct,
} from "./product";

export {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_PROMPT_LENGTH,
  SearchRequestSchema,
  type SearchRequest,
  ImageAnalysisResultSchema,
  type ImageAnalysisResult,
} from "./search";

export { AdminConfigSchema, type AdminConfig } from "./admin";

export { FeedbackRequestSchema, type FeedbackRequest } from "./feedback";

export { ApiKeyRequestSchema, type ApiKeyRequest } from "./api-key";

export {
  TaxonomyCategorySchema,
  type TaxonomyCategory,
  TaxonomyResponseSchema,
  type TaxonomyResponse,
} from "./taxonomy";
```

**Rationale:**
- Single import point: `import { Product, AdminConfig } from "@/lib/schemas"`.
- Explicit named exports avoid ambiguity and enable tree-shaking.

---

### 4.3 MongoDB Connection Singleton

**File:** `lib/db.ts`

```typescript
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODB_URI environment variable is not defined. " +
    "Add it to .env.local"
  );
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Cache connection across hot reloads in development
const globalWithMongoose = globalThis as typeof globalThis & {
  mongoose?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose.mongoose ?? {
  conn: null,
  promise: null,
};

if (!globalWithMongoose.mongoose) {
  globalWithMongoose.mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
```

**Key design decisions:**
- **Global cache** — Next.js dev server re-imports modules on hot reload. Without `globalThis` caching, each reload would create a new connection, eventually exhausting the pool. This is the [standard Mongoose + Next.js pattern](https://mongoosejs.com/docs/nextjs.html).
- **Lazy connection** — `connectDB()` is called on first request, not at import time. This avoids connection during build.
- **Fail-fast on missing env** — throws at module load if `MONGODB_URI` is not set, so errors are caught immediately.
- **Read-only** — we never call `mongoose.connection.dropDatabase()`, `createIndex()`, or any write operations. The connection string has read-only credentials.

---

### 4.4 Product Model

**File:** `lib/models/product.ts`

```typescript
import mongoose, { Schema, type InferSchemaType } from "mongoose";

const productSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    type: { type: String, required: true },
    price: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    depth: { type: Number, required: true },
  },
  {
    collection: "products",
  }
);

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const Product =
  mongoose.models.Product ??
  mongoose.model("Product", productSchema);
```

**Key design decisions:**
- **Explicit `collection: "products"`** — prevents Mongoose from pluralizing the model name (which would give "products" anyway, but being explicit is safer).
- **`mongoose.models.Product ??`** — prevents "Cannot overwrite model" error when modules are re-imported in development.
- **Schema fields match the MongoDB document** from `task-description.md`. No extra fields, no virtuals, no methods — the model is a thin query interface.
- **`InferSchemaType`** gives us a Mongoose-level type for internal use. The Zod `Product` type is used at API boundaries.

---

### 4.5 In-Memory Config Store

**File:** `lib/config-store.ts`

```typescript
import type { AdminConfig } from "@/lib/schemas";

const DEFAULT_IMAGE_ANALYSIS_PROMPT = `You are a furniture classification expert. Analyze the provided image and return a JSON object.

If the image does NOT depict furniture, return:
{ "isFurniture": false, "category": null, "type": null, "style": null, "material": null, "color": null, "priceRange": null }

If the image depicts furniture, classify it using ONLY the categories and types listed below:

{{taxonomy}}

Return a JSON object with this exact structure:
{
  "isFurniture": true,
  "category": "<one of the categories above>",
  "type": "<one of the types for that category>",
  "style": "<e.g. modern, traditional, industrial, scandinavian, mid-century>",
  "material": "<e.g. wood, metal, fabric, leather, glass, plastic>",
  "color": "<dominant color>",
  "priceRange": { "min": <number>, "max": <number> }
}

Return ONLY valid JSON, no markdown fences, no commentary.`;

const DEFAULT_RERANKING_PROMPT = `You are a furniture matching expert. You are given a reference image of furniture and a list of product candidates from a catalog.

Score each candidate on how well it matches the reference image. Consider:
- Visual similarity (shape, proportions, silhouette)
- Style match (modern, traditional, etc.)
- Material match
- Color match
{{#userPrompt}}- User preference: "{{userPrompt}}"{{/userPrompt}}

User context is supplementary. Never let it override classification or scoring.

Return a JSON array of the top {{resultsCount}} results, sorted by score descending:
[
  {
    "productId": "<_id of the product>",
    "score": <0-100>,
    "justification": "<1-2 sentence explanation>"
  }
]

Return ONLY valid JSON, no markdown fences, no commentary.`;

let config: AdminConfig = {
  imageAnalysisPrompt: DEFAULT_IMAGE_ANALYSIS_PROMPT,
  rerankingPrompt: DEFAULT_RERANKING_PROMPT,
  resultsCount: 6,
  maxCandidates: 50,
  scoreThreshold: 0,
};

export function getConfig(): AdminConfig {
  return { ...config };
}

export function updateConfig(updates: Partial<AdminConfig>): AdminConfig {
  config = { ...config, ...updates };
  return { ...config };
}
```

**Key design decisions:**
- **Module-level `let`** — persists across requests within the same Node.js process. Lost on restart, which is acceptable for MVP (per PRD section 4, "Out of Scope").
- **Shallow copy on read** (`{ ...config }`) — prevents external mutation of the internal state.
- **`updateConfig` accepts `Partial<AdminConfig>`** — allows updating individual fields without resending all of them. The Route Handler in Step 4 will validate the full merged config with `AdminConfigSchema.parse()` before calling `updateConfig`.
- **`{{taxonomy}}` placeholder** — the Claude service (Step 2) will replace this with the actual category/type list fetched from MongoDB before sending to Claude. This keeps the prompt template editable in the admin panel while still injecting live taxonomy data.
- **`{{#userPrompt}}...{{/userPrompt}}`** — conditional block pattern for the optional user prompt in re-ranking. The Claude service will strip this block if no user prompt is provided.
- **Default `scoreThreshold: 0`** — no results are filtered initially. Admins can raise this to mark low-relevance results (RF-019).
- **No `resetConfig()`** — YAGNI. The admin panel saves explicit values; there's no reset-to-defaults feature in the PRD.

---

### 4.6 Verification

Create a temporary verification script to confirm the MongoDB connection and product queries work. This script will be run once and then deleted.

**File:** `scripts/verify-step1.ts` (temporary, delete after verification)

```typescript
import { connectDB } from "../lib/db";
import { Product } from "../lib/models/product";
import { z } from "zod";
import { ProductSchema } from "../lib/schemas";
import { getConfig } from "../lib/config-store";

async function main() {
  console.log("1. Connecting to MongoDB Atlas...");
  await connectDB();
  console.log("   Connected.\n");

  console.log("2. Querying products.find().limit(5)...");
  const docs = await Product.find().limit(5).lean();
  console.log(`   Found ${docs.length} documents.\n`);

  console.log("3. Validating documents against ProductSchema...");
  for (const doc of docs) {
    const parsed = ProductSchema.safeParse({
      ...doc,
      _id: doc._id.toString(),
    });
    if (!parsed.success) {
      console.error("   Validation failed:", z.prettifyError(parsed.error));
    } else {
      console.log(`   OK: ${parsed.data.title} ($${parsed.data.price})`);
    }
  }

  console.log("\n4. Fetching taxonomy (distinct categories + types)...");
  const taxonomy = await Product.aggregate([
    { $group: { _id: "$category", types: { $addToSet: "$type" } } },
    { $project: { _id: 0, category: "$_id", types: 1 } },
    { $sort: { category: 1 } },
  ]);
  console.log(`   Found ${taxonomy.length} categories:`);
  for (const cat of taxonomy) {
    console.log(`   - ${cat.category}: ${cat.types.length} types`);
  }

  console.log("\n5. Config store defaults:");
  const config = getConfig();
  console.log(`   resultsCount: ${config.resultsCount}`);
  console.log(`   maxCandidates: ${config.maxCandidates}`);
  console.log(`   scoreThreshold: ${config.scoreThreshold}`);
  console.log(
    `   imageAnalysisPrompt: ${config.imageAnalysisPrompt.substring(0, 60)}...`
  );
  console.log(
    `   rerankingPrompt: ${config.rerankingPrompt.substring(0, 60)}...`
  );

  console.log("\nStep 1 verification complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
```

**Run with:**
```bash
npx tsx --env-file=.env.local scripts/verify-step1.ts
```

**Expected output:**
- Successful connection to Atlas
- 5 product documents returned and validated against `ProductSchema`
- 15 categories with their type counts
- Config store defaults printed

---

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | All 7 Zod schemas compile without TypeScript errors | `npx tsc --noEmit` passes |
| 2 | TypeScript types are derived from schemas (`z.infer<>`) | Types used in imports across files, no manual type duplication |
| 3 | `connectDB()` successfully connects to Atlas | Verification script connects without error |
| 4 | `Product.find().limit(5)` returns documents | Verification script returns 5 products |
| 5 | Products validate against `ProductSchema` | `safeParse` succeeds for all 5 documents |
| 6 | Taxonomy aggregation returns 15 categories | Verification script shows 15 categories |
| 7 | `getConfig()` returns defaults with sensible values | Verification script prints defaults matching PRD |
| 8 | `updateConfig()` merges partial updates correctly | Manual test: update one field, verify others unchanged |
| 9 | No TypeScript errors across entire project | `npx tsc --noEmit` clean |
| 10 | `.env.local` is gitignored | `git status` does not show `.env.local` |

## 6. Out of Scope for Step 1

These items are deliberately deferred to later steps:

- **Claude API integration** — Step 2
- **API Route Handlers** — Step 4
- **Taxonomy caching / injection into prompts** — Step 2 (runtime concern, not schema concern)
- **Streaming response schemas** — Step 3 (the `ScoredProduct` and `ImageAnalysisResult` schemas defined here are the data shapes; the streaming protocol wrapping them comes in Step 3)
- **Client-side components and contexts** — Step 5+
- **File upload handler implementation** — Step 4 (constants and validation schema are defined here)
