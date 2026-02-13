# Tech Stack

## Full-Stack Framework — Next.js 16

- Next.js 16.1 as the full-stack React framework — file-based routing, API Route Handlers, React Server Components, built-in image optimization
- React 19 for building the interactive UI (image upload, result grid, admin panel)
- TypeScript 5.9 for static typing across the entire codebase (single project, no separate configs)
- Tailwind CSS 4 for utility-first styling with CSS-first configuration and improved performance
- shadcn/ui as the component library — accessible, customizable React components built on Radix UI
- Zod 4 for runtime input validation and type inference — validates API requests (search, config, feedback), file uploads, and environment inputs (docs: https://zod.dev/)

## Database — MongoDB Atlas (Read-Only)

- Pre-populated MongoDB Atlas cluster with ~2,500 furniture products
- 15 categories, 63 types, prices ranging $30–$5,000
- Read-only access via provided connection string — no schema modifications or index changes
- Accessed through Mongoose 9 for type-safe queries with cascading filter expansion

## AI — Anthropic Claude API

- @anthropic-ai/sdk as the official TypeScript SDK for Claude API communication
- Claude Vision for image analysis — extracts structured furniture attributes (category, type, style, material, color, price range) from uploaded photos
- Claude Text for batch re-ranking — scores candidates against the reference image with relevance justifications
- API key provided by the user at runtime, stored exclusively in memory (never persisted)

## Project Structure — Single Next.js Project

- /app — Next.js App Router pages and layouts (/, /admin)
- /app/api — Route Handlers replacing standalone Express server (~6 endpoints)
- /components — Shared React components (upload area, result grid, admin forms)
- /lib — Server-side business logic (Claude service, MongoDB queries, config store)
- /lib/schemas — Zod schemas for request/response validation and shared type contracts
