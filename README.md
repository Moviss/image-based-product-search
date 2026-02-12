# Image-Based Product Search

A full-stack application that lets users upload an image of a furniture item and receive relevant matches from a product catalog, optionally refined by a natural-language query.

## How It Works

1. User uploads a furniture image (JPEG/PNG/WebP, max 10 MB)
2. Claude Vision analyzes the image and extracts structured attributes (category, type, style, material, color, price range)
3. The system queries MongoDB using cascading filter expansion (type -> category -> broader)
4. Claude re-ranks up to 50 candidates and returns the top results with relevance scores and justifications
5. Results are displayed in a responsive grid with match explanations

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js 16 (App Router)                  │
│                                                              │
│  Client (React 19 + shadcn/ui + Tailwind CSS 4)             │
│    │                                                         │
│  API Route Handlers (/app/api/*)                             │
│    ├─> Claude Vision (image analysis)                        │
│    ├─> MongoDB (candidate retrieval)                         │
│    └─> Claude Text (re-ranking + scoring)                    │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Choices

**Multi-stage retrieval pipeline** rather than a single AI call or vector similarity search:
- Stage 1 (Image Analysis): A single Claude Vision call extracts structured attributes (category, type from a closed enum of 15 categories / 63 types, plus style, material, color, price range). Combining classification and attribute extraction in one call reduces latency by ~50% vs. two separate calls.
- Stage 2 (Candidate Retrieval): Cascading MongoDB query — first by exact type (~40 products), then by category (~160 products) as fallback, capped at 50 candidates. This leverages the existing database structure without requiring a vector index.
- Stage 3 (Re-ranking): A single batch Claude call scores all candidates (0-100) against the reference image and optional user prompt, returning justifications. More accurate than embedding cosine similarity and cheaper than per-product scoring.

**Why no vector database?** The catalog contains ~2,500 products — a trivially small dataset. Products have no images in the database (only text metadata), so image-to-image embedding similarity isn't possible. Claude's re-ranking provides superior semantic understanding compared to cosine similarity on text embeddings, and the cascading filter approach keeps candidate sets small and precise.

**User prompt as context modifier**: The optional text query influences both filtering (e.g., price constraints) and re-ranking weights (e.g., color preferences), but never overrides image-derived attributes. This preserves visual search accuracy while enabling refinement.

**Admin-tunable prompts**: Both the image analysis and re-ranking system prompts are editable via the admin panel, enabling prompt engineering without code changes.

### Tradeoffs

- In-memory configuration and feedback storage (lost on restart) — acceptable for MVP, avoids additional infrastructure
- Two Claude API calls per search (~3-6s latency) — mitigated by two-phase display showing fast MongoDB results first
- No caching — each search costs two API calls; acceptable given expected low-volume usage during evaluation

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 |
| Validation | Zod 3 (runtime input validation + type inference) |
| Database | MongoDB Atlas (read-only, pre-populated) via Mongoose 9 |
| AI | Claude API (Vision + Text) by Anthropic via @anthropic-ai/sdk |
| Upload | Next.js Route Handlers (in-memory FormData) |

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key (entered at runtime in the UI)

### Installation

```bash
# Clone the repository
git clone https://github.com/Moviss/image-based-product-search
cd image-based-product-search

# Install dependencies
npm install

# Start development server
npm run dev
```

The application runs on `http://localhost:3000`.

### Usage

1. Open the app in your browser
2. Enter your Anthropic API key
3. Upload a furniture image
4. Optionally add a text query to refine results (e.g., "darker wood, budget under $500")
5. Browse ranked results with match scores and AI justifications

### Admin Panel

Navigate to `/admin` to configure:
- System prompts for image analysis and re-ranking
- Number of displayed results (3-12)
- Maximum candidates for re-ranking
- Minimum relevance score threshold
- View product taxonomy (categories and types)

## Evaluation Approach

### Online (Runtime)
- Thumbs up/down buttons on each result card
- Aggregated satisfaction ratio tracked per session

### Offline (Test Suite)
- A predefined set of test images with expected categories and types
- Metrics: Precision@K, Category Accuracy (correct category in top results), Type Accuracy (correct type in top 3)
- Documented approach for reproducible evaluation runs

## Future Enhancements

- **Result caching**: Cache image analysis results and MongoDB queries to reduce API costs and latency for repeated/similar searches
- **Product images**: If product images were added to the catalog, enable image-to-image similarity via embeddings for more precise visual matching
- **Feedback persistence**: Store thumbs up/down data to a file or database for long-term quality tracking and prompt optimization
- **Admin config persistence**: Save admin configuration to a JSON file so settings survive server restarts
- **Search history**: Allow users to revisit previous searches and compare results across prompt/config changes
- **Batch evaluation pipeline**: Automated PromptFoo integration for continuous offline evaluation with CI/CD
- **Multi-provider support**: Allow switching between AI providers (OpenAI, Google) for comparison and resilience
- **Price/dimension filters in UI**: Expose explicit filter controls alongside the AI-powered search for hybrid browsing
