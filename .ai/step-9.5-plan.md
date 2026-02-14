# Step 9.5 — Product Detail Dialog

## 1. Overview

Step 9.5 adds a detail dialog to result cards. Currently, product cards truncate the title (`line-clamp-1`) and description (`line-clamp-2`) for grid consistency. Users cannot see full product information — this makes it difficult to evaluate search quality, which is the project's core success metric.

**Solution:** Clicking a result card opens a shadcn Dialog (modal) showing the full, untruncated product details: title, description, category, type, price, dimensions, score, and AI justification.

The work has three parts:

1. **Install shadcn Dialog** — `npx shadcn@latest add dialog` (not currently in `components/ui/`).
2. **Wrap ResultCard in Dialog** — each card becomes a `DialogTrigger`. Clicking the card opens a `DialogContent` with full product details. Radix manages open/close state internally (uncontrolled).
3. **Isolate feedback buttons** — add `stopPropagation` on `onClick` and `onKeyDown` to prevent feedback button interactions from opening the dialog.

After Step 9.5, a user can: perform a search → see scored results in a compact grid → click any card → view full product details in a modal → close the modal (Escape, overlay click, or X button) → rate results with thumbs up/down (unchanged behavior).

**Only one file is modified:** `components/result-card.tsx`. No changes to `result-grid.tsx`, `search-page.tsx`, or `use-search.ts`. No new custom components.

---

## 2. Assumptions

### 2.1 Trigger: Entire Card Clickable via `DialogTrigger asChild`

**Decision:** Wrap the entire `Card` element with `DialogTrigger asChild`. Clicking anywhere on the card opens the dialog. Feedback buttons use `stopPropagation` to prevent the click from reaching the card trigger.

| Approach | Pros | Cons |
|---|---|---|
| **Whole card clickable (chosen)** | Large click target — discoverable UX. Standard pattern (e.g., Airbnb, Amazon cards). No additional UI elements needed. `DialogTrigger asChild` adds no wrapper DOM element — grid layout unaffected. | Requires `stopPropagation` on feedback buttons (both `onClick` and `onKeyDown`) to prevent conflict. |
| **Dedicated "Details" button** | No event conflict — button is a separate click target. Explicit intent. | Adds visual clutter to an already dense card (title, description, price, dimensions, score, justification, feedback buttons). Small click target. |
| **Title as clickable link** | Clean — only the title opens details. No conflict with feedback buttons. | Small click target. Misleading affordance — looks like a navigation link, but opens a modal. Users might not discover it. |
| **CardHeader + CardContent clickable, CardFooter excluded** | No stopPropagation needed — footer is naturally excluded. | Requires a wrapper `div` inside Card around CardHeader + CardContent, which breaks the Card's `flex flex-col gap-6` layout. The wrapper becomes a single flex child, collapsing the gap between header and content. Requires duplicating gap/spacing inside the wrapper. |

**Rationale:** The whole-card-clickable pattern is the industry standard for card-based UIs. The `stopPropagation` cost is 2 lines per feedback button — trivial. `DialogTrigger asChild` renders no extra DOM element (Radix's `Slot` pattern), so the grid layout is completely unaffected. The card gains `cursor-pointer` and a subtle `hover:shadow` elevation to signal interactivity.

### 2.2 Dialog Content: Full Product Details with Category and Type

**Decision:** The dialog shows all product fields untruncated, including `category` and `type` (not shown on cards).

| Content | On Card (truncated) | In Dialog (full) |
|---|---|---|
| Title | `line-clamp-1` | Full text |
| Description | `line-clamp-2` | Full text |
| Price | Shown | Shown |
| Dimensions | Shown | Shown |
| Category | **Not shown** | **Shown** |
| Type | **Not shown** | **Shown** |
| Score | Badge | Badge + low-relevance indicator |
| Justification | `line-clamp-2` (new) | Full text |

**Rationale:** The task description says "We will evaluate the quality and relevance of the matches" — full product details are critical for this evaluation. Category and type appear on every product document in MongoDB but are currently hidden from the user. Showing them in the dialog helps users understand *why* a product was matched (e.g., the image was classified as "Coffee Tables" → this product's type is "Coffee Tables"). The `DialogDescription` uses `{category} — {type}` which also satisfies the Radix accessibility requirement for `aria-describedby`.

**Justification truncation on card (new):** The justification paragraph on the card currently has no `line-clamp`, which causes inconsistent card heights. Adding `line-clamp-2` to the card's justification improves grid consistency. Full justification text is available in the dialog.

### 2.3 Dialog State: Uncontrolled (Radix-Managed) Per Card

**Decision:** Each `ResultCard` wraps itself in a Radix `Dialog` with no explicit open state. Radix manages open/close internally.

| Approach | Pros | Cons |
|---|---|---|
| **Uncontrolled per card (chosen)** | Zero state management — no `useState`, no prop threading. ResultCard stays hook-free (no `"use client"` needed). Self-contained — each card owns its dialog. No changes to ResultGrid or SearchPage. | N Dialog instances in React tree (6–12 cards). Negligible: Radix only mounts DialogContent when open (not force-mounted). |
| **Controlled `useState` in ResultCard** | Explicit state. | Requires `useState` hook — ResultCard becomes stateful. Still no prop threading (self-contained). Functionally identical to uncontrolled but with extra code. |
| **Controlled `selectedProduct` in ResultGrid** | Single Dialog instance. Efficient if there were hundreds of cards. | Requires new state + setter prop in ResultGrid. Prop threading: ResultGrid → ResultCard. One Dialog shared by all cards — must re-render DialogContent when selected product changes. Over-engineering for 6–12 cards. |
| **Controlled state in SearchPage** | Same as ResultGrid approach but even higher up. | Same cons, plus unnecessary coupling — SearchPage already manages 3 state values (fileState, prompt, feedback). Adding a 4th for a UI detail violates separation of concerns. |

**Rationale:** The uncontrolled pattern is Radix's default and recommended usage. It's the simplest option — zero new state, zero new props, zero new hooks. ResultCard remains a presentational component (no hooks, no `"use client"` directive). It works because each card's dialog is independent — there's no shared state between card dialogs.

**Performance note:** Radix Dialog does **not** force-mount DialogContent by default. When a card's dialog is closed, only the DialogTrigger (the Card) is in the DOM. DialogContent mounts on open and unmounts on close. With 6–12 cards, only 1 DialogContent is ever mounted at a time. No performance concern.

### 2.4 Feedback Buttons: Stay on Card Only, Not in Dialog

**Decision:** Feedback buttons (thumbs up/down) remain in the `CardFooter` on the card. They are not duplicated or moved to the dialog.

| Approach | Pros | Cons |
|---|---|---|
| **Card only (chosen)** | No duplication. Feedback state management unchanged. Dialog is read-only — clear separation between "browse details" and "rate result". | User must close dialog to rate. But rating is a quick action (one click) that doesn't require full details. |
| **Dialog only** | Rating happens in context of full details. | Feedback buttons disappear from the card grid — user must open each card to rate. Breaks the existing quick-rating flow. Regression from Step 9. |
| **Both card and dialog** | Maximum flexibility. | State sync complexity — both instances must reflect the same `currentRating`. Requires either lifting state or passing callbacks through Dialog. Over-engineering for a simple thumbs up/down. |

**Rationale:** The dialog's purpose is **viewing full details**, not **interacting with results**. Feedback is a quick, low-friction action — users scan the grid and click thumbs up/down without needing full context. If they want details, they open the dialog, read, close, then rate. This matches the existing flow and keeps the implementation simple.

### 2.5 Event Isolation: `stopPropagation` on Both `onClick` and `onKeyDown`

**Decision:** Feedback buttons in `CardFooter` call `e.stopPropagation()` on both `onClick` and `onKeyDown` to prevent interactions from bubbling to the Card's `DialogTrigger`.

| Concern | Without `stopPropagation` | With `stopPropagation` |
|---|---|---|
| **Mouse click on thumb** | Click bubbles to Card → dialog opens AND rating is recorded. Two unintended actions. | Click stops at button → only rating is recorded. Dialog stays closed. |
| **Enter/Space on focused thumb** | `keydown` event bubbles to Card. Radix's `DialogTrigger` listens for Enter/Space on the Card (because it's a `div[role="button"]`). Dialog opens AND rating fires. | `keydown` stops at button → only rating fires. Dialog stays closed. |

**Rationale:** `DialogTrigger asChild` merges an `onKeyDown` handler onto the Card to handle Enter/Space (since a `<div>` doesn't natively fire `click` on keyboard activation, unlike a `<button>`). When a feedback `<button>` inside the Card receives Enter/Space, the browser fires `keydown` which bubbles to the Card. Without `stopPropagation` on `onKeyDown`, Radix's handler would open the dialog. This is a real bug, not a theoretical concern. The fix is 1 additional prop per feedback button.

### 2.6 Card Visual Affordance: `cursor-pointer` + Hover Shadow

**Decision:** Add `cursor-pointer`, `hover:shadow`, and `transition-shadow` to the Card. Add `focus-visible:ring-3 focus-visible:ring-ring/50` for keyboard accessibility.

**Rationale:** The Card must signal that it's interactive. `cursor-pointer` is the minimal signal. `hover:shadow` provides a subtle elevation change (from `shadow-sm` to `shadow` — one step in Tailwind v4's shadow scale). `transition-shadow` smooths the transition. `focus-visible:ring-3` shows a visible focus ring for keyboard navigation (required since the Card now has `tabIndex={0}` and `role="button"`). `outline-none` removes the default browser outline in favor of the ring.

---

## 3. File Structure

```
New file (auto-generated by shadcn CLI):
  components/ui/dialog.tsx            — shadcn Dialog component (Radix-based)

Modified file:
  components/result-card.tsx          — Wrap in Dialog, add DialogContent, stopPropagation on feedback buttons, line-clamp-2 on justification, hover/focus styles

Unchanged files:
  components/result-grid.tsx          — Grid layout (unchanged — Dialog is self-contained in ResultCard)
  components/search-page.tsx          — Orchestrator (unchanged — no new state or props)
  hooks/use-search.ts                 — Search state machine (unchanged)
  lib/schemas/product.ts              — Product/ScoredProduct types (unchanged)
```

No new custom files.

---

## 4. Implementation Tasks

### 4.1 Install shadcn Dialog

**Command:** `npx shadcn@latest add dialog`

This creates `components/ui/dialog.tsx` with the following exports: `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogPortal`, `DialogTitle`, `DialogTrigger`.

The component is based on Radix UI's Dialog primitive. It includes:
- Portal rendering (DialogContent mounts in `document.body`)
- Overlay with backdrop blur
- Built-in close button (X icon in top-right corner of DialogContent)
- Focus trap (keyboard focus stays within the dialog when open)
- Escape to close
- `aria-labelledby` (linked to DialogTitle) and `aria-describedby` (linked to DialogDescription)

**Dependency:** `radix-ui` (already installed — shared with other Radix primitives used by shadcn components).

---

### 4.2 ResultCard: Add Dialog with Full Product Details

**File:** `components/result-card.tsx`

Full updated component:

```typescript
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <Dialog>
      <DialogTrigger asChild>
        <Card
          className={cn(
            "cursor-pointer transition-shadow hover:shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            lowRelevance && "opacity-60",
          )}
          role="button"
          tabIndex={0}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <CardTitle className="line-clamp-1">
                  {product.title}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {product.description}
                </CardDescription>
              </div>
              {scored && (
                <Badge
                  variant={scoreBadgeVariant(product.score, scoreThreshold)}
                >
                  {product.score}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-2">
            <p className="text-sm font-medium">
              {priceFormat.format(product.price)}
            </p>
            <p className="text-xs text-muted-foreground">
              {product.width} &times; {product.height} &times; {product.depth}{" "}
              cm
            </p>
            {scored && product.justification && (
              <p className="line-clamp-2 text-sm italic text-muted-foreground">
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
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(product._id, "up");
                }}
                onKeyDown={(e) => e.stopPropagation()}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(product._id, "down");
                }}
                onKeyDown={(e) => e.stopPropagation()}
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
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product.title}</DialogTitle>
          <DialogDescription>
            {product.category} &mdash; {product.type}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">{product.description}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Price</p>
              <p className="font-medium">
                {priceFormat.format(product.price)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Dimensions</p>
              <p className="font-medium">
                {product.width} &times; {product.height} &times;{" "}
                {product.depth} cm
              </p>
            </div>
          </div>
          {scored && (
            <>
              <div>
                <p className="text-muted-foreground text-sm">Match Score</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant={scoreBadgeVariant(
                      product.score,
                      scoreThreshold,
                    )}
                  >
                    {product.score}
                  </Badge>
                  {lowRelevance && (
                    <span className="text-xs text-destructive">
                      Low relevance
                    </span>
                  )}
                </div>
              </div>
              {product.justification && (
                <div>
                  <p className="text-muted-foreground text-sm">
                    AI Justification
                  </p>
                  <p className="mt-1 text-sm">{product.justification}</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** ResultCard remains hook-free. `Dialog`, `DialogTrigger`, `DialogContent` are Radix client components, but ResultCard is already rendered inside the `SearchPage` client component tree (`SearchPage` → `ResultGrid` → `ResultCard`). No directive needed. This follows the project convention: "No `'use client'` unless necessary."

- **`Dialog` wrapper:** Radix's `Dialog` is a pure React context provider — it renders **no DOM element**. The grid layout (`sm:grid-cols-2 lg:grid-cols-3`) sees only the `Card` div. No layout impact.

- **`DialogTrigger asChild`:** Renders the Card as-is via Radix's `Slot` pattern — no wrapper element. Merges `onClick`, `aria-haspopup="dialog"`, `aria-expanded`, and `data-state` onto the Card div.

- **`role="button"` + `tabIndex={0}` on Card:** The Card is a `<div>`, not a native `<button>`. These attributes make it keyboard-accessible and semantically correct. `DialogTrigger` adds `aria-haspopup="dialog"` automatically, but does not add `role` or `tabIndex` when using `asChild`. Screen readers announce: "Rate as relevant, button" → tab → "[card title], button, has popup dialog".

- **`DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg"`:** Constrains the modal height to 85% of viewport (scrollable if content is long) and width to `max-w-lg` (512px) on screens ≥640px. Below 640px, DialogContent uses its default full-width-minus-padding behavior.

- **`DialogDescription` with category/type:** Uses `{product.category} — {product.type}` (e.g., "Tables — Coffee Tables"). Serves dual purpose: (1) provides useful product classification context not shown on cards, (2) satisfies Radix's accessibility requirement for `aria-describedby` (Radix warns in console if DialogDescription is missing).

- **`line-clamp-2` on card justification (new):** Previously, the justification paragraph had no truncation, causing inconsistent card heights across the grid. Adding `line-clamp-2` ensures consistent card sizing. Full justification is now available in the dialog.

- **`cn()` import:** Required to combine `cursor-pointer`, `hover:shadow`, `transition-shadow`, `focus-visible:...` with the conditional `opacity-60` for low-relevance products. Imported from `@/lib/utils` (existing project utility).

- **`hover:shadow transition-shadow`:** The Card's default is `shadow-sm` (from `card.tsx`). On hover, `shadow` (Tailwind v4) provides a slightly larger shadow — one step up in the scale. `transition-shadow` smooths the change. Signals interactivity without being heavy-handed.

- **`focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`:** Replaces the browser default focus outline with a consistent ring (matching other interactive elements in the project). Only shows on keyboard navigation (`:focus-visible`), not on mouse click.

- **`stopPropagation` on feedback buttons — both `onClick` and `onKeyDown`:** See assumption 2.5 for the full rationale. `onClick` prevents mouse clicks from bubbling. `onKeyDown` prevents Enter/Space keyboard events from bubbling to the Card's Radix-injected `onKeyDown` handler, which would otherwise open the dialog.

- **Low-relevance in dialog:** The `opacity-60` class is on the Card (inside the trigger), not on the DialogContent (which is portaled to `document.body`). When a user opens a low-relevance product's dialog, it renders at full opacity. The dialog still shows the "Low relevance" indicator text next to the score badge for context.

- **Both scored and unscored cards are clickable:** During the "ranking" phase, Phase 1 candidate cards (unscored `Product`) also open a dialog. The dialog adapts: no score badge, no justification section, no "Match Score" / "AI Justification" labels. Only product details (title, description, category, type, price, dimensions) are shown. This is useful for previewing candidates before re-ranking completes.

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: Click card opens dialog

1. Start dev server. Enter a valid API key. Upload a furniture image. Wait for Phase 2 scored results.
2. Click anywhere on a result card (not on a feedback button).
3. **Verify:** A modal dialog opens with the product title in the header.
4. **Verify:** The dialog has a semi-transparent overlay behind it.
5. **Verify:** The dialog has a close button (X) in the top-right corner.

### Test 2: Dialog shows full untruncated content

1. Open a dialog for a product with a long title and description.
2. **Verify:** Title is fully visible (no `line-clamp`).
3. **Verify:** Description is fully visible (no `line-clamp`).
4. **Verify:** Justification is fully visible (no `line-clamp`).
5. Compare with the card: card title should be truncated with ellipsis, card description should be truncated, card justification should be truncated.

### Test 3: Dialog shows category, type, price, dimensions

1. Open a dialog.
2. **Verify:** Below the title, the dialog description shows "Category — Type" (e.g., "Tables — Coffee Tables").
3. **Verify:** Price is formatted as currency (e.g., "$459").
4. **Verify:** Dimensions show width × height × depth in cm.

### Test 4: Dialog shows score and justification for scored products

1. Open a dialog for a scored result (Phase 2).
2. **Verify:** "Match Score" label with a colored Badge showing the score number.
3. **Verify:** "AI Justification" label with the full justification text.
4. **Verify:** Low-relevance products show "Low relevance" text next to the score badge.

### Test 5: Feedback buttons do NOT open dialog

1. On a scored result card, click the thumbs up button.
2. **Verify:** The button turns green (feedback recorded) — dialog does NOT open.
3. Click the thumbs down button on the same card.
4. **Verify:** The button turns red — dialog does NOT open.
5. Now click on the card body (not on a feedback button).
6. **Verify:** Dialog opens.

### Test 6: Close dialog — Escape key

1. Open a dialog.
2. Press Escape.
3. **Verify:** Dialog closes. Card grid is visible again.

### Test 7: Close dialog — overlay click

1. Open a dialog.
2. Click the semi-transparent overlay outside the dialog content.
3. **Verify:** Dialog closes.

### Test 8: Close dialog — X button

1. Open a dialog.
2. Click the X close button in the top-right corner.
3. **Verify:** Dialog closes.

### Test 9: Keyboard navigation

1. Tab through result cards.
2. **Verify:** Cards receive visible focus (ring outline).
3. Press Enter or Space on a focused card.
4. **Verify:** Dialog opens.
5. Tab to a feedback button (not opening a dialog). Press Enter.
6. **Verify:** Feedback is recorded, dialog does NOT open.

### Test 10: Phase 1 candidates open dialog

1. Start a search. During the "Ranking results..." phase (Phase 1 candidates visible):
2. Click a candidate card.
3. **Verify:** Dialog opens showing title, description, category, type, price, dimensions.
4. **Verify:** No "Match Score" or "AI Justification" sections (product is not scored).

### Test 11: Low-relevance product in dialog

1. If score threshold is set such that some results are low-relevance:
2. **Verify:** The card shows `opacity-60` styling.
3. Click the card. **Verify:** Dialog opens at full opacity (no dimming).
4. **Verify:** "Low relevance" text appears next to the score badge inside the dialog.

### Test 12: Card grid consistency — justification truncation

1. View scored results where products have justifications of varying lengths.
2. **Verify:** On the cards, justification text is truncated to 2 lines (`line-clamp-2`).
3. Open a dialog. **Verify:** Full justification is visible.

### Test 13: Responsive — dialog on mobile

1. Open DevTools. Set viewport to 375px width.
2. Click a result card.
3. **Verify:** Dialog opens and is usable (scrollable if content overflows, X button accessible).
4. **Verify:** Dialog width fits the screen.

### Test 14: Build check

1. `npx tsc --noEmit` — no TypeScript errors.
2. `npx next lint` — no ESLint errors.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Clicking a result card opens a dialog with full product details | Test 1 |
| 2 | Dialog shows untruncated title, description, and justification | Test 2 |
| 3 | Dialog shows product category and type (not shown on cards) | Test 3 |
| 4 | Dialog shows price and dimensions | Test 3 |
| 5 | Dialog shows score badge and AI justification for scored products | Test 4 |
| 6 | Clicking feedback buttons does NOT open the dialog | Test 5 |
| 7 | Dialog closes via Escape, overlay click, or X button | Tests 6, 7, 8 |
| 8 | Cards are keyboard-accessible — focusable, Enter/Space opens dialog | Test 9 |
| 9 | Keyboard feedback buttons (Enter/Space) do NOT open dialog | Test 9 |
| 10 | Phase 1 candidates also open dialog (without score/justification) | Test 10 |
| 11 | Low-relevance products render at full opacity inside dialog | Test 11 |
| 12 | Card justification truncated to 2 lines (`line-clamp-2`) | Test 12 |
| 13 | Card has `cursor-pointer` and hover shadow effect | Visual — hover over card |
| 14 | Card has visible focus ring on keyboard navigation | Test 9 |
| 15 | `tsc --noEmit` clean | Test 14 |
| 16 | `next lint` clean | Test 14 |

---

## 7. Out of Scope for Step 9.5

These items are deliberately deferred or excluded:

- **Product images** — The MongoDB `products` collection has no image field. The dialog shows text-only product details.
- **Navigation to external product pages** — No external URLs in the database. Dialog is a self-contained modal.
- **Feedback buttons in dialog** — Feedback stays on cards only (see assumption 2.4).
- **Product comparison** — Out of MVP scope per PRD section 4.
- **Dark mode** — Not in MVP scope. `hover:shadow` and `focus-visible:ring-ring/50` use theme-aware tokens, but no explicit `dark:` variants are added.
- **Animations / transitions** — Dialog open/close uses Radix's default animation (built into shadcn DialogContent via `data-[state=open]:animate-in` / `data-[state=closed]:animate-out`). No custom animations.
- **Dialog for error/empty states** — Only result cards get dialogs. Alert messages (not-furniture, error, no results) remain as-is.
- **Shared dialog instance** — Each card has its own Dialog. No optimization to share a single DialogContent across cards (unnecessary for 6–12 cards).
