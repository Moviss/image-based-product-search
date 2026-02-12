# Tech Stack

## Frontend — Vite + React SPA

- Vite 7 as the build tool and dev server — fast HMR, native ES modules, optimized production builds
- React 19 for building the interactive UI (image upload, result grid, admin panel)
- TypeScript 5.9 for static typing and better IDE support
- Tailwind CSS 4 for utility-first styling with CSS-first configuration and improved performance (5x faster builds)
- shadcn/ui as the component library — accessible, customizable React components built on Radix UI
- React Router 7 for client-side routing between the search view (/) and admin panel (/admin)

## Backend — Express REST API

- Node.js 24 LTS (Krypton) as the runtime — the current Active LTS version with long-term support through April 2028
- Express 5 as the web framework — improved async error handling, updated path-to-regexp for security (ReDoS mitigation), dropped legacy Node.js support
- TypeScript 5.9 for consistent typing across the full stack
- Multer 2 for multipart/form-data handling — in-memory storage mode ensures uploaded images are never written to disk
- Mongoose 9 as the MongoDB ODM — provides schema validation, query building, and TypeScript-friendly API for interacting with the read-only product catalog

## Database — MongoDB Atlas (Read-Only)

- Pre-populated MongoDB Atlas cluster with ~2,500 furniture products
- 15 categories, 63 types, prices ranging $30–$5,000
- Read-only access via provided connection string — no schema modifications or index changes
- Accessed through Mongoose for type-safe queries with cascading filter expansion

## AI — Anthropic Claude API

- @anthropic-ai/sdk as the official TypeScript SDK for Claude API communication
- Claude Vision for image analysis — extracts structured furniture attributes (category, type, style, material, color, price range) from uploaded photos
- Claude Text for batch re-ranking — scores candidates against the reference image with relevance justifications
- API key provided by the user at runtime, stored exclusively in memory (never persisted)

## Project Structure — Simple Monorepo

- /client — React frontend with its own package.json
- /server — Express backend with its own package.json
- /shared — Shared TypeScript types and interfaces (API request/response contracts)
- concurrently for running both dev servers in parallel from a root script
