# Changelog

All notable changes to this project will be documented in this file. Particular focus is given to the search functionality and its implementation.

## [Unreleased]

### Added — Step 8: Admin Panel
- Admin panel orchestrator (`components/admin-panel.tsx`) — `"use client"` component with `useState<AdminConfig>` for form state + server baseline, field-by-field dirty tracking (`isDirty`), non-empty prompt validation (`isValid`), save via `PUT /api/admin/config` with inline success/error messages (success auto-clears after 3s), discard button to revert unsaved changes
- Prompt editor component (`components/prompt-editor.tsx`) — reusable labeled `Textarea` with monospace font (`font-mono text-sm`), `rows={10}`, used for both image analysis and re-ranking prompts; descriptions list supported template variables (`{{taxonomy}}`, `{{resultsCount}}`, `{{#userPrompt}}`)
- Config controls component (`components/config-controls.tsx`) — data-driven rendering of three shadcn `Slider` controls: results count (3–12, step 1), max candidates (10–100, step 5), score threshold (0–100, step 1); `tabular-nums` value display for stable digit width
- Taxonomy display component (`components/taxonomy-display.tsx`) — native `<details>`/`<summary>` expandable list, chevron rotation via `group-open:rotate-90`, summary line with category/type counts, type tags as styled `<span>` elements; graceful fallback message when MongoDB is unavailable
- shadcn/ui component added: `slider`

### Changed — Step 8
- `app/admin/page.tsx` — replaced placeholder with async Server Component that calls `getConfig()` and `getTaxonomy()` directly, passing results as props to `AdminPanel`; uses `await connection()` from `next/server` to ensure dynamic rendering on every navigation
- `lib/config-store.ts` — migrated from module-level `let config` to `globalThis.__adminConfig` to survive Next.js dev-server module re-evaluations; same pattern as `lib/db.ts` uses for Mongoose connection caching

### Added — Step 7: Search UI (Main Feature)
- Custom search hook (`hooks/use-search.ts`) — `useReducer` state machine with 6 statuses (idle → analyzing → ranking → done / error / not-furniture), async NDJSON stream reader via `ReadableStream.getReader()`, `AbortController` for cancellation on new search
- Image upload component (`components/image-upload.tsx`) — drag-and-drop (native HTML5 API with `dragCounter` ref for flicker prevention) + file picker, `FileWithPreview` value/onChange API (blob URL created/revoked in event handlers, no useEffect), client-side MIME type and 10 MB size validation, preview via `next/image` (unoptimized for blob URLs)
- Result card component (`components/result-card.tsx`) — renders both `Product` (candidate mode) and `ScoredProduct` (scored mode) via type guard, color-coded score Badge (green ≥70, neutral ≥threshold, destructive below), low-relevance cards with `opacity-60` + "Low relevance match" label
- Result grid component (`components/result-grid.tsx`) — status-driven rendering: Loader2 spinner during analysis/ranking, Alert with retry button on error, Info alert for not-furniture, responsive grid (`sm:grid-cols-2 lg:grid-cols-3`), preliminary candidate cards shown during ranking phase
- Search page orchestrator (`components/search-page.tsx`) — `"use client"` component connecting `useApiKey` + `useSearch` hooks, `ImageUpload`, `Textarea` with character counter (500 max), Search/New Search buttons with loading state
- shadcn/ui components added: `badge`, `textarea`, `alert`

### Changed — Step 7
- `app/page.tsx` — replaced Step 5 placeholder with `<SearchPage />` import (remains a Server Component)

### Added — Step 6: API Key UI (shadcn/ui Components)
- shadcn/ui foundation components installed via CLI: `button`, `input`, `card`, `label` (`components/ui/`)
- Polished API key form (`components/api-key-form.tsx`) — Card container with title and privacy reassurance copy, Label + Input (type=password, autoFocus), client-side `sk-ant-` prefix validation before API call, Loader2 spinner during server validation, inline error display with `text-destructive`, full accessibility (aria-invalid, aria-describedby, htmlFor)
- Header "Change API Key" button upgraded to shadcn `Button` (ghost variant, size sm) for design system consistency

### Changed — Step 6
- Extracted inline `ApiKeyPrompt` from `api-key-gate.tsx` into dedicated `api-key-form.tsx` — gate is now 12 lines (pure structural component, no UI logic)

### Added — Step 5: App Shell (Layout, Navigation, API Key Context)
- API key context (`components/api-key-provider.tsx`) — React Context + `useApiKey` hook holding the Anthropic key in `useState` only (lost on refresh per RF-002), exposes `setApiKey`/`clearApiKey`
- Header with navigation (`components/header.tsx`) — branded "Furniture Search" title, `Search`/`Admin` nav links with active styling via `usePathname()`, "Change API Key" button (visible when key is set)
- API key gate (`components/api-key-gate.tsx`) — blocks page content until a valid key is provided; inline form validates via `POST /api/key` before accepting; shows loading/error states
- Updated root layout (`app/layout.tsx`) — Server Component composing `ApiKeyProvider > Header + ApiKeyGate > {children}`; updated metadata title/description
- Search page placeholder (`app/page.tsx`) — replaces default Next.js welcome page with placeholder for Step 7
- Admin page placeholder (`app/admin/page.tsx`) — creates `/admin` route with placeholder for Step 8

### Added — Step 4: API Route Handlers
- Shared error-to-HTTP mapper (`lib/api-error.ts`) — maps Anthropic SDK errors (401, 429, 502, 504), MongoDB connection errors (503), and Claude response parse failures (502) to consistent `{ status, message }` pairs
- In-memory feedback store (`lib/feedback-store.ts`) — `Map<productId, rating>` with aggregate counts, satisfies US-023 without a separate endpoint
- `POST /api/key` — validates Anthropic API key via minimal Claude call, returns `{ valid: true/false }` (not HTTP error for invalid keys)
- `POST /api/search` — two-phase NDJSON streaming: accepts FormData (image + optional prompt), validates file type/size/prompt length, streams `candidates` then `results` chunks (or `not-furniture` / `error`); API key via `X-API-Key` header
- `GET /api/admin/config` — returns full `AdminConfig` from in-memory store
- `PUT /api/admin/config` — partial updates via `AdminConfigSchema.partial().safeParse()`, rejects empty updates and out-of-range values
- `GET /api/admin/taxonomy` — returns `TaxonomyCategory[]` from MongoDB with 5-minute cache
- `POST /api/feedback` — stores thumbs up/down rating, returns `{ success, counts: { up, down } }`
- Verification script (`scripts/verify-step4.ts`) — 12 end-to-end tests covering all endpoints, validation rejections, streaming protocol, and config round-trips

### Added — Step 3: Search Pipeline (Orchestration)
- Two-phase search pipeline (`lib/search-pipeline.ts`) — orchestrates image analysis, candidate retrieval, and re-ranking without HTTP concerns
- `searchPhase1()` — calls Claude Vision `analyzeImage`, returns discriminated union (`isFurniture: true` with candidates, or `isFurniture: false`)
- `searchPhase2()` — thin wrapper on `rerankCandidates` for consistent pipeline interface
- Cascading MongoDB query (`findCandidates`): Level 1 exact type match → Level 2 same category excluding type → Level 3 broad fallback excluding seen IDs; handles null type/category edge cases
- `toProduct()` helper converts Mongoose `.lean()` documents (ObjectId) to `Product` type (string `_id`)
- Verification script (`scripts/verify-step3.ts`) — tests both phases + non-furniture edge case end-to-end

### Added — Step 2.5: Promptfoo Setup + Prompt Evaluation
- Extracted prompt templates from hardcoded strings in `config-store.ts` into versioned files: `prompts/image-analysis.txt`, `prompts/reranking.txt` — single source of truth for both the app and promptfoo evaluation
- `config-store.ts` now loads defaults via `fs.readFileSync()` from `prompts/*.txt` at module init
- Promptfoo evaluation framework with custom TypeScript provider wrapping Claude Vision API (self-contained, loads images from filesystem, strips markdown fences)
- Setup script (`scripts/setup-promptfoo.ts`) fetches taxonomy from MongoDB and saves as fixture for offline eval
- 12 test cases (10 furniture + 2 non-furniture) with expected labels matched to live taxonomy (15 categories, 62 types)
- 5 named assertion metrics: `json-valid`, `schema-valid`, `furniture-detection`, `category-accuracy`, `type-accuracy` — mapped to PRD targets (>85%, >70%, 100%)
- npm scripts: `eval:setup` (one-time taxonomy fetch), `eval` (run evaluation), `eval:view` (interactive dashboard)
- Baseline: 12/12 (100%), deterministic with `--repeat 3`

### Changed — Step 2.5
- Set `temperature: 0` for `analyzeImage` and `rerankCandidates` API calls in `lib/claude.ts` — eliminates non-deterministic classification, significantly improves eval consistency

### Added — Step 2: Claude Service (Vision + Text)
- Prompt template renderer with `{{taxonomy}}`, `{{resultsCount}}`, and conditional `{{#userPrompt}}...{{/userPrompt}}` block substitution (`lib/prompt.ts`)
- Cached taxonomy fetcher — MongoDB aggregation with 5-minute in-memory TTL, formatted string output for prompt injection (`lib/taxonomy.ts`)
- `analyzeImage` — sends base64 image to Claude Vision, returns Zod-validated `ImageAnalysisResult` with furniture classification and attributes (`lib/claude.ts`)
- `rerankCandidates` — scores product candidates against reference image, maps back to `ScoredProduct[]`, filters hallucinated IDs (`lib/claude.ts`)
- `validateApiKey` — minimal API call to verify Anthropic key validity, catches `AuthenticationError` (`lib/claude.ts`)
- JSON extraction helper that strips markdown fences from Claude responses before parsing
- Verification script for manual end-to-end testing (`scripts/verify-step2.ts`)

### Added — Step 1: Foundation (data layer + contracts)
- Zod 4 schemas defining API contracts: Product, ScoredProduct, SearchRequest, ImageAnalysisResult, AdminConfig, FeedbackRequest, ApiKeyRequest, TaxonomyCategory (`lib/schemas/`)
- Mongoose connection singleton with globalThis caching for dev hot-reload safety (`lib/db.ts`)
- Product model mapping to read-only `products` collection with re-declaration guard (`lib/models/product.ts`)
- In-memory config store with default image analysis and re-ranking prompts, tunable parameters: resultsCount (6), maxCandidates (50), scoreThreshold (0) (`lib/config-store.ts`)
- Verified against live Atlas cluster: 2,500 products, 15 categories, 63 types

### Added
- Next.js 16.1.6 project scaffold via `create-next-app` (TypeScript, Tailwind CSS 4, ESLint 9, App Router, Turbopack)
- shadcn/ui (new-york style, lucide icons) with `cn()` utility
- Core dependencies: Zod 4, Mongoose 9, @anthropic-ai/sdk
- CLAUDE.md with project-specific conventions, tech stack reference, and auto-generated Next.js 16 docs index via `@next/codemod agents-md`
- Implementation plan (.ai/implementation-plan.md) — 10-step dependency-ordered build sequence with promptfoo integration and prompt injection defense strategy

### Changed

**Tech stack migration: Vite + Express monorepo -> Next.js 16 single project**

Prompt to agent: _"Perform a critical analysis of the tech stack against PRD requirements. Consider: MVP delivery speed, scalability, maintenance cost, complexity vs needs, simpler alternatives, and security."_

Analysis concluded that running two separate TypeScript projects (Vite SPA + Express API) with `concurrently` was over-engineered for an MVP with 2 pages and 6 endpoints. Key issues: duplicate TypeScript configs, CORS between dev servers, missing input validation, no security headers.

Decision: Migrate to Next.js 16 (App Router). This eliminates the monorepo overhead — file-based routing replaces React Router, API Route Handlers replace Express + Multer, and Zod schemas replace the missing validation layer. Single `npm run dev` command, single port, no CORS configuration needed.

- Replaced Vite 7 + React Router 7 with Next.js 16.1 (App Router, file-based routing)
- Replaced Express 5 + Multer 2 backend with Next.js API Route Handlers (in-memory FormData)
- Added Zod 4 for runtime input validation at all API boundaries (RF-033)
- Replaced monorepo structure (`/client`, `/server`, `/shared`) with single Next.js project (`/app`, `/components`, `/lib`, `/lib/schemas`)
- Updated PRD references: RF-002, RF-006, RF-031, RF-032; added RF-033
- Kept: React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui, Mongoose 9, @anthropic-ai/sdk

### Added
- Project planning and requirements documentation (.ai/prd.md)
- Product Requirements Document (PRD) with 24 user stories covering all core flows, edge cases, and admin functionality
- Initial README with architecture overview, design rationale, and setup instructions
- This CHANGELOG

### Design Decisions

**Search architecture — multi-stage pipeline over vector search**

Prompt to agent: _"Analyze whether it's worth creating a separate vector database with embeddings from MongoDB data, and a separate database for persistence (config, feedback) — considering the task must be delivered by Monday morning and it's already Thursday evening."_

Decision: No vector database. The catalog has ~2,500 products with no images — only text metadata (title, description, category, type, price, dimensions). A vector DB would add infrastructure complexity without meaningful quality gains over Claude's re-ranking, which provides superior semantic understanding. The multi-stage approach (Claude Vision attribute extraction -> cascading MongoDB filters -> Claude batch re-ranking) is well-suited to this data scale and delivers explainable results with justifications.

**Single Claude call for classification + attribute extraction**

The system prompt includes the full taxonomy (15 categories, 63 types) as enums, forcing Claude to return a structured response in one call. This halves latency compared to separate classification and extraction calls, while also handling the "not-furniture" edge case in the same request.

**Cascading query expansion for candidate retrieval**

Rather than a single broad query, the system tries exact type match first (~40 products per type), falls back to category match (~160 per category), and broadens further only if needed. This keeps the candidate set small and relevant, capping at 50 for re-ranking.

**In-memory storage for MVP**

Admin configuration and user feedback are stored in server memory. This avoids additional infrastructure (no extra database, no file I/O) and is acceptable for a demo/evaluation context where the server runs continuously. Documented as a known limitation with a clear upgrade path (JSON file or lightweight DB).
