# Changelog

All notable changes to this project will be documented in this file. Particular focus is given to the search functionality and its implementation.

## [Unreleased]

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
