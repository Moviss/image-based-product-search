# Changelog

All notable changes to this project will be documented in this file. Particular focus is given to the search functionality and its implementation.

## [Unreleased]

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
