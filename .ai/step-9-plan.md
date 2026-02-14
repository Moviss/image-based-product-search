# Step 9 — Feedback (Thumbs Up/Down)

## 1. Overview

Step 9 adds user feedback to search results — thumbs up/down buttons on each scored result card. It is purely a **UI step** that connects the existing backend infrastructure (feedback store, API endpoint, Zod schema — all built in Step 4) to the existing result card component (built in Step 7).

The work has four parts:

1. **Feedback state in SearchPage** — a `Record<string, "up" | "down">` tracking which products the user has rated, with an optimistic update handler that fires POST /api/feedback in the background.
2. **Props threading** — feedback map and handler passed from SearchPage → ResultGrid → ResultCard.
3. **Feedback buttons in ResultCard** — ThumbsUp/ThumbsDown icon buttons in a new `CardFooter`, visible only for scored results (Phase 2). Visual state change on selection.
4. **Feedback store fix** — migrate `lib/feedback-store.ts` from module-level `Map` to `globalThis` pattern (same fix applied to `config-store.ts` in Step 8) to survive Next.js dev module re-evaluations.

After Step 9, a user can: perform a search → see scored results → click thumbs up or thumbs down on any result → see the button visually highlight → change their rating → start a new search (feedback state resets).

No new files are created. No new dependencies are installed.

---

## 2. Assumptions

### 2.1 Feedback State Location: `useState` in SearchPage

**Decision:** Store feedback as `Record<string, "up" | "down">` via `useState` in `SearchPage`, alongside `fileState` and `prompt`.

| Approach | Pros | Cons |
|---|---|---|
| **`useState` in SearchPage (chosen)** | Centralized with other form state. Natural reset in `handleNewSearch`. Clean data flow: SearchPage → ResultGrid → ResultCard. No new files or hooks. Feedback is "per search" — matches the lifecycle. | Requires threading props through ResultGrid to ResultCard. |
| **Local `useState` in each ResultCard** | Zero prop threading. Each card self-contained. | ResultCard becomes a Client Component (needs `"use client"` for `useState`). Harder to reset all ratings on new search — must rely on component unmounting. Couples API calls to a presentational component. |
| **New action in `useSearch` reducer** | Feedback lifecycle tied to search lifecycle. `RESET` action clears everything. Single source of truth. | Couples unrelated concerns — search state machine (analyzing/ranking/done) has nothing to do with user feedback. Adds action type + state field to an already complex reducer. Over-engineering. |
| **Custom `useFeedback` hook** | Clean separation. Reusable. | New file for ~15 lines of logic (`useState` + one `fetch` call). Not reusable — feedback is specific to search results. Same pattern as `useState` in SearchPage but with indirection. |

**Rationale:** Feedback is per-search form state, not search lifecycle state. It belongs in `SearchPage` alongside `fileState` and `prompt` — these are all "user interaction state" that resets when a new search starts. Threading through ResultGrid is 2 lines of additional props — trivial cost. The `useSearch` reducer manages a multi-phase state machine (6 statuses, 6 actions) and should not be further complicated with an orthogonal concern.

### 2.2 Feedback Buttons: Only for Scored Results (Phase 2)

**Decision:** Show feedback buttons only when the product is a `ScoredProduct` (has `score` and `justification`). No buttons during the "ranking" phase (Phase 1 candidates).

**Rationale:** Phase 1 candidates are preliminary — they will be replaced by re-ranked results within seconds. Giving feedback on temporary results makes no semantic sense. The `isScored()` type guard already exists in `result-card.tsx` and naturally gates the footer.

### 2.3 Click Behavior: Change Rating, No Toggle-Off

**Decision:** Clicking a thumb button sets that rating. Clicking the other button changes the rating. Clicking the already-selected button is idempotent (re-sends same value — harmless).

| Behavior | Pros | Cons |
|---|---|---|
| **Change only, no toggle-off (chosen)** | Simple mental model: you either like it or dislike it. Backend schema (`rating: z.enum(["up", "down"])`) has no "none" state — consistent. No need for a "remove feedback" endpoint. | User cannot retract feedback. |
| **Toggle-off on same click** | User can undo. More flexible. | Requires a "remove feedback" endpoint or a new rating value. Backend changes out of scope. UX ambiguity: does "no rating" mean "I have no opinion" or "I accidentally clicked"? |

**Rationale:** The `FeedbackRequestSchema` requires `rating: z.enum(["up", "down"])` — there is no "none" or "remove" option. The feedback store (`Map.set()`) always overwrites. Supporting toggle-off would require backend changes (out of scope). The PRD says "clicking one of the icons saves the rating" — a definitive action, not a toggle.

### 2.4 Update Strategy: Optimistic

**Decision:** Update the local UI state immediately on click. Fire `POST /api/feedback` in the background. Ignore failures silently.

| Strategy | Pros | Cons |
|---|---|---|
| **Optimistic (chosen)** | Instant visual feedback. No loading spinner on a trivial action. Clean UX for a non-critical operation. Server-side feedback is best-effort (in-memory, lost on restart). | If POST fails, UI shows a rating that isn't persisted. |
| **Wait for response** | UI always matches server state. | Noticeable delay (~50-100ms) on what should be an instant interaction. Requires loading state per button. Over-engineering for an MVP in-memory store. |

**Rationale:** Feedback is explicitly non-critical (PRD section 4: "User feedback persistence across server restarts — out of scope"). The POST can only fail on network error (server validation is guaranteed to pass for valid input from our own client). The consequence of a failed POST is one rating not stored in an in-memory map that resets on server restart anyway. Optimistic update is the right trade-off.

### 2.5 Visual Design: Ghost Buttons with Color on Selection

**Decision:** Use `Button variant="ghost" size="icon-sm"` for both thumbs. On selection, apply color classes to the icon.

| Approach | Pros | Cons |
|---|---|---|
| **Ghost buttons + icon color (chosen)** | Minimal visual weight. Buttons don't compete with card content. Color on the icon alone is a clear selection signal. Uses existing Button component — no new dependencies. | Subtle — but appropriate for secondary actions. |
| **Toggle component (shadcn)** | Built-in pressed state. Semantic `aria-pressed`. | Not installed. `npx shadcn@latest add toggle` adds a dependency for two buttons. Toggle is designed for single-button on/off, not a two-button choice. |
| **Outline → Default variant swap** | Stronger visual change on selection. | Default variant is primary-colored — too visually heavy for feedback buttons. Draws attention away from the score badge and content. |

**Button states:**
- **Unselected:** `ghost` variant, icon in `text-muted-foreground`
- **Selected thumbs up:** `ghost` variant, icon in `text-emerald-600` (green — positive)
- **Selected thumbs down:** `ghost` variant, icon in `text-destructive` (red — negative)
- **Hover (unselected):** standard ghost hover (bg tint via existing styles)

**Placement:** Inside `CardFooter`, right-aligned. Two buttons with a small gap. CardFooter provides a clean visual separator from CardContent.

**Accessibility:** `aria-pressed` attribute on each button reflects selection state. `aria-label` describes the action ("Rate as relevant" / "Rate as not relevant").

### 2.6 Aggregate Counts: Not Displayed in UI

**Decision:** The POST response includes `{ counts: { up, down } }` but Step 9 does not display these anywhere.

**Rationale:** US-023 says "a way to read the positive-to-negative ratio is available (e.g., API endpoint or log)." The endpoint already satisfies this requirement — the ratio is accessible via the API response. Displaying counts in the UI (e.g., admin panel) is deferred to Step 10 if desired. No additional UI work needed.

### 2.7 Feedback Store: Migrate to `globalThis`

**Decision:** Fix `lib/feedback-store.ts` to use the `globalThis` pattern, same as `config-store.ts`.

**Rationale:** The current module-level `const store = new Map()` is subject to Next.js dev module re-evaluation — the same issue that was fixed for `config-store.ts` in Step 8. While feedback is less critical than admin config, the fix is a 3-line change and prevents confusing behavior during manual testing (ratings silently lost mid-session in dev mode).

### 2.8 No New shadcn Components

**Decision:** Use only existing components. No `toggle`, `toggle-group`, or other new installs.

**Rationale:** The existing `Button` component with `variant="ghost" size="icon-sm"` is sufficient for thumbs up/down buttons. `ThumbsUp` and `ThumbsDown` icons are available from `lucide-react` (already a dependency). `CardFooter` is already exported from `components/ui/card.tsx`. No gaps in the component library.

---

## 3. File Structure

```
Modified files:
  lib/feedback-store.ts              — Migrate to globalThis pattern (3-line change)
  components/result-card.tsx         — Add CardFooter with feedback buttons, new props
  components/result-grid.tsx         — Thread feedback props to ResultCard
  components/search-page.tsx         — Add feedback state, handler, pass to ResultGrid

Existing files (unchanged):
  app/api/feedback/route.ts          — POST /api/feedback (backend unchanged)
  lib/schemas/feedback.ts            — FeedbackRequestSchema (unchanged)
  hooks/use-search.ts                — Search state machine (unchanged)
  components/ui/button.tsx           — Button component (unchanged)
  components/ui/card.tsx             — Card + CardFooter (unchanged)
```

No new files.

---

## 4. Implementation Tasks

### 4.1 Feedback Store: `globalThis` Migration

**File:** `lib/feedback-store.ts`

Migrate from module-level `Map` to `globalThis`-cached `Map`, following the pattern from `lib/config-store.ts`.

```typescript
/**
 * In-memory feedback store (RF-024/RF-025).
 * Stores the latest rating per product ID.
 * Lost on server restart — acceptable for MVP.
 */

const g = globalThis as typeof globalThis & {
  __feedbackStore?: Map<string, "up" | "down">;
};

if (!g.__feedbackStore) {
  g.__feedbackStore = new Map();
}

/** Records or updates a rating for a product. */
export function addFeedback(productId: string, rating: "up" | "down"): void {
  g.__feedbackStore!.set(productId, rating);
}

/** Returns aggregate counts of all stored feedback. */
export function getFeedbackCounts(): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const rating of g.__feedbackStore!.values()) {
    if (rating === "up") up++;
    else down++;
  }
  return { up, down };
}
```

**Why this change:**
- In Next.js dev mode, module-level variables in `lib/` files can be reset when the module is re-evaluated (hot reload, API route cold start). The `globalThis` pattern persists the Map across module re-evaluations — the same fix applied to `config-store.ts` in Step 8 (see `components/admin-panel.tsx` plan, section 4.2).
- The feedback store is used by `app/api/feedback/route.ts` (an API route handler). Without `globalThis`, the Map could be empty when a different API route invocation accesses it.
- The change is minimal (3 lines added, 1 line changed) and follows an established project pattern.

---

### 4.2 ResultCard: Add Feedback Buttons

**File:** `components/result-card.tsx`

Add `CardFooter` with ThumbsUp/ThumbsDown buttons. Extend the props interface with optional feedback props. Buttons only render for scored products.

```typescript
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { Product, ScoredProduct } from "@/lib/schemas";

interface ResultCardProps {
  product: Product | ScoredProduct;
  scoreThreshold?: number;
  currentRating?: "up" | "down" | null;
  onFeedback?: (productId: string, rating: "up" | "down") => void;
}

function isScored(product: Product | ScoredProduct): product is ScoredProduct {
  return "score" in product;
}

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function scoreBadgeVariant(
  score: number,
  threshold: number,
): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= threshold) return "secondary";
  return "destructive";
}

export function ResultCard({
  product,
  scoreThreshold = 0,
  currentRating = null,
  onFeedback,
}: ResultCardProps) {
  const scored = isScored(product);
  const lowRelevance = scored && product.score < scoreThreshold;

  return (
    <Card className={lowRelevance ? "opacity-60" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="line-clamp-1">{product.title}</CardTitle>
            <CardDescription className="line-clamp-2">
              {product.description}
            </CardDescription>
          </div>
          {scored && (
            <Badge variant={scoreBadgeVariant(product.score, scoreThreshold)}>
              {product.score}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm font-medium">
          {priceFormat.format(product.price)}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.width} &times; {product.height} &times; {product.depth} cm
        </p>
        {scored && product.justification && (
          <p className="text-sm italic text-muted-foreground">
            {product.justification}
          </p>
        )}
        {lowRelevance && (
          <p className="text-xs text-destructive">Low relevance match</p>
        )}
      </CardContent>
      {scored && onFeedback && (
        <CardFooter className="justify-end gap-1 border-t">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onFeedback(product._id, "up")}
            aria-pressed={currentRating === "up"}
            aria-label="Rate as relevant"
          >
            <ThumbsUp
              className={
                currentRating === "up"
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              }
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onFeedback(product._id, "down")}
            aria-pressed={currentRating === "down"}
            aria-label="Rate as not relevant"
          >
            <ThumbsDown
              className={
                currentRating === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** ResultCard remains presentational. It has no hooks, no local state. The `onClick` handlers are plain function props passed from the parent. It is already client-rendered because its parent (`ResultGrid`) is inside the `SearchPage` Client Component tree.

- **`CardFooter` for button placement:** Provides a clean visual separator from CardContent. The existing `CardFooter` component (`components/ui/card.tsx` line 74) has built-in styling: `flex items-center px-6 [.border-t]:pt-6`. The `[.border-t]:pt-6` is a conditional variant — when the element has the `border-t` class, it applies `pt-6` padding automatically. Adding `className="justify-end gap-1 border-t"` triggers this built-in padding and adds a top border as visual separator. `justify-end gap-1` right-aligns the buttons with a small gap.

- **Conditional rendering gate:** `{scored && onFeedback && (...)}` — three conditions:
  1. `scored` — only for `ScoredProduct` (Phase 2 results, not Phase 1 candidates)
  2. `onFeedback` — only when the parent provides a handler (ResultGrid in "done" status passes it; "ranking" status does not)
  This ensures no buttons appear during preliminary candidate display.

- **No `disabled` on buttons:** The Button component applies `disabled:opacity-50` globally, which would dim the colored icon on the selected button — counterproductive since the selected state should be visually prominent, not faded. Instead, both buttons remain always clickable. Clicking the already-selected button re-sends the same rating (harmless — `Map.set()` overwrites with the same value, and `setFeedback` produces the same state). This avoids the opacity conflict entirely.

- **`aria-pressed`:** Standard toggle button accessibility attribute. Screen readers announce "Rate as relevant, pressed" when selected. Follows WAI-ARIA button practices. `aria-pressed` provides the semantic "selected" state that would otherwise require `disabled`.

- **Icon coloring:** `text-emerald-600` for thumbs up (green = positive), `text-destructive` for thumbs down (red = negative). Default state: `text-muted-foreground` (subtle gray). Colors are meaningful and consistent with the project's color conventions (`text-emerald-600` used in admin-panel.tsx for success messages, `text-destructive` used throughout for negative states).

- **New props are optional:** `currentRating` defaults to `null`, `onFeedback` is optional. Existing call sites (Phase 1 candidates in `result-grid.tsx`) don't need to change — they simply don't pass these props.

---

### 4.3 ResultGrid: Thread Feedback Props

**File:** `components/result-grid.tsx`

Add feedback props to `ResultGridProps` and pass them to each `ResultCard` in the "done" status render path.

Changes to the interface:

```typescript
interface ResultGridProps extends SearchState {
  onRetry: () => void;
  feedback: Record<string, "up" | "down">;
  onFeedback: (productId: string, rating: "up" | "down") => void;
}
```

Change to the destructured props:

```typescript
export function ResultGrid({
  status,
  candidates,
  results,
  scoreThreshold,
  error,
  onRetry,
  feedback,
  onFeedback,
}: ResultGridProps) {
```

Change in the `status === "done"` render path — pass feedback props to each scored ResultCard:

```typescript
{results.map((product) => (
  <ResultCard
    key={product._id}
    product={product}
    scoreThreshold={scoreThreshold}
    currentRating={feedback[product._id] ?? null}
    onFeedback={onFeedback}
  />
))}
```

**Design decisions:**

- **`feedback[product._id] ?? null`:** Look up the rating for this specific product. If not rated, `undefined` falls through to `null` via `??`. This maps the flat record to per-card props.

- **Only in "done" status:** Phase 1 candidate cards (rendered during `status === "ranking"`) do not receive feedback props — their `ResultCard` usage remains unchanged. Only scored results in the "done" grid get feedback buttons.

- **`onFeedback` passed directly:** The same function reference is passed to all cards. Each card calls it with its own `product._id`. No per-card closure needed.

- **`analysis` removed from destructuring:** The `analysis` prop was already unused in `ResultGrid` (it was passed through `SearchState` but never referenced in the render). It can remain in the spread type — no change needed beyond adding the new props.

---

### 4.4 SearchPage: Feedback State and Handler

**File:** `components/search-page.tsx`

Add feedback state, create the handler, pass to ResultGrid, reset on new search.

New state:

```typescript
const [feedback, setFeedback] = useState<Record<string, "up" | "down">>({});
```

Handler:

```typescript
const handleFeedback = useCallback(
  (productId: string, rating: "up" | "down") => {
    // Optimistic update — immediate visual feedback
    setFeedback((prev) => ({ ...prev, [productId]: rating }));

    // Fire-and-forget POST to server
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, rating }),
    }).catch(() => {
      // Silently ignore — feedback is non-critical (in-memory, lost on restart)
    });
  },
  [],
);
```

Reset in `handleNewSearch`:

```typescript
const handleNewSearch = useCallback(() => {
  reset();
  if (fileState) {
    URL.revokeObjectURL(fileState.previewUrl);
    setFileState(null);
  }
  setPrompt("");
  setFeedback({}); // Clear feedback state
}, [reset, fileState]);
```

Pass to ResultGrid:

```typescript
<ResultGrid
  status={status}
  analysis={analysis}
  candidates={candidates}
  results={results}
  scoreThreshold={scoreThreshold}
  error={error}
  onRetry={handleRetry}
  feedback={feedback}
  onFeedback={handleFeedback}
/>
```

**Design decisions:**

- **`Record<string, "up" | "down">` not `Map`:** Plain objects work with React's immutable state updates (`{ ...prev, [key]: value }`). Maps require extra ceremony (`new Map(prev).set(key, value)`) and don't participate in React's shallow comparison. A record is the idiomatic React choice for key-value state.

- **Optimistic update:** `setFeedback` is called before `fetch`. The UI updates instantly. The POST is fire-and-forget with `.catch(() => {})` to prevent unhandled promise rejection warnings. See assumption 2.4 for the rationale.

- **No API key header:** `POST /api/feedback` does not require `X-API-Key` (confirmed in `.ai/step-4-plan.md` section 2.3). The fetch call does not include the header.

- **`useCallback([], ...)`:** The handler has no dependencies — it uses the functional update form for `setFeedback` and constructs the request from its parameters. Stable reference prevents unnecessary re-renders of ResultGrid.

- **Reset in `handleNewSearch`:** `setFeedback({})` clears all ratings when the user starts a new search. Old ratings don't carry over to new results (different products, different search context).

- **Not reset in `handleRetry`:** Retry re-triggers the same search. If re-ranking produces different scored results (unlikely but possible with non-deterministic API), old feedback keys won't match new product IDs — they'll simply be absent from the lookup, showing no rating. No explicit reset needed.

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: Feedback buttons visible on scored results

1. Start dev server. Open `http://localhost:3000`. Enter a valid API key.
2. Upload a furniture image. Click "Search."
3. Wait for Phase 2 (scored results) to appear.
4. **Verify:** Each result card has thumbs up and thumbs down icons in a footer area below the card content.
5. **Verify:** Both buttons are in default (muted) state — no color highlighting.

### Test 2: No feedback buttons on Phase 1 candidates

1. Start a search. During the "Ranking results..." phase (Phase 1 candidates visible):
2. **Verify:** Candidate cards do NOT have thumbs up/down buttons.
3. **Verify:** After Phase 2 results replace candidates, buttons appear.

### Test 3: Click thumbs up — visual state change

1. On a scored result card, click the thumbs up button.
2. **Verify:** The thumbs up icon turns green (`text-emerald-600`).
3. **Verify:** Clicking the thumbs up button again causes no visual change (idempotent).
4. **Verify:** The thumbs down button remains in muted color.

### Test 4: Click thumbs down — visual state change

1. On a different result card, click the thumbs down button.
2. **Verify:** The thumbs down icon turns red (`text-destructive`).
3. **Verify:** Clicking again causes no visual change.
4. **Verify:** The thumbs up button remains in muted color.

### Test 5: Change rating — switch from up to down

1. On a card rated thumbs up, click the thumbs down button.
2. **Verify:** Thumbs up returns to muted. Thumbs down turns red.
3. Open DevTools Network tab. **Verify:** Two POST requests to `/api/feedback` — first with `"up"`, second with `"down"`.

### Test 6: Feedback persists during scroll

1. Rate several result cards with a mix of thumbs up and thumbs down.
2. Scroll up and down the page.
3. **Verify:** All ratings remain visually indicated after scrolling.

### Test 7: API request fires on click

1. Open DevTools Network tab. Filter to `/api/feedback`.
2. Click a thumbs up button on any result card.
3. **Verify:** POST request to `/api/feedback` with body `{ "productId": "<id>", "rating": "up" }`.
4. **Verify:** Response is `{ "success": true, "counts": { "up": N, "down": M } }`.

### Test 8: New search resets feedback state

1. Rate several result cards.
2. Click "New Search."
3. Upload a new image and search.
4. **Verify:** All result cards show default (unrated) button state — no leftover green/red.

### Test 9: Feedback survives Phase 2 re-render

1. This is inherent — Phase 2 results are the final render. No subsequent replacement.
2. **Verify:** After rating a card, the rating persists as long as the user stays on the results screen.

### Test 10: Error resilience — network failure

1. Rate a card. Disconnect network. Rate another card.
2. **Verify:** The UI still shows the rating change (optimistic update).
3. **Verify:** No error message or visible failure — feedback is silently best-effort.

### Test 11: Accessibility

1. Tab through result cards. Focus should reach the feedback buttons.
2. **Verify:** Screen reader announces "Rate as relevant" / "Rate as not relevant."
3. **Verify:** `aria-pressed` is `true` for the selected button, `false` for the other.

### Test 12: Build check

1. `npx tsc --noEmit` — no TypeScript errors.
2. `npx next lint` — no ESLint errors.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Thumbs up/down buttons visible on each scored result card (Phase 2) | Test 1 |
| 2 | No feedback buttons on Phase 1 candidate cards | Test 2 |
| 3 | Clicking thumbs up changes icon to green (`text-emerald-600`) | Test 3 |
| 4 | Clicking thumbs down changes icon to red (`text-destructive`) | Test 4 |
| 5 | Clicking the already-selected button is idempotent (no visual change) | Tests 3, 4 |
| 6 | Clicking the other button changes the rating (visual + API) | Test 5 |
| 7 | POST /api/feedback fires on click with correct `{ productId, rating }` body | Test 7 |
| 8 | Feedback state resets on "New Search" | Test 8 |
| 9 | Ratings persist during scroll (no re-render loss) | Test 6 |
| 10 | Optimistic update — visual change is instant (no loading spinner) | Test 3 — immediate color change |
| 11 | Network failure does not cause visible errors | Test 10 |
| 12 | `aria-pressed` and `aria-label` on feedback buttons | Test 11 |
| 13 | `lib/feedback-store.ts` uses `globalThis` pattern | Code review — matches `config-store.ts` pattern |
| 14 | `tsc --noEmit` clean | Test 12 |
| 15 | `next lint` clean | Test 12 |

---

## 7. Out of Scope for Step 9

These items are deliberately deferred to later steps or are out of MVP scope:

- **Feedback persistence to file/database** — Explicitly out of scope per PRD section 4. In-memory, lost on restart.
- **Feedback dashboard / metrics display** — US-023 is satisfied by the API response including counts. Displaying in admin panel would be Step 10 if desired.
- **Feedback aggregation in admin panel** — Step 10 territory.
- **Error boundaries** — Step 10. Unhandled rendering errors show the default Next.js error page.
- **Animations / transitions** — Step 10 polish. Button state changes are instant (CSS class swap).
- **Toast notifications on feedback** — Overkill for a thumbs up/down action. Visual state change on the button is sufficient.
- **Undo feedback** — Backend schema doesn't support "remove" (only "up" or "down"). No toggle-off.
- **Feedback counts displayed per card** — e.g., "3 people found this helpful." Out of scope — there is no multi-user context (single user, in-memory store).
- **Dark mode** — Not in MVP scope. `text-emerald-600` may need a `dark:` variant when dark mode is added.
