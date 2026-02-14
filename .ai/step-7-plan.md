# Step 7 — Search UI (Main Feature)

## 1. Overview

Step 7 is the main feature of the application — the complete flow from image upload to ranked product results. It replaces the placeholder `app/page.tsx` with a fully interactive search interface.

The work has five parts:

1. **Custom hook `useSearch`** — a `useReducer`-based state machine that manages the search lifecycle: building FormData, sending the request with the API key header, reading the NDJSON stream line by line, dispatching state transitions for each phase, and supporting cancellation via AbortController.
2. **Image upload area** — a drag-and-drop zone (native HTML5 API) with file picker fallback, image preview via `URL.createObjectURL`, and instant client-side validation (format + size) using the same constants as the server.
3. **Result card** — a dual-mode component that renders product cards in both candidate mode (Phase 1, no score) and scored mode (Phase 2, with score badge and AI justification). Low-relevance indicator when score falls below the admin-configured threshold.
4. **Result grid** — the layout container that maps search status to the appropriate UI: progress messages during search, the responsive card grid, not-furniture alerts, error messages with retry, and the all-low-relevance warning.
5. **Search page orchestrator** — the Client Component that ties upload, prompt input, search button, and result grid together. Owns file/prompt form state, consumes the search hook, and coordinates the lifecycle.

This step also installs three new shadcn/ui components (`badge`, `textarea`, `alert`) and creates the `hooks/` directory (alias already configured in `components.json`).

After Step 7, a user can: upload a furniture image → optionally add a text prompt → click Search → see "Analyzing image..." progress → see preliminary MongoDB candidates → see scored results with match percentages and justifications → start a new search.

---

## 2. Assumptions

### 2.1 State Management: `useReducer` with Discriminated Actions

**Decision:** Use `useReducer` inside a custom `useSearch` hook to manage the multi-phase search lifecycle.

| Approach | Pros | Cons |
|---|---|---|
| **`useReducer`** | Single state object with clean transitions. Impossible to have inconsistent combinations (e.g., `status: "idle"` with `results` populated). Actions are self-documenting. Easy to add new phases later. | Slightly more boilerplate than `useState`. |
| **Multiple `useState`** | Simpler for small state. Familiar pattern already used in `api-key-form.tsx`. | Six+ independent state variables that must be coordinated on every transition. Easy to forget resetting one field when starting a new search. Race condition risk with stale closures. |
| **External state library (Zustand)** | Devtools, middleware, persistence. | New dependency for local UI state. Over-engineering for a single component tree. |

**Rationale:** The search has 5 distinct statuses (idle, analyzing, ranking, done, error, not-furniture) plus 6 data fields that must be updated atomically during phase transitions. `useReducer` makes these transitions explicit via action types and prevents partial updates. The existing `useState` pattern in `api-key-form.tsx` works because that form has only 3 independent fields — the search lifecycle is fundamentally more complex.

### 2.2 Drag-and-Drop: Native HTML5 API

**Decision:** Use native HTML5 drag-and-drop events (`dragenter`, `dragover`, `dragleave`, `drop`) rather than a library.

| Approach | Pros | Cons |
|---|---|---|
| **Native HTML5 DnD** | Zero new dependencies. Full control over styling and behavior. Simple for single-file upload. Aligns with project convention of minimizing dependencies. | Must handle the dragenter/dragleave counter trick manually to avoid flickering. ~30 lines of event handlers. |
| **react-dropzone** | Well-tested, handles edge cases (multiple files, directory drops). Declarative hook API. | Adds ~15KB dependency for a use case that requires only single-file selection. Another dependency to maintain. |

**Rationale:** The upload area accepts a single image file. The native API requires a `dragCounter` ref (increment on `dragenter`, decrement on `dragleave`, check for zero) to prevent the well-known flickering issue when dragging over child elements. This is a ~5-line pattern, not a complex implementation challenge. No directory upload, no multi-file, no chunked upload — the complexity that justifies a library is absent.

### 2.3 Image Preview: `URL.createObjectURL` with Cleanup

**Decision:** Generate preview URLs via `URL.createObjectURL(file)` and revoke them in a `useEffect` cleanup.

| Approach | Pros | Cons |
|---|---|---|
| **`URL.createObjectURL`** | Synchronous URL creation. Browser renders directly from blob — no base64 encoding overhead. Standard API. | Requires explicit `revokeObjectURL` cleanup to prevent memory leaks. |
| **`FileReader.readAsDataURL`** | Produces a data URL that doesn't need revocation. | Asynchronous. Base64 encoding creates a string 33% larger than the original file. Higher memory usage for large images. |

**Rationale:** `URL.createObjectURL` is the modern approach. The cleanup function in `useEffect` (`return () => URL.revokeObjectURL(url)`) handles memory management automatically when the file changes or the component unmounts.

### 2.4 Two-Phase Display: Simple State Swap, No Animation

**Decision:** Phase 1 ("candidates") renders product cards without score/justification. Phase 2 ("results") replaces the grid entirely with scored results. The transition is a simple state replacement with no animation.

| Approach | Pros | Cons |
|---|---|---|
| **Simple state swap** | Straightforward. Clear mental model — what you see is the current best data. No animation library. | Slightly jarring visual transition when grid content changes. |
| **Animated crossfade (Framer Motion)** | Smooth transition. Visually polished. | Adds dependency. Complexity for a transition that happens once per search. MVP over-engineering. |
| **Card-level merge/update** | Cards stay, scores fade in individually. | Phase 2 results are a *different subset* than Phase 1 candidates (top 6 of 50, potentially reordered). Merging makes no sense when the card set itself changes. |

**Rationale:** Phase 2 results are the top K from N candidates, potentially in a completely different order. The before/after grids may show different products. Card-level merging is semantically wrong. A full swap is the correct behavior. Animation can be added in Step 10 polish if desired.

### 2.5 shadcn Components: `badge`, `textarea`, `alert` Only

**Decision:** Install exactly three additional components.

| Component | Used for |
|---|---|
| `Badge` | Match score percentage on result cards. Variant conveys score quality: default for high (≥70), secondary for medium, destructive for low (<threshold). |
| `Textarea` | Optional text prompt input. Multi-line is more appropriate for natural-language queries than single-line `Input`. |
| `Alert` (+ `AlertTitle`, `AlertDescription`) | Not-furniture message (default variant), pipeline errors (destructive variant), all-low-relevance warning (default variant), empty results message. |

**Not installing:**

| Component | Why not |
|---|---|
| `Skeleton` | Text-based progress messages ("Analyzing image...", "Ranking results...") are simpler and match the PRD requirement (RF-023: "staged progress messages"). Skeleton implies structural knowledge of the final layout during loading, which we don't have until candidates arrive. |
| `Progress` | A progress bar implies known completion percentage. The NDJSON stream has discrete events (2 chunks), not continuous progress. Text messages are more accurate. |
| `Separator` | Not needed. Vertical spacing via `gap` and section boundaries via card borders provide sufficient visual separation. |

### 2.6 Progress Messages: Derived from Stream Status

**Decision:** Two progress messages derived from the search status. No separate "Searching catalog..." message.

| Status | Progress message |
|---|---|
| `analyzing` | "Analyzing image..." |
| `ranking` | "Ranking results..." |

**Why no "Searching catalog..." message:** The PRD mentions three messages ("Analyzing image...", "Searching catalog...", "Ranking results..."), but the NDJSON protocol has only two server-side events. The server does image analysis + MongoDB search together in `searchPhase1()` before emitting the first chunk. From the client's perspective, there is no distinct event between "analyzing" and "searching" — both happen before the `candidates` chunk arrives. Showing "Searching catalog..." would require either a fake timer-based transition (dishonest) or a protocol change (out of scope). Two honest messages is better than three where one is simulated.

### 2.7 Component Decomposition: Five Files

**Decision:** Five new files plus the updated page:

| File | Responsibility | `"use client"` needed? |
|---|---|---|
| `hooks/use-search.ts` | State machine, NDJSON reader, AbortController | Yes (uses hooks) |
| `components/search-page.tsx` | Orchestrator: ties upload, prompt, results | Yes (uses hooks + context) |
| `components/image-upload.tsx` | Drag-and-drop, file picker, preview, validation | Yes (uses useState, useRef, useEffect) |
| `components/result-card.tsx` | Single product card rendering | No (pure presentational) |
| `components/result-grid.tsx` | Grid layout, progress, alerts | No (pure presentational, callback via props) |

| Alternative | Pros | Cons |
|---|---|---|
| **Separate files (chosen)** | Each component is 80-120 lines. Clear dependency direction. Easy to review independently. | 5 files in `components/`. |
| **Single `search-page.tsx`** | Everything in one file. | 400+ lines mixing upload UX, stream parsing, grid layout, card rendering. Hard to maintain. |
| **Separate prompt input component** | Maximum separation. | The prompt is a single `Textarea` with a character counter — ~15 lines of JSX. Extracting adds a file for trivial content. Inline in `search-page.tsx` is appropriate. |

**Rationale:** The upload area has its own drag-and-drop state (`isDragging`), validation logic, and preview rendering — naturally a separate component. The result card has conditional rendering based on scored vs. candidate mode — naturally separate. The grid handles layout + progress + edge cases. The orchestrator ties them together. The prompt input is simple enough to stay inline.

### 2.8 Score Coloring Thresholds

**Decision:** Badge variant is based on score relative to the admin-configured threshold:

- `score >= 70` → default variant (visually green-ish with primary color)
- `score >= threshold && score < 70` → secondary variant (neutral)
- `score < threshold` → destructive variant (red) + `opacity-60` on card + "Low relevance match" text

**Rationale:** The score threshold is dynamic (admin-configurable, default 0). Using it as the boundary for "low-relevance" matches RF-019 ("marked as low-relevance instead of being completely hidden"). The 70% boundary for "high" is a UX heuristic — scores above 70 are typically strongly relevant. Color coding provides instant visual scanning without reading the number.

---

## 3. File Structure

```
New files:
  hooks/use-search.ts              — Custom hook: search state machine, NDJSON stream, abort
  components/search-page.tsx       — Client Component: orchestrates upload, prompt, search, results
  components/image-upload.tsx      — Client Component: drag-and-drop upload area with preview
  components/result-card.tsx       — Presentational: single product result card
  components/result-grid.tsx       — Presentational: results grid + progress + edge case messages

Auto-generated by shadcn CLI (do not write manually):
  components/ui/badge.tsx          — shadcn Badge component
  components/ui/textarea.tsx       — shadcn Textarea component
  components/ui/alert.tsx          — shadcn Alert component

Modified files:
  app/page.tsx                     — Replace placeholder with SearchPage import

Existing files (unchanged):
  app/layout.tsx                   — Root layout (composition unchanged)
  app/api/search/route.ts          — Search endpoint (backend unchanged)
  components/api-key-provider.tsx  — API key context (unchanged)
  components/api-key-gate.tsx      — Gate logic (unchanged)
  components/header.tsx            — Header (unchanged)
  lib/schemas/*                    — All Zod schemas (unchanged)
  lib/search-pipeline.ts           — Pipeline (unchanged)
  lib/config-store.ts              — Config store (unchanged)
  lib/api-error.ts                 — Error mapping (unchanged)
```

---

## 4. Implementation Tasks

### 4.0 Install shadcn Components

**Command:** `npx shadcn@latest add badge textarea alert`

This installs three components into `components/ui/`. The CLI reads `components.json` for style (new-york), aliases (`@/components/ui`), and CSS config (`app/globals.css`). All runtime dependencies (`radix-ui`, `lucide-react`) are already in `package.json`.

**Expected output:** Three new files:
- `components/ui/badge.tsx` — Badge with `variant` prop (default, secondary, destructive, outline)
- `components/ui/textarea.tsx` — Textarea with consistent border/ring styling
- `components/ui/alert.tsx` — Alert, AlertTitle, AlertDescription with `variant` prop (default, destructive)

No manual edits to these files. They are maintained by shadcn CLI.

---

### 4.1 Custom Hook: `useSearch`

**File:** `hooks/use-search.ts`

This custom hook encapsulates the entire search lifecycle: building FormData, making the fetch request with the API key header, reading the NDJSON stream line by line, dispatching state transitions, and supporting cancellation via AbortController.

```typescript
"use client";

import { useReducer, useRef, useCallback } from "react";
import type { Product, ScoredProduct, ImageAnalysisResult } from "@/lib/schemas";

// --- State types ---

type SearchStatus = "idle" | "analyzing" | "ranking" | "done" | "error" | "not-furniture";

interface SearchState {
  status: SearchStatus;
  analysis: ImageAnalysisResult | null;
  candidates: Product[];
  results: ScoredProduct[];
  scoreThreshold: number;
  error: string | null;
}

const initialState: SearchState = {
  status: "idle",
  analysis: null,
  candidates: [],
  results: [],
  scoreThreshold: 0,
  error: null,
};

// --- Actions ---

type SearchAction =
  | { type: "SEARCH_START" }
  | { type: "NOT_FURNITURE"; analysis: ImageAnalysisResult }
  | { type: "CANDIDATES_RECEIVED"; analysis: ImageAnalysisResult; candidates: Product[] }
  | { type: "RESULTS_RECEIVED"; results: ScoredProduct[]; scoreThreshold: number }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "SEARCH_START":
      return { ...initialState, status: "analyzing" };
    case "NOT_FURNITURE":
      return { ...state, status: "not-furniture", analysis: action.analysis };
    case "CANDIDATES_RECEIVED":
      return {
        ...state,
        status: "ranking",
        analysis: action.analysis,
        candidates: action.candidates,
      };
    case "RESULTS_RECEIVED":
      return {
        ...state,
        status: "done",
        results: action.results,
        scoreThreshold: action.scoreThreshold,
      };
    case "ERROR":
      return { ...state, status: "error", error: action.message };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// --- NDJSON reader ---

async function readNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onChunk: (data: Record<string, unknown>) => void,
  signal: AbortSignal,
) {
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        onChunk(JSON.parse(trimmed));
      }
    }
  }

  // Process any remaining data in buffer
  const remaining = buffer.trim();
  if (remaining && !signal.aborted) {
    onChunk(JSON.parse(remaining));
  }
}

// --- Hook ---

export function useSearch(apiKey: string | null) {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (file: File, prompt?: string) => {
      if (!apiKey) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "SEARCH_START" });

      try {
        const formData = new FormData();
        formData.append("image", file);
        if (prompt) {
          formData.append("prompt", prompt);
        }

        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: formData,
          signal: controller.signal,
        });

        // Pre-stream HTTP errors (400, 401, etc.)
        if (!response.ok) {
          const data = await response.json();
          dispatch({ type: "ERROR", message: data.error ?? `Request failed (${response.status})` });
          return;
        }

        if (!response.body) {
          dispatch({ type: "ERROR", message: "No response body received." });
          return;
        }

        const reader = response.body.getReader();

        await readNdjsonStream(
          reader,
          (chunk) => {
            const phase = chunk.phase as string;

            switch (phase) {
              case "not-furniture":
                dispatch({
                  type: "NOT_FURNITURE",
                  analysis: chunk.analysis as ImageAnalysisResult,
                });
                break;
              case "candidates":
                dispatch({
                  type: "CANDIDATES_RECEIVED",
                  analysis: chunk.analysis as ImageAnalysisResult,
                  candidates: chunk.candidates as Product[],
                });
                break;
              case "results":
                dispatch({
                  type: "RESULTS_RECEIVED",
                  results: chunk.results as ScoredProduct[],
                  scoreThreshold: chunk.scoreThreshold as number,
                });
                break;
              case "error":
                dispatch({
                  type: "ERROR",
                  message: chunk.message as string,
                });
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // User cancelled or component unmounted — not an error
        }
        dispatch({
          type: "ERROR",
          message: err instanceof Error ? err.message : "An unexpected error occurred.",
        });
      }
    },
    [apiKey],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { ...state, search, reset };
}
```

**Design decisions:**

- **Discriminated union actions:** Each action type carries exactly the data needed for that transition. The reducer is the single place where state consistency is enforced. `SEARCH_START` resets all fields to initial values — this prevents stale data from a previous search leaking into the new one.

- **Status progression:** `idle → analyzing → ranking → done`. The `analyzing` status is set immediately on `SEARCH_START` (before any server response). When the `candidates` chunk arrives, status moves to `ranking`. When `results` arrive, status moves to `done`. Error and not-furniture are terminal states that can occur at any point.

- **AbortController in ref:** Persists across renders. If the user starts a new search while one is in-flight, the previous request is aborted. `AbortError` is explicitly caught and ignored — it is an expected flow, not an error condition.

- **NDJSON reader:** Uses the standard pattern: buffer chunks, split on `\n`, keep incomplete trailing line until more data arrives. The `{ stream: true }` option on `TextDecoder.decode` handles multi-byte characters split across chunks.

- **Pre-stream vs in-stream errors:** HTTP errors (400 validation, 401 auth) are returned as standard JSON before the stream starts. The hook checks `response.ok` first. In-stream errors arrive as `{ phase: "error" }` NDJSON chunks.

- **No Zod validation on client:** The NDJSON chunks are `JSON.parse`d and cast via `as`. Client-side Zod validation would add bundle size for marginal benefit — the server already validates its output. Types provide compile-time safety for consumer code.

---

### 4.2 Image Upload Area

**File:** `components/image-upload.tsx`

Handles drag-and-drop, file picker, image preview, and client-side validation. Manages its own `isDragging` state for visual feedback. Delegates file state to the parent via controlled component pattern.

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/schemas";

interface ImageUploadProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = "JPEG, PNG, WebP";
const MAX_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);

function validateFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return `Invalid format. Allowed: ${ALLOWED_EXTENSIONS}.`;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: ${MAX_SIZE_MB} MB.`;
  }
  return null;
}

export function ImageUpload({ file, onFileSelect, disabled }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Manage preview URL lifecycle
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = useCallback(
    (selectedFile: File) => {
      const validationError = validateFile(selectedFile);
      if (validationError) {
        setError(validationError);
        onFileSelect(null);
        return;
      }
      setError(null);
      onFileSelect(selectedFile);
    },
    [onFileSelect],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFile(selectedFile);
      }
      // Reset input value so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const handleRemove = useCallback(() => {
    setError(null);
    onFileSelect(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onFileSelect]);

  // Preview state: file is selected and valid
  if (file && previewUrl) {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-lg border border-border">
          <img
            src={previewUrl}
            alt="Selected furniture image"
            className="mx-auto max-h-64 object-contain"
          />
          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="absolute top-2 right-2"
              onClick={handleRemove}
              aria-label="Remove selected image"
            >
              <X />
            </Button>
          )}
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
        </p>
      </div>
    );
  }

  // Drop zone state: no file selected
  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        aria-label="Upload furniture image"
      >
        {isDragging ? (
          <>
            <ImageIcon className="size-10 text-primary" />
            <p className="text-sm font-medium text-primary">Drop image here</p>
          </>
        ) : (
          <>
            <Upload className="size-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Drag & drop an image, or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ALLOWED_EXTENSIONS} up to {MAX_SIZE_MB} MB
              </p>
            </div>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        disabled={disabled}
      />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
```

**Design decisions:**

- **Controlled file state:** The `file` is owned by the parent (SearchPage), not by this component. This allows the parent to clear the file on reset or disable the upload during search. Standard controlled component pattern.

- **`dragCounter` ref:** The classic HTML5 drag-and-drop issue: `dragenter` and `dragleave` fire on child elements within the drop zone, causing flickering. The counter pattern increments on `dragenter`, decrements on `dragleave`, and only clears `isDragging` when the counter hits zero. On `drop`, the counter is force-reset to zero.

- **Preview URL cleanup:** The `useEffect` creates an object URL when `file` changes and returns a cleanup function that revokes it. The URL is stored in local state rather than computed inline because `URL.createObjectURL` is not idempotent — calling it twice creates two URLs that both need revoking.

- **File input reset:** Setting `e.target.value = ""` after reading the file allows re-selection of the same file (otherwise the `change` event doesn't fire).

- **Two render modes:** Preview mode (file selected, showing image + remove button) and drop zone mode (no file, showing upload area). Clean conditional at the top level, not nested ternaries.

- **`role="button"` + `tabIndex={0}` + `onKeyDown`:** The drop zone is a clickable `div`, not a `button`. ARIA role, tab index, and keyboard handler (Enter/Space) make it accessible.

- **Validation uses shared constants:** `ALLOWED_IMAGE_TYPES` and `MAX_IMAGE_SIZE_BYTES` from `@/lib/schemas` — the same constants used by the server-side route handler. Client and server validation rules are identical.

- **`Button size="icon-sm"`:** Uses the existing `icon-sm` variant from the shadcn button component (confirmed: `"icon-sm": "size-8"` in `components/ui/button.tsx`).

---

### 4.3 Result Card

**File:** `components/result-card.tsx`

A single product card that renders in two modes: **candidate mode** (Phase 1, no score) and **scored mode** (Phase 2, with score badge and justification).

```typescript
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Product, ScoredProduct } from "@/lib/schemas";

interface ResultCardProps {
  product: Product | ScoredProduct;
  scoreThreshold?: number;
}

function isScored(product: Product | ScoredProduct): product is ScoredProduct {
  return "score" in product;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDimensions(w: number, h: number, d: number): string {
  return `${w} \u00d7 ${h} \u00d7 ${d} cm`;
}

function getScoreBadgeVariant(
  score: number,
  threshold: number,
): "default" | "secondary" | "destructive" {
  if (score < threshold) return "destructive";
  if (score >= 70) return "default";
  return "secondary";
}

export function ResultCard({ product, scoreThreshold = 0 }: ResultCardProps) {
  const scored = isScored(product);
  const isLowRelevance = scored && product.score < scoreThreshold;

  return (
    <Card className={isLowRelevance ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-snug">
              {product.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {product.description}
            </CardDescription>
          </div>
          {scored && (
            <Badge
              variant={getScoreBadgeVariant(product.score, scoreThreshold)}
              className="shrink-0 tabular-nums"
            >
              {product.score}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{formatPrice(product.price)}</span>
            <span className="text-muted-foreground">
              {formatDimensions(product.width, product.height, product.depth)}
            </span>
          </div>
          {scored && product.justification && (
            <p className="text-sm text-muted-foreground italic">
              {product.justification}
            </p>
          )}
          {isLowRelevance && (
            <p className="text-xs text-destructive">
              Low relevance match
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** No hooks, no event handlers, no browser APIs. Pure presentational component. Since the parent (`ResultGrid`) is inside a Client Component tree (via `SearchPage`), it will be client-rendered in practice, but the directive is unnecessary.

- **Type guard `isScored`:** Runtime discriminator checking `"score" in product`. Enables TypeScript narrowing — after the check, `product.score` and `product.justification` are available. Cleaner than separate `CandidateCard` and `ScoredCard` components since 90% of the rendering is identical.

- **`Intl.NumberFormat` for price:** Produces locale-aware currency formatting (`$1,234`). Using `"en-US"` explicitly — the app is English-only. `minimumFractionDigits: 0` avoids `$1,234.00` for whole-number prices.

- **`line-clamp-2` on description:** Limits to 2 lines with ellipsis overflow. Prevents long descriptions from breaking grid layout. Tailwind CSS 4 includes `line-clamp-*` natively.

- **`opacity-60` for low-relevance:** Subtle but clear. Combined with destructive badge variant and "Low relevance match" text — satisfies RF-019: "marked as low-relevance instead of being completely hidden."

- **`tabular-nums` on Badge:** Score numbers align vertically across cards. Without this, `89%` vs `100%` would have different widths due to proportional spacing.

- **Unicode `\u00d7` for dimensions:** The multiplication sign (×) rather than the letter x. Typographically correct for measurements.

---

### 4.4 Result Grid

**File:** `components/result-grid.tsx`

Handles grid layout, progress messages during search, not-furniture alert, error display with retry, and edge case messages.

```typescript
import { AlertCircle, Info, Loader2, SearchX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/result-card";
import type { Product, ScoredProduct, ImageAnalysisResult } from "@/lib/schemas";

type SearchStatus =
  | "idle"
  | "analyzing"
  | "ranking"
  | "done"
  | "error"
  | "not-furniture";

interface ResultGridProps {
  status: SearchStatus;
  analysis: ImageAnalysisResult | null;
  candidates: Product[];
  results: ScoredProduct[];
  scoreThreshold: number;
  error: string | null;
  onRetry: () => void;
}

const PROGRESS_MESSAGES: Partial<Record<SearchStatus, string>> = {
  analyzing: "Analyzing image...",
  ranking: "Ranking results...",
};

export function ResultGrid({
  status,
  analysis,
  candidates,
  results,
  scoreThreshold,
  error,
  onRetry,
}: ResultGridProps) {
  // Idle: nothing to show
  if (status === "idle") {
    return null;
  }

  // Progress: show spinner + message
  const progressMessage = PROGRESS_MESSAGES[status];
  if (progressMessage) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <p className="text-sm font-medium">{progressMessage}</p>
        </div>
        {status === "ranking" && candidates.length > 0 && (
          <>
            <p className="text-center text-sm text-muted-foreground">
              Preliminary results — ranking in progress
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.slice(0, 6).map((product) => (
                <ResultCard key={product._id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Not furniture
  if (status === "not-furniture") {
    return (
      <Alert className="mx-auto max-w-lg">
        <Info className="size-4" />
        <AlertTitle>No furniture detected</AlertTitle>
        <AlertDescription>
          The uploaded image does not appear to contain furniture.
          Please try a different image.
        </AlertDescription>
      </Alert>
    );
  }

  // Error
  if (status === "error") {
    return (
      <Alert variant="destructive" className="mx-auto max-w-lg">
        <AlertCircle className="size-4" />
        <AlertTitle>Search failed</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>{error ?? "An unexpected error occurred."}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="w-fit"
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Done: show final results
  if (status === "done") {
    if (results.length === 0) {
      return (
        <Alert className="mx-auto max-w-lg">
          <SearchX className="size-4" />
          <AlertTitle>No matching products</AlertTitle>
          <AlertDescription>
            We could not find matching products in the catalog.
            Try a different image or adjust your search prompt.
          </AlertDescription>
        </Alert>
      );
    }

    const allLowRelevance = results.every((r) => r.score < scoreThreshold);

    return (
      <div className="space-y-4">
        {allLowRelevance && scoreThreshold > 0 && (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Limited matches</AlertTitle>
            <AlertDescription>
              No strong matches were found. The results below have lower
              relevance scores and may not closely match your image.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((product) => (
            <ResultCard
              key={product._id}
              product={product}
              scoreThreshold={scoreThreshold}
            />
          ))}
        </div>
      </div>
    );
  }

  return null;
}
```

**Design decisions:**

- **No `"use client"` directive:** No hooks. The `onRetry` callback is passed as a prop. Pure presentational component.

- **Progress message map:** Status-to-message mapping as a static object. If a status has a progress message, the component renders spinner + message. Makes it trivial to add new intermediate statuses later.

- **Phase 1 candidates shown during ranking:** While status is `"ranking"`, the component shows both the progress spinner AND the candidate cards (sliced to first 6) below it. This provides the two-phase experience: the user sees preliminary results immediately while waiting for re-ranked scores. Candidate cards render without score badges (they are `Product`, not `ScoredProduct`).

- **Responsive grid:** `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` produces:
  - Mobile (<640px): 1 column (stacked)
  - Tablet (640px–1023px): 2 columns
  - Desktop (1024px+): 3 columns (2 rows × 3 = 6 cards)

  This matches the PRD: "2x3 grid responsive across 375px–1920px." The parent container is `max-w-5xl` (1024px), so `lg:grid-cols-3` activates where 3 columns have comfortable width.

- **All-low-relevance alert:** When every result scores below threshold AND threshold > 0 (to avoid showing the alert when threshold is at default 0), an informational alert appears above the grid. Addresses US-013: "The user is informed that results may not be fully relevant."

- **Retry button in error alert:** `variant="outline" size="sm"` keeps it visually subordinate to the error message. `onRetry` re-triggers the same search.

- **`SearchX` icon for empty results:** Crossed-out search icon from lucide-react — more expressive than a generic info icon.

---

### 4.5 Search Page Orchestrator

**File:** `components/search-page.tsx`

The main Client Component that ties together upload, prompt, search button, and result grid. Owns file/prompt form state, consumes the `useSearch` hook, and coordinates the lifecycle.

```typescript
"use client";

import { useState, useCallback } from "react";
import { Loader2, Search } from "lucide-react";
import { useApiKey } from "@/components/api-key-provider";
import { useSearch } from "@/hooks/use-search";
import { ImageUpload } from "@/components/image-upload";
import { ResultGrid } from "@/components/result-grid";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PROMPT_LENGTH } from "@/lib/schemas";

export function SearchPage() {
  const { apiKey } = useApiKey();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");

  const {
    status,
    analysis,
    candidates,
    results,
    scoreThreshold,
    error,
    search,
    reset,
  } = useSearch(apiKey);

  const isSearching = status === "analyzing" || status === "ranking";
  const hasResults = status === "done" || status === "not-furniture" || status === "error";

  const handleSearch = useCallback(() => {
    if (!file) return;
    const trimmedPrompt = prompt.trim();
    search(file, trimmedPrompt || undefined);
  }, [file, prompt, search]);

  const handleNewSearch = useCallback(() => {
    reset();
    setFile(null);
    setPrompt("");
  }, [reset]);

  const handleRetry = useCallback(() => {
    if (!file) return;
    const trimmedPrompt = prompt.trim();
    search(file, trimmedPrompt || undefined);
  }, [file, prompt, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Image-Based Product Search
        </h1>
        <p className="mt-1 text-muted-foreground">
          Upload a furniture image to find matching products from the catalog.
        </p>
      </div>

      {/* Upload + Prompt form */}
      <div className="space-y-4">
        <ImageUpload
          file={file}
          onFileSelect={setFile}
          disabled={isSearching}
        />

        <div className="space-y-2">
          <Label htmlFor="search-prompt">
            Text prompt{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="search-prompt"
            placeholder="e.g., darker wood, budget under $500, modern style..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={MAX_PROMPT_LENGTH}
            rows={2}
            disabled={isSearching}
          />
          <p className="text-xs text-muted-foreground text-right">
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSearch}
            disabled={!file || isSearching}
          >
            {isSearching ? (
              <>
                <Loader2 className="animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search />
                Search
              </>
            )}
          </Button>
          {hasResults && (
            <Button variant="outline" onClick={handleNewSearch}>
              New Search
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <ResultGrid
        status={status}
        analysis={analysis}
        candidates={candidates}
        results={results}
        scoreThreshold={scoreThreshold}
        error={error}
        onRetry={handleRetry}
      />
    </div>
  );
}
```

**Design decisions:**

- **`"use client"` directive:** Required because this component uses hooks (`useState`, `useCallback`, `useApiKey`, `useSearch`). This is the client/server boundary — child components that don't use hooks don't need the directive.

- **File and prompt state in orchestrator, not in hook:** The hook manages search lifecycle state (status, results, error). File and prompt are form input state that exists independently — the user can select a file, type a prompt, and remove the file without triggering a search. Separates concerns: hook is "what happened with the server," component is "what the user is doing."

- **`handleNewSearch` resets everything:** Clears hook state (aborts in-flight request), clears file, clears prompt. Returns UI to initial state. "New Search" button only appears when results are visible.

- **`handleRetry` re-uses current file/prompt:** Does not clear inputs. Re-triggers the same search. Appropriate for transient errors (network issues, rate limits).

- **`Textarea` instead of `Input`:** Multi-line is better for natural-language prompts ("I'm looking for a dark walnut coffee table, modern style, budget under $500"). Two rows signals longer input is welcome without taking excessive space.

- **Prompt character counter:** `{prompt.length}/{MAX_PROMPT_LENGTH}`. The `maxLength` attribute on `<Textarea>` enforces the limit at the browser level. Counter provides visual feedback.

- **Search button pattern:** Follows `api-key-form.tsx`: `Loader2 className="animate-spin"` + text during loading, icon + text otherwise.

- **`isSearching` derived state:** `analyzing || ranking`. Used to disable inputs and show loading state. Not stored — computed from `status`.

---

### 4.6 Update `app/page.tsx`

**File:** `app/page.tsx`

Replace the placeholder with a thin Server Component wrapper.

```typescript
import { SearchPage } from "@/components/search-page";

export default function Page() {
  return <SearchPage />;
}
```

**Design decisions:**

- **Minimal Server Component:** No server-side data fetching, no additional metadata (root layout handles it), no layout concerns. The heading and description are in `SearchPage` because they are part of the interactive form context.

- **No `"use client"` on the page:** The page is a Server Component that renders a Client Component child — standard Next.js App Router pattern (see `.next-docs/01-app/01-getting-started/05-server-and-client-components.mdx`).

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: shadcn components installed correctly
1. Run `npx shadcn@latest add badge textarea alert`.
2. **Verify:** `components/ui/badge.tsx`, `components/ui/textarea.tsx`, `components/ui/alert.tsx` exist.
3. **Verify:** `npx tsc --noEmit` passes.

### Test 2: Upload area renders
1. Start dev server. Open `http://localhost:3000`. Enter a valid API key.
2. **Verify:** A dashed-border drop zone with "Drag & drop an image, or click to browse" text.
3. **Verify:** Below it, a textarea labeled "Text prompt (optional)" with placeholder.
4. **Verify:** Search button is disabled (no file selected).

### Test 3: File picker works
1. Click the drop zone.
2. **Verify:** Native file picker opens with JPEG/PNG/WebP filter.
3. Select a valid image.
4. **Verify:** Preview image appears with file name and size.
5. **Verify:** Remove button (X) appears on the preview.
6. **Verify:** Search button is now enabled.

### Test 4: Drag and drop works
1. Remove the current file. Drag an image file over the drop zone.
2. **Verify:** Drop zone border changes to primary color, background tints, text changes to "Drop image here."
3. Drop the file.
4. **Verify:** Preview appears.

### Test 5: Client-side validation — invalid format
1. Click the drop zone. Select a `.gif` file (or any non-JPEG/PNG/WebP file).
2. **Verify:** Error message "Invalid format. Allowed: JPEG, PNG, WebP." appears below the drop zone.
3. **Verify:** No preview. Search button remains disabled.

### Test 6: Client-side validation — file too large
1. Select an image larger than 10 MB.
2. **Verify:** Error message about file size limit appears.
3. **Verify:** No preview. Search button remains disabled.

### Test 7: Remove selected file
1. Select a valid file. Click the X button on the preview.
2. **Verify:** Preview disappears, drop zone returns.
3. **Verify:** Search button is disabled again.

### Test 8: Full search — furniture image (happy path)
1. Select a valid furniture image. Optionally enter a text prompt.
2. Click "Search."
3. **Verify:** Button changes to "Searching..." with spinner. Upload area and textarea are disabled.
4. **Verify:** Spinner with "Analyzing image..." appears below the form.
5. **Verify:** When candidates arrive, product cards appear in grid with "Preliminary results — ranking in progress" label above.
6. **Verify:** Progress message changes to "Ranking results..."
7. **Verify:** When final results arrive, grid is replaced with scored cards showing percentage badges and justification text.
8. **Verify:** "New Search" button appears next to the disabled Search button.

### Test 9: Not-furniture image
1. Select a non-furniture image (e.g., landscape, person, abstract). Click "Search."
2. **Verify:** After analysis, alert appears: "No furniture detected" with message to try a different image.
3. **Verify:** "New Search" button appears.

### Test 10: Search with text prompt
1. Select a furniture image. Type "budget under $500, dark wood" in the prompt.
2. Click "Search."
3. **Verify:** Search completes. Results may reflect prompt influence (darker/cheaper products ranked higher).

### Test 11: Error — network/API failure
1. Disconnect network or use an invalid API key.
2. Attempt a search.
3. **Verify:** Destructive alert with error message and "Try again" button.

### Test 12: Retry after error
1. From the error state, reconnect network (if disconnected). Click "Try again."
2. **Verify:** Search restarts with the same file and prompt.

### Test 13: New search
1. From the results state, click "New Search."
2. **Verify:** Results disappear. Preview disappears. Prompt clears. Drop zone returns. Search button disabled.

### Test 14: Text prompt character counter
1. Start typing in the prompt textarea.
2. **Verify:** Counter updates (e.g., "42/500").
3. Type to the 500-character limit.
4. **Verify:** Cannot type beyond 500. Counter shows "500/500."

### Test 15: Responsive layout
1. Open DevTools responsive mode.
2. Width 375px: **Verify** cards stack in a single column.
3. Width 768px: **Verify** cards show in 2 columns.
4. Width 1280px: **Verify** cards show in 3 columns (2 rows × 3).

### Test 16: Low-relevance results
1. If admin has set a scoreThreshold > 0 (via PUT /api/admin/config), search for furniture that produces low scores.
2. **Verify:** Cards below threshold have `opacity-60`, destructive badge variant, and "Low relevance match" text.
3. If ALL results are below threshold: **Verify** informational "Limited matches" alert above the grid.

### Test 17: Build check
1. `npx tsc --noEmit` — no TypeScript errors.
2. `npx next lint` — no ESLint errors.
3. `npm run build` — build succeeds.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | shadcn `badge`, `textarea`, `alert` installed in `components/ui/` | Test 1 — files exist, tsc passes |
| 2 | Drag-and-drop upload with visual feedback (border/bg change on drag) | Test 4 |
| 3 | File picker with JPEG/PNG/WebP filter | Test 3 |
| 4 | Image preview after selection with file name and size | Test 3 |
| 5 | Remove/change selected file before search | Test 7 |
| 6 | Client-side validation: invalid format error shown instantly | Test 5 |
| 7 | Client-side validation: file too large error shown instantly | Test 6 |
| 8 | Optional text prompt textarea with character counter (max 500) | Test 14 |
| 9 | Search button disabled until file selected | Test 2 |
| 10 | Loading state: spinner + "Searching..." on button, inputs disabled | Test 8 |
| 11 | Progress message: "Analyzing image..." while waiting for first chunk | Test 8 |
| 12 | Progress message: "Ranking results..." after candidates received | Test 8 |
| 13 | Two-phase display: candidate cards shown during ranking phase | Test 8 |
| 14 | Two-phase display: scored results replace candidates after re-ranking | Test 8 |
| 15 | Result cards show: title, description, price ($), dimensions (W×H×D cm) | Test 8 |
| 16 | Result cards (scored): score badge with percentage, AI justification | Test 8 |
| 17 | Score badge color: default (≥70), secondary (≥threshold), destructive (<threshold) | Tests 8, 16 |
| 18 | Low-relevance: `opacity-60` + destructive badge + "Low relevance match" text | Test 16 |
| 19 | All-low-relevance: informational alert above grid when all scores < threshold | Test 16 |
| 20 | Not-furniture: alert with "No furniture detected" message | Test 9 |
| 21 | Error: destructive alert with message and "Try again" button | Test 11 |
| 22 | Empty results: informational alert with suggestion message | Edge case |
| 23 | Retry re-triggers search with same file/prompt | Test 12 |
| 24 | "New Search" resets all state (file, prompt, results) | Test 13 |
| 25 | Responsive grid: 1 column mobile (<640px), 2 columns tablet, 3 columns desktop | Test 15 |
| 26 | AbortController cancels in-flight request on new search | Code review |
| 27 | `tsc --noEmit` clean | Test 17 |
| 28 | `next lint` clean | Test 17 |
| 29 | `npm run build` succeeds | Test 17 |

---

## 7. Out of Scope for Step 7

These items are deliberately deferred to later steps:

- **Feedback (thumbs up/down buttons)** — Step 9. Result cards will not have feedback buttons yet.
- **Admin panel** — Step 8. The search uses default config values (6 results, 50 candidates, threshold 0).
- **Error boundaries** — Step 10. Unhandled rendering errors show the default Next.js error page.
- **Animations/transitions** — Step 10 polish. The two-phase swap is a simple state replacement.
- **Image compression/resizing** — Out of scope. The 10 MB limit is sufficient for MVP.
- **Search history** — Explicitly out of scope per PRD section 4.
- **Dark mode toggle** — Not in MVP scope.
- **Product images in result cards** — The MongoDB products do not have image URLs.
- **Skeleton loading placeholders** — Text-based progress messages are used instead (see assumption 2.5).
- **Toast notifications** — Not needed; all feedback is inline in the search area.
- **react-hook-form** — Not justified for two inputs (file + prompt). `useState` is sufficient (see assumption 2.1).
- **react-dropzone** — Not justified for single-file upload (see assumption 2.2).
- **Keyboard shortcut for search** (e.g., Cmd+Enter) — Nice-to-have, not in PRD.
