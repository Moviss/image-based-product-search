# Product Requirements Document (PRD) - Image-Based Product Search

## 1. Product Overview

Image-Based Product Search is a full-stack web application that allows users to search for furniture in a product catalog by uploading an image. The system analyzes the image using Claude Vision (Anthropic), extracts visual attributes (category, type, style, material, color, estimated price range), and then queries a MongoDB database containing ~2,500 furniture products (15 categories, 63 types, prices $30-$5,000). Results are re-ranked by Claude with a relevance score and justification.

Users can optionally add a natural-language query to modify the search context (e.g., preferred color, budget). The application includes an admin panel for configuring search parameters and AI system prompts without code changes.

Tech stack:
- Full-stack framework: Next.js 16 (App Router) + React 19 + TypeScript
- UI: shadcn/ui + Tailwind CSS 4
- Database: MongoDB Atlas (read-only) via Mongoose 9
- AI: Claude API (Vision + Text) by Anthropic via @anthropic-ai/sdk
- Validation: Zod 3 for runtime input validation and type inference
- Upload: Next.js Route Handlers with in-memory FormData processing

## 2. User Problem

Users looking for furniture often have a reference image — e.g., they saw a piece of furniture at a friend's house, in a magazine, or on social media — but they don't know the product name, category, or manufacturer. Traditional text-based search requires the user to precisely describe the furniture, which is difficult and imprecise, especially when lacking industry-specific vocabulary.

Existing furniture catalogs only offer filtering by categories and parameters, which requires prior knowledge about the product. The lack of visual search makes the process of finding matching furniture time-consuming and frustrating.

This application solves the problem by enabling users to upload a photo and immediately receive relevant suggestions from the catalog — with the option to refine results using a text query.

## 3. Functional Requirements

### 3.1 API Key Configuration

- RF-001: The application requires an Anthropic API key before any functionality is available.
- RF-002: The API key is stored exclusively in memory — on the client side in React state, passed to Next.js Route Handlers per-request via headers. The key is never persisted to disk.
- RF-003: The application validates the API key before granting access to search functionality.

### 3.2 Image Upload

- RF-004: The system accepts images in JPEG, PNG, and WebP formats.
- RF-005: Maximum file size is 10 MB.
- RF-006: Upload is handled by Next.js Route Handlers with in-memory FormData processing — the image is never saved to disk.
- RF-007: After selecting a file, the user sees a preview of the uploaded image.
- RF-008: The image is converted to base64 and sent to Claude API.

### 3.3 Image Analysis (Claude Vision)

- RF-009: The system sends a single request to Claude containing the image and a system prompt with the full list of 15 categories and 63 types as enums.
- RF-010: Claude returns a structured response: classification (furniture / not-furniture), category, type, style, material, color, estimated price range.
- RF-011: If the image does not depict furniture, the system displays the message "No furniture detected in the image" and does not proceed with the search.

### 3.4 Optional Text Prompt

- RF-012: The user can optionally enter a text query to modify the search context.
- RF-013: The text prompt is treated as a context modifier — it affects filtering (e.g., budget) and re-ranking weights (e.g., preferred color), but does not override attributes extracted from the image.

### 3.5 MongoDB Search

- RF-014: The system uses cascading query expansion: first filters by type, then by category, and as a last resort a broader query.
- RF-015: A maximum of 50 candidates are retrieved from the database for re-ranking.
- RF-016: The database is read-only — the system does not modify data or indexes.

### 3.6 Result Re-ranking

- RF-017: The system sends a single batch request to Claude with the list of candidates (max 50), the reference image, and the optional user prompt.
- RF-018: Claude returns the top K results (default 6) with a score of 0-100 and a match justification for each result.
- RF-019: Results below a configurable score threshold may be marked as low-relevance instead of being completely hidden.

### 3.7 Results Display

- RF-020: Results are presented in a 2x3 grid (default 6 results), responsive across different screen sizes.
- RF-021: Each result card contains: product title, description, price, dimensions (width/height/depth), match score percentage, AI-generated match justification.
- RF-022: The system uses two-phase display: fast results from MongoDB as the first render, then replacement with re-ranked results after Claude responds.
- RF-023: While waiting for results, the system displays staged progress messages (e.g., "Analyzing image...", "Searching catalog...", "Ranking results...").

### 3.8 User Feedback

- RF-024: Each result has thumbs up / thumbs down buttons for relevance assessment.
- RF-025: Feedback is stored in server memory for the duration of the session.

### 3.9 Admin Panel

- RF-026: The panel is accessible at the /admin route.
- RF-027: It allows editing the system prompt for image analysis.
- RF-028: It allows editing the system prompt for re-ranking.
- RF-029: It allows configuration of numeric parameters: number of displayed results (range 3-12), maximum number of candidates for re-ranking, minimum score threshold.
- RF-030: It displays a preview of available categories and types from the database.
- RF-031: Configuration changes are applied immediately without server restart and are stored in server-side in-process memory (module-level state in Next.js).

### 3.10 Backend API

- RF-032: The backend exposes ~6 API Route Handlers (Next.js App Router):
  - POST /api/search — image upload + optional prompt, returns results
  - POST /api/key — API key validation
  - GET /api/admin/config — retrieve current configuration
  - PUT /api/admin/config — update configuration
  - GET /api/admin/taxonomy — retrieve categories and types from the database
  - POST /api/feedback — save result relevance feedback
- RF-033: All API inputs are validated at the boundary using Zod schemas — file type/size, prompt length, config parameters, API key format.

## 4. Product Boundaries

### In Scope

- Image upload and analysis via Claude Vision
- Product search in the existing MongoDB database (read-only)
- Result re-ranking by Claude with scoring and justification
- Optional text prompt to modify search
- Admin panel with prompt and parameter configuration
- Thumbs up/down feedback in UI
- Graceful handling: "not-furniture" classification, approximate results instead of empty list
- Two-phase result display (fast filters -> re-ranking)

### Out of Scope

- User authentication and authorization (no login/registration system)
- Admin configuration persistence across server restarts (MVP — in-memory)
- User feedback persistence across server restarts (MVP — in-memory)
- Database modification (adding/editing/deleting products)
- Support for multiple AI providers (Anthropic Claude only)
- Caching of Claude API queries
- Generating or sourcing test images for offline evaluation
- Production deployment — the application runs locally
- Internationalization / multi-language support
- User search history
- Product comparison
- Shopping cart / checkout process

## 5. User Stories

### API Configuration

US-001: Enter API Key
As a user, I want to enter my Anthropic API key so that I can use the image search functionality.

Acceptance Criteria:
- On first visit, a form for entering the API key is displayed.
- The key is validated via a test request to the Anthropic API.
- After successful validation, the user is redirected to the search view.
- If the key is invalid, an error message with instructions is displayed.
- The key is stored exclusively in React state (client) and passed to the server per-request.

US-002: Change API Key
As a user, I want to be able to change my API key so that I can switch to a different key.

Acceptance Criteria:
- The interface includes an option to change/clear the API key.
- After changing the key, the previous one is immediately removed from memory.
- The new key is validated before being applied.

### Image Upload and Analysis

US-003: Upload Furniture Image
As a user, I want to upload a photo of furniture so that I can find similar products in the catalog.

Acceptance Criteria:
- The interface includes a drag-and-drop area or a file selection button.
- Accepted formats: JPEG, PNG, WebP.
- Maximum file size: 10 MB.
- After selecting a file, an image preview is displayed.
- The image is sent to the server after clicking the "Search" button.

US-004: Preview Selected Image
As a user, I want to see a preview of my selected photo before searching so that I can confirm I chose the correct file.

Acceptance Criteria:
- After selecting a file, a thumbnail of the image is displayed in the interface.
- The user can remove the selected image and choose another before initiating a search.

US-005: Reject Invalid File Format
As a user, I want to be informed when the selected file has an invalid format so that I know which formats are supported.

Acceptance Criteria:
- When attempting to upload a file other than JPEG/PNG/WebP, a message about allowed formats is displayed.
- The file is not sent to the server.

US-006: Reject Oversized File
As a user, I want to be informed when the selected file exceeds the size limit so that I can upload a smaller file.

Acceptance Criteria:
- When attempting to upload a file over 10 MB, a message about the size limit is displayed.
- The file is not sent to the server.

### Search and Results

US-007: Search by Image
As a user, I want to initiate a search after uploading an image so that I receive a list of matching products from the catalog.

Acceptance Criteria:
- After clicking "Search," the image is analyzed by Claude Vision.
- The system extracts attributes: category, type, style, material, color, price range.
- Based on the attributes, the system searches for candidates in MongoDB (cascading expansion).
- Candidates are re-ranked by Claude.
- By default, the top 6 results are displayed.
- Total response time does not exceed 8 seconds.

US-008: Two-Phase Result Loading
As a user, I want to see preliminary results quickly, even before AI completes the full ranking, so that I don't stare at a blank screen.

Acceptance Criteria:
- After the MongoDB query completes, preliminary results are displayed (before re-ranking).
- After Claude completes re-ranking, results are replaced with final ones including scores and justifications.
- The user sees staged progress messages ("Analyzing image...", "Searching catalog...", "Ranking results...").

US-009: Browse Search Results
As a user, I want to browse results in a clear grid so that I can easily compare found products.

Acceptance Criteria:
- Results are displayed in a 2x3 grid (responsive).
- Each card contains: title, description, price in USD, dimensions (width, height, depth) in cm, match score (0-100%), AI-generated match justification.
- The grid adapts to screen size (responsive).

US-010: Search with Text Prompt
As a user, I want to add a text query to the image search so that I can refine results (e.g., preferred color, budget).

Acceptance Criteria:
- The text field is optional — search works without it.
- The prompt content modifies filtering (e.g., "budget under $500" restricts results by price).
- The prompt content modifies re-ranking (e.g., "darker wood" favors dark products).
- The prompt does not override image attributes — it acts as a context modifier.

US-011: Rate Result Relevance
As a user, I want to rate the relevance of individual results (thumbs up/down) so that I can provide feedback on search quality.

Acceptance Criteria:
- Each result card displays thumbs up and thumbs down icons.
- Clicking one of the icons saves the rating (positive or negative).
- The rating is visually confirmed (icon state change).
- Feedback is sent to the server and stored in memory.

### Edge Cases

US-012: Image Does Not Depict Furniture
As a user, I want to receive a clear message when my uploaded photo does not depict furniture so that I understand why there are no results.

Acceptance Criteria:
- The system classifies the image as "not-furniture" within the main Claude call (no additional request).
- The message "No furniture detected in the image" is displayed.
- No MongoDB search is performed.
- The user can upload a new image.

US-013: No Well-Matching Results
As a user, I want to see approximate results with a low-match indicator instead of an empty list so that I have a point of reference.

Acceptance Criteria:
- When no candidate exceeds the score threshold, results are displayed with a visual low-match indicator.
- The user is informed that results may not be fully relevant.

US-014: Anthropic API Error
As a user, I want to receive an understandable error message when the Anthropic API is unavailable or returns an error.

Acceptance Criteria:
- On a 401 error (invalid key), the user is informed about an API key issue.
- On a 429 error (rate limit), the user is informed about exceeding the request limit.
- On a 500 error or timeout, a general message about an AI service issue is displayed.
- The user can retry the search after an error is displayed.

US-015: Database Connection Error
As a user, I want to receive an understandable message when the database is unavailable.

Acceptance Criteria:
- On a MongoDB connection error, a message about catalog unavailability is displayed.
- The system does not crash — it handles the error gracefully.

### Admin Panel

US-016: Edit Image Analysis System Prompt
As an administrator, I want to edit the system prompt used for image analysis so that I can tune attribute extraction without code changes.

Acceptance Criteria:
- The /admin panel includes a text field with the current image analysis system prompt.
- After editing and saving, the new prompt is immediately applied to subsequent searches.
- Validation: the prompt cannot be empty.
- Changes are stored in server memory (lost on restart — acceptable for MVP).

US-017: Edit Re-ranking System Prompt
As an administrator, I want to edit the re-ranking system prompt so that I can influence how results are scored and ranked.

Acceptance Criteria:
- The /admin panel includes a text field with the current re-ranking system prompt.
- After editing and saving, the new prompt is immediately applied.
- Validation: the prompt cannot be empty.

US-018: Configure Number of Displayed Results
As an administrator, I want to set the number of displayed results to customize the UX.

Acceptance Criteria:
- A slider or numeric input with a range of 3-12 is available.
- The change is applied immediately after saving.
- Default value: 6.

US-019: Configure Maximum Candidates for Re-ranking
As an administrator, I want to set how many candidates from MongoDB are sent for re-ranking so that I can balance quality against cost/latency.

Acceptance Criteria:
- A numeric input with a reasonable range (e.g., 10-100) is available.
- Default value: 50.
- The change is applied after saving.

US-020: Configure Minimum Score Threshold
As an administrator, I want to set a score threshold below which results are marked as low-relevance.

Acceptance Criteria:
- A numeric input or slider with a range of 0-100 is available.
- Results below the threshold are displayed with a visual low-match indicator.
- The change is applied after saving.

US-021: View Product Taxonomy
As an administrator, I want to see a list of all product categories and types in the database so that I can better understand the data and tune prompts.

Acceptance Criteria:
- The panel displays the full list of categories (15) with their assigned types (63).
- Data is fetched directly from MongoDB.
- The list is clearly formatted (e.g., category with an expandable list of types).

US-022: Navigate Between Search and Admin Panel
As a user, I want to easily switch between the search view (/) and the admin panel (/admin).

Acceptance Criteria:
- The application navigation includes links to both views.
- Switching between views does not cause loss of the API key from memory.
- The admin panel is accessible without additional authentication (back-office, not consumer-facing).

### Evaluation

US-023: Collect Online Feedback Metrics
As a product owner, I want to see aggregated user feedback data so that I can assess search quality.

Acceptance Criteria:
- The system counts thumbs up and thumbs down ratings per session.
- A way to read the positive-to-negative ratio is available (e.g., API endpoint or log).

US-024: Offline Test Suite with Metrics
As a developer, I want to run an offline test suite with predefined images so that I can measure Precision@K, Category Accuracy, and Type Accuracy.

Acceptance Criteria:
- A set of 15-20 test images with expected categories and types is defined.
- The offline evaluation approach is documented in the README.
- Metrics include: Precision@K (how many of K results are relevant), Category Accuracy (whether the correct category appears in top results), Type Accuracy (whether the correct type appears in top 3).

## 6. Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Category Accuracy | >85% | Offline test suite — whether the correct category is present in top search results |
| Type Accuracy | >70% | Offline test suite — whether the correct product type appears in top 3 results |
| Precision@6 | >60% | Offline test suite — what percentage of the 6 returned results are relevant |
| User Satisfaction | >70% positive | Online — ratio of thumbs up to total (thumbs up + thumbs down) |
| End-to-end Response Time | <8 seconds | Backend latency measurement from request receipt to returning re-ranked results |
| Not-furniture Classification | 100% edge cases | Non-furniture images correctly classified as "not-furniture" |
| UI Responsiveness | Responsive grid | Correct result display on screens from 375px to 1920px width |
