# Step 8 — Admin Panel

## 1. Overview

Step 8 builds the admin panel UI — the `/admin` page where administrators configure search parameters, edit AI system prompts, and view the product taxonomy. It replaces the current placeholder `app/admin/page.tsx` with a fully interactive configuration interface.

The work has five parts:

1. **Server Component page** — `app/admin/page.tsx` becomes an `async` Server Component that fetches the current config (from `lib/config-store`) and taxonomy (from `lib/taxonomy`) and passes them as props to the Client Component. This eliminates the need for `useEffect` data fetching and avoids initial loading spinners.
2. **Admin panel orchestrator** — `components/admin-panel.tsx` is the Client Component that owns form state, dirty tracking, save logic, and composes the child components.
3. **Prompt editor** — `components/prompt-editor.tsx` is a reusable presentational component rendering a labeled `Textarea` for system prompt editing. Used twice (image analysis + re-ranking).
4. **Config controls** — `components/config-controls.tsx` renders three labeled sliders for numeric parameters (results count, max candidates, score threshold).
5. **Taxonomy display** — `components/taxonomy-display.tsx` renders the 15 categories with their types in an expandable list using native `<details>`/`<summary>` elements.

This step also installs one new shadcn/ui component (`slider`) for the numeric parameter controls.

After Step 8, an administrator can: navigate to `/admin` → see current prompts and parameters → edit any field → see Save button enable → click Save → see confirmation → navigate to search → verify changes take effect.

---

## 2. Assumptions

### 2.1 Data Fetching: Server Component with Props

**Decision:** Make `app/admin/page.tsx` an async Server Component that calls `getConfig()` and `getTaxonomy()` directly, passing results as props to the Client Component.

| Approach | Pros | Cons |
|---|---|---|
| **Server Component with props (chosen)** | No `useEffect` + `setState` (avoids React 19 ESLint friction). No loading spinner for initial data. Fresh data on every navigation (client-side nav triggers server render). Consistent with Next.js App Router patterns. | Initial data may become stale if user stays on page long without navigating. |
| **Client-side `useEffect` fetch** | Data fetching is explicit, familiar pattern. Component is self-contained. | Requires loading spinner. `setState` in `useEffect` body triggers `react-hooks/set-state-in-effect` lint concerns. Extra HTTP round-trip (fetch to own API route). |
| **SWR / React Query** | Auto-revalidation, deduplication, cache. | New dependency for a single admin page. Over-engineering for config that changes only on explicit save. |

**Rationale:** The admin endpoints don't require authentication (US-022). `getConfig()` is synchronous (reads module-level state). `getTaxonomy()` is async but cached (5-min TTL). Both can be called directly from a Server Component — no HTTP round-trip needed. When the user navigates to `/admin` via `<Link>`, Next.js renders the Server Component server-side and sends the RSC payload with fresh data.

**Taxonomy error handling:** If `getTaxonomy()` throws (MongoDB unavailable), the Server Component catches the error and passes an empty array. The admin panel still renders with config editing, but shows a "Taxonomy unavailable" message instead of the category list.

**Staleness after save:** After saving config, the client updates local form state from the PUT response. If the user navigates away and back, the Server Component re-renders with the updated module-level config. No staleness issue.

### 2.2 Form State Management: Single `useState` Object

**Decision:** Use a single `useState<AdminConfig>` for the form, plus a separate `useState<AdminConfig>` for the last-saved server values (dirty tracking baseline).

| Approach | Pros | Cons |
|---|---|---|
| **Single `useState<AdminConfig>` (chosen)** | One state update per field change. Dirty tracking via shallow comparison against server values. Easy to serialize for PUT request. No extra dependencies. | All fields re-render on any field change (negligible cost for 5 fields). |
| **Separate `useState` per field** | Fine-grained control. Familiar pattern (matches `api-key-form.tsx`). | 5 state variables + 5 setters = 10 exports. Coordinating reset/discard across 5 independent variables is error-prone. Dirty tracking requires comparing all 5 individually. |
| **`useReducer`** | Explicit state transitions. Good for complex state machines (like `useSearch`). | Overkill for a flat form with no state machine semantics. Actions would be trivial `SET_FIELD` dispatches. |
| **react-hook-form** | Built-in dirty tracking, validation, error handling. | New dependency for 5 fields. Registration boilerplate. Learning curve. The admin form has no complex validation rules beyond Zod (prompts non-empty, numbers already constrained by sliders). |

**Rationale:** The admin config is a flat object with 5 fields (2 strings, 3 numbers). No nested structures, no arrays, no conditional fields. `useState` with a single object is the simplest correct approach. Dirty tracking compares `formValues` to `serverValues` field by field. The `updateField` helper uses the functional update form for a stable callback reference.

### 2.3 Numeric Controls: shadcn Slider

**Decision:** Install shadcn `slider` component. Each numeric parameter gets a labeled slider with the current value displayed alongside.

| Approach | Pros | Cons |
|---|---|---|
| **shadcn Slider (chosen)** | Visual range feedback. Inherently constrained to valid range. Keyboard accessible (arrow keys, Home/End). Consistent with shadcn design system. `tabular-nums` for value display. | New component install (one Radix dependency). |
| **`<input type="number">`** | No new dependency. Precise entry. | Hard to style consistently across browsers. Spinner buttons are small/awkward. No visual range indicator. User can type out-of-range values (must validate). |
| **Slider + Input combo** | Best of both: visual range + precise entry. | Two controls per parameter. Over-engineering for admin tool. More complex state synchronization. |

**Rationale:** Sliders are the ideal control for bounded numeric ranges. The admin has three parameters with clear ranges (3–12, 10–100, 0–100). Sliders make the range visible and prevent out-of-range values entirely — no validation needed for numbers. The shadcn Slider uses Radix under the hood, providing full keyboard accessibility and ARIA semantics. The value is displayed as text next to the label for precise readability.

**Step values:**
- `resultsCount` (3–12): step `1` — 10 discrete positions
- `maxCandidates` (10–100): step `5` — 19 positions, fine granularity without overwhelming
- `scoreThreshold` (0–100): step `1` — full precision for threshold tuning

### 2.4 Prompt Editors: shadcn Textarea with Monospace Font

**Decision:** Use the already-installed shadcn `Textarea` component with `rows={10}`, monospace font, and vertical resize enabled.

| Approach | Pros | Cons |
|---|---|---|
| **shadcn Textarea (chosen)** | Already installed. `rows={10}` gives ~800 chars visible. Monospace font makes template variables (`{{taxonomy}}`, `{{resultsCount}}`) easy to read. `resize-y` allows manual vertical resize. | No auto-grow. Fixed initial height might be too tall for short prompts or too short for long ones. |
| **Auto-growing textarea** (`field-sizing: content` CSS) | Grows to fit content automatically. No wasted vertical space. | Limited browser support (Chrome 123+, no Firefox/Safari as of early 2025). Inconsistent behavior. |
| **Code editor** (Monaco, CodeMirror) | Syntax highlighting, line numbers, undo/redo stack. | Massive dependency for a plain text prompt. Over-engineering. Load time. |

**Rationale:** The prompts are plain text with occasional template variables (3–4 per prompt). Monospace font (`font-mono`) makes these stand out naturally without syntax highlighting. `rows={10}` provides comfortable editing space for the typical 500–1500 character prompts. The browser's native resize handle (enabled with `resize-y`) lets users expand the textarea if needed.

**No "Reset to Default" button:** The server doesn't expose an endpoint to retrieve default prompts. Adding one would require backend changes (out of scope for Step 8). The user can restart the server to reset all config to defaults. Acceptable for MVP.

### 2.5 Taxonomy Display: Native `<details>`/`<summary>`

**Decision:** Use native HTML `<details>`/`<summary>` elements styled with Tailwind. All categories collapsed by default.

| Approach | Pros | Cons |
|---|---|---|
| **Native `<details>` (chosen)** | Zero dependencies. Semantic HTML. Browser-native expand/collapse. Multiple items can be open simultaneously. ARIA `role="group"` and expanded state handled natively. `group-open:` Tailwind variant for styling. | No smooth height animation (instant show/hide). No single-open enforcement. |
| **shadcn Accordion** | Animated expand/collapse. Single-open mode (`type="single"`). Consistent shadcn styling. | New dependency (`@radix-ui/react-accordion`). Animation is unnecessary for a read-only reference list. Single-open mode would be annoying — the user may want to compare categories. |
| **shadcn Collapsible** | Animated expand/collapse for individual sections. | Designed for single sections, not lists. Would need 15 independent instances with 15 state variables. |

**Rationale:** The taxonomy display is a read-only reference list — 15 categories, each with 3–5 types. The user scans it to understand the data, not to interact with it frequently. Native `<details>` provides the right semantics without animation overhead. The `group` + `group-open:rotate-90` pattern on a chevron icon gives visual expand/collapse feedback. Multiple items can be open for comparison (useful when tuning prompts to reference specific categories).

### 2.6 Page Layout: Single Scroll Page, No Tabs

**Decision:** Three sections stacked vertically with scroll: System Prompts, Search Parameters (with Save button), Product Taxonomy. No tabs or separate views.

| Approach | Pros | Cons |
|---|---|---|
| **Single scroll page (chosen)** | All content visible by scrolling. No hidden content. Easy to scan. Simple implementation. | Long page (~900px content height). Save button may not be visible when editing top prompts. |
| **Tabs** (Prompts / Parameters / Taxonomy) | Each section gets dedicated screen space. No scrolling. Clear separation. | Hides content behind clicks. User can't see prompts and parameters simultaneously. Extra component dependency. Over-engineering for 3 small sections. |

**Rationale:** The admin page has ~900px of content: two textareas (2 × ~300px) + three sliders (~200px) + taxonomy list (~variable). On a 1080p screen with the header, this is 1–1.5 scrolls. On a 1440p screen, most content is visible without scrolling. The admin panel is a back-office tool used occasionally — simplicity and full visibility outweigh the minor scrolling.

**Save button placement:** Below the config controls section, above the taxonomy section. This is the natural boundary between editable and read-only content. The Save button is at most one scroll down from the prompt editors — acceptable for MVP. Not sticky (adds layout complexity for minimal gain).

### 2.7 Save Strategy: Single Save Button for All Config Fields

**Decision:** One "Save Configuration" button that sends all current form values to `PUT /api/admin/config`. The endpoint accepts partial updates, but sending the full config is simpler and equally correct.

| Approach | Pros | Cons |
|---|---|---|
| **Single Save for all fields (chosen)** | Simple mental model. One button, one action. Partial update API handles it correctly (merge `{ ...config, ...fullUpdate }`). Dirty tracking enables the button when any field changes. | User can't save just one section independently. But this is a non-issue — they can change any subset and save. |
| **Per-section Save buttons** | More granular control. Aligns with "partial update" API semantics. | Three save buttons, three loading states, three success messages. Confusing UX. Over-engineering for 5 fields. |
| **Auto-save on change** (debounced) | No save button needed. Instant apply. | Unclear when changes are actually saved. Network errors are hard to surface. Accidental keystrokes save immediately. Not appropriate for system prompts that affect production behavior. |

**Rationale:** The admin config has 5 fields. Saving all at once is the simplest UX. The PUT endpoint performs `{ ...config, ...updates }` — sending unchanged fields produces the same result as sending only changed fields. A "Discard Changes" button (visible only when dirty) lets the user revert without navigating away.

### 2.8 Save Feedback: Inline Text Messages

**Decision:** Show success/error messages as inline `<p>` text next to the Save button. Success messages auto-clear after 3 seconds.

| Approach | Pros | Cons |
|---|---|---|
| **Inline text (chosen)** | Adjacent to the action (Save button). No extra component. Success auto-clears (no manual dismiss). Error persists until next action. | Less visually prominent than toast or alert. |
| **Toast notifications** | Non-intrusive, standard pattern. | Requires toast provider setup (new component infrastructure). Toasts disappear — error messages should persist. Over-engineering for one form. |
| **shadcn Alert** | Prominent, structured (icon + title + description). | Overkill for a one-line save confirmation. Takes significant vertical space. Must be manually dismissed or auto-cleared. |

**Rationale:** A single save action produces a single outcome — "saved" or "failed: reason." Inline text next to the button provides immediate, contextual feedback without additional infrastructure. Success auto-clears after 3 seconds (using `setTimeout` in the event handler, not in `useEffect`). Error messages persist until the user takes another action (save again or discard).

### 2.9 No Custom Hook

**Decision:** Manage all form state directly in the `AdminPanel` component. No `useAdminConfig` hook.

| Approach | Pros | Cons |
|---|---|---|
| **Inline state in component (chosen)** | Simple. All form logic is collocated with the UI. No indirection. Consistent with `api-key-form.tsx` pattern. | Component is ~150 lines including JSX. Acceptable for an orchestrator. |
| **Custom `useAdminConfig` hook** | Separates data logic from UI. Follows `useSearch` pattern. | The admin config lifecycle is trivially simple (no streaming, no abort, no state machine). Extracting a hook adds a file and indirection without meaningful benefit. Would be tightly coupled to admin (not reusable elsewhere). |

**Rationale:** `useSearch` justifies a custom hook because it manages a complex multi-phase state machine with NDJSON streaming and abort logic. The admin form has: initial values from props + `useState` + one fetch call on save. This is closer to `api-key-form.tsx` in complexity than to `useSearch`. Keeping the logic inline makes the component self-contained and easy to understand.

### 2.10 No Client-Side Zod Validation

**Decision:** Validate prompts non-empty manually before save. Numeric fields cannot be invalid because sliders constrain them to valid ranges. No Zod import on the client.

| Approach | Pros | Cons |
|---|---|---|
| **Manual prompt check + slider constraints (chosen)** | No Zod in client bundle. Sliders make invalid numbers impossible. Simple `trim() !== ""` check for prompts. Server validates fully as authority. | Two validation layers (manual client + Zod server) could drift. Mitigated by: sliders enforce the same ranges as the schema. |
| **Client-side Zod validation** | Consistent with server validation. Catches all invalid states before network round-trip. | Imports Zod into client bundle (~13KB gzipped). Precedent in Step 7: "No Zod validation on client — would add bundle size for marginal benefit." |

**Rationale:** The sliders' `min`, `max`, and `step` props mirror the Zod schema constraints exactly (e.g., `resultsCount: z.number().int().min(3).max(12)` → `<Slider min={3} max={12} step={1}>`). The only client-side validation needed is checking that prompts are non-empty — a one-line check. The server remains the authority via `AdminConfigSchema.partial().safeParse()`.

### 2.11 Unsaved Changes on Navigation

**Decision:** No "unsaved changes" warning when navigating away. Form state is lost on navigation — the user returns to fresh server values.

**Rationale:** The admin panel is a low-frequency tool. The cost of re-entering changes is minimal (edit a prompt and click Save). Implementing `beforeunload` or a client-side navigation guard adds complexity with marginal UX value. When the user navigates back to `/admin`, the Server Component re-renders with the current server config, which is always correct.

---

## 3. File Structure

```
New files:
  components/admin-panel.tsx         — Client Component orchestrator: form state, save, composition
  components/prompt-editor.tsx       — Presentational: labeled Textarea for prompt editing (used 2x)
  components/config-controls.tsx     — Presentational: three labeled Sliders for numeric params
  components/taxonomy-display.tsx    — Presentational: expandable category/type list (<details>)

Auto-generated by shadcn CLI (do not write manually):
  components/ui/slider.tsx           — shadcn Slider component

Modified files:
  app/admin/page.tsx                 — Replace placeholder with async Server Component

Existing files (unchanged):
  app/layout.tsx                     — Root layout (composition unchanged)
  app/api/admin/config/route.ts      — GET + PUT config (backend unchanged)
  app/api/admin/taxonomy/route.ts    — GET taxonomy (backend unchanged)
  lib/config-store.ts                — getConfig, updateConfig (unchanged)
  lib/taxonomy.ts                    — getTaxonomy (unchanged)
  lib/schemas/admin.ts               — AdminConfigSchema (unchanged)
  lib/schemas/taxonomy.ts            — TaxonomyCategorySchema (unchanged)
  components/api-key-provider.tsx    — API key context (unchanged)
  components/header.tsx              — Header with active /admin link (unchanged)
```

---

## 4. Implementation Tasks

### 4.0 Install shadcn Slider

**Command:** `npx shadcn@latest add slider`

This installs the slider component into `components/ui/`. The CLI reads `components.json` for style (new-york), aliases (`@/components/ui`), and CSS config (`app/globals.css`). Adds `@radix-ui/react-slider` as a runtime dependency.

**Expected output:** One new file:
- `components/ui/slider.tsx` — Slider with `value`, `onValueChange`, `min`, `max`, `step` props. Uses array values (`number[]`) for multi-thumb support; single-value sliders use `[value]`.

No manual edits to this file. It is maintained by shadcn CLI.

---

### 4.1 Admin Page (Server Component)

**File:** `app/admin/page.tsx`

Replaces the placeholder with an async Server Component that fetches initial data and passes it to the Client Component.

```typescript
import { getConfig } from "@/lib/config-store";
import { getTaxonomy } from "@/lib/taxonomy";
import { AdminPanel } from "@/components/admin-panel";
import type { TaxonomyCategory } from "@/lib/schemas";

export default async function AdminPage() {
  const config = getConfig();

  let taxonomy: TaxonomyCategory[] = [];
  try {
    taxonomy = await getTaxonomy();
  } catch {
    // MongoDB unavailable — render without taxonomy
  }

  return <AdminPanel initialConfig={config} taxonomy={taxonomy} />;
}
```

**Design decisions:**

- **No `"use client"` directive:** This is a Server Component. It imports server-side modules (`getConfig`, `getTaxonomy`) directly. No hooks, no browser APIs. The `AdminPanel` child is the client/server boundary.

- **`getConfig()` called synchronously:** `getConfig()` returns a shallow copy of module-level state. It cannot fail. It runs during server rendering and provides the current config without an HTTP round-trip.

- **`getTaxonomy()` with error handling:** `getTaxonomy()` connects to MongoDB (async). If the database is unavailable, the error is caught and an empty taxonomy array is passed to the Client Component. The admin panel renders normally with config editing; the taxonomy section shows a "Taxonomy unavailable" message. This satisfies the graceful degradation principle without blocking the entire page.

- **No `getConfig` wrapped in `Promise.resolve()`:** It's synchronous and returns instantly. No need to parallelize with `getTaxonomy()`.

- **Fresh data on every navigation:** When the user clicks the "Admin" link in the header (client-side navigation), Next.js renders this Server Component server-side, fetching current values. After a save + navigate away + navigate back, the page reflects the saved config.

---

### 4.2 Admin Panel (Client Component Orchestrator)

**File:** `components/admin-panel.tsx`

The main Client Component that owns form state, dirty tracking, save logic, and composes the child components. Follows the orchestrator pattern from `search-page.tsx`.

```typescript
"use client";

import { useState, useCallback } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptEditor } from "@/components/prompt-editor";
import { ConfigControls } from "@/components/config-controls";
import { TaxonomyDisplay } from "@/components/taxonomy-display";
import type { AdminConfig, TaxonomyCategory } from "@/lib/schemas";

interface AdminPanelProps {
  initialConfig: AdminConfig;
  taxonomy: TaxonomyCategory[];
}

export function AdminPanel({ initialConfig, taxonomy }: AdminPanelProps) {
  const [formValues, setFormValues] = useState<AdminConfig>(initialConfig);
  const [serverValues, setServerValues] = useState<AdminConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isDirty =
    formValues.imageAnalysisPrompt !== serverValues.imageAnalysisPrompt ||
    formValues.rerankingPrompt !== serverValues.rerankingPrompt ||
    formValues.resultsCount !== serverValues.resultsCount ||
    formValues.maxCandidates !== serverValues.maxCandidates ||
    formValues.scoreThreshold !== serverValues.scoreThreshold;

  const isValid =
    formValues.imageAnalysisPrompt.trim() !== "" &&
    formValues.rerankingPrompt.trim() !== "";

  const updateField = useCallback(
    (field: keyof AdminConfig, value: string | number) => {
      setFormValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isValid) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveMessage({
          type: "error",
          text: data.error ?? "Failed to save configuration",
        });
        return;
      }

      // Update baseline from server response (server may transform values)
      setServerValues(data);
      setFormValues(data);
      setSaveMessage({ type: "success", text: "Configuration saved" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [formValues, isValid]);

  const handleDiscard = useCallback(() => {
    setFormValues(serverValues);
    setSaveMessage(null);
  }, [serverValues]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">
          Configure search parameters and system prompts.
        </p>
      </div>

      {/* System Prompts */}
      <section className="space-y-6">
        <h2 className="text-lg font-medium">System Prompts</h2>
        <PromptEditor
          id="image-analysis-prompt"
          label="Image Analysis Prompt"
          description="Sent to Claude when analyzing uploaded images. Supports {{taxonomy}} template variable."
          value={formValues.imageAnalysisPrompt}
          onChange={(v) => updateField("imageAnalysisPrompt", v)}
          disabled={isSaving}
        />
        <PromptEditor
          id="reranking-prompt"
          label="Re-ranking Prompt"
          description="Sent to Claude when ranking candidates. Supports {{resultsCount}} and {{#userPrompt}}...{{/userPrompt}} template variables."
          value={formValues.rerankingPrompt}
          onChange={(v) => updateField("rerankingPrompt", v)}
          disabled={isSaving}
        />
      </section>

      {/* Search Parameters */}
      <section className="space-y-6">
        <h2 className="text-lg font-medium">Search Parameters</h2>
        <ConfigControls
          resultsCount={formValues.resultsCount}
          maxCandidates={formValues.maxCandidates}
          scoreThreshold={formValues.scoreThreshold}
          onValueChange={updateField}
          disabled={isSaving}
        />
      </section>

      {/* Save / Discard */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!isDirty || !isValid || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save Configuration"
          )}
        </Button>
        {isDirty && !isSaving && (
          <Button variant="outline" onClick={handleDiscard}>
            Discard Changes
          </Button>
        )}
        {saveMessage && (
          <p
            className={`text-sm font-medium ${
              saveMessage.type === "success"
                ? "text-emerald-600"
                : "text-destructive"
            }`}
          >
            {saveMessage.text}
          </p>
        )}
      </div>

      {/* Product Taxonomy */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Product Taxonomy</h2>
          <p className="text-sm text-muted-foreground">
            Categories and types available in the product catalog (read-only).
          </p>
        </div>
        <TaxonomyDisplay taxonomy={taxonomy} />
      </section>
    </div>
  );
}
```

**Design decisions:**

- **`"use client"` directive:** Required because the component uses `useState` and `useCallback`. This is the client/server boundary — the Server Component page passes props across this boundary.

- **Two `useState<AdminConfig>`:** `formValues` holds the current form state (user edits). `serverValues` holds the last-saved state (from initial props or last successful save). Dirty tracking compares them field by field. On successful save, both are updated from the server response.

- **`updateField` with `useCallback([], ...)`:** The functional update form (`setFormValues(prev => ...)`) makes the callback stable (no dependencies on `formValues`). This prevents unnecessary re-renders of child components that receive `updateField` or callbacks derived from it.

- **`handleSave` sends full `formValues`:** The PUT endpoint uses `AdminConfigSchema.partial().safeParse()`, which validates all present fields. Sending the full config is simpler than computing a diff and equally correct — merging `{ ...config, ...fullConfig }` produces the same result as `{ ...config, ...partialChanges }`.

- **Server response updates both states:** `setServerValues(data); setFormValues(data);` ensures the form reflects whatever the server accepted. If the server transforms values (e.g., trims whitespace), the form shows the canonical result. This also resets `isDirty` to `false` after save.

- **`setTimeout` for success auto-clear:** Called inside the event handler (not in `useEffect`). The 3-second timeout sets `saveMessage` to `null`. If the component unmounts before the timeout fires, the state update is a no-op (React 18+ does not warn about this).

- **Discard button visibility:** Only shown when `isDirty && !isSaving`. Resets `formValues` to `serverValues` and clears any save message.

- **Save button disabled states:** Disabled when `!isDirty` (nothing to save), `!isValid` (empty prompt), or `isSaving` (request in flight). This prevents no-op saves and invalid submissions.

- **`text-emerald-600` for success:** A conventional green that works in light mode. The project does not have dark mode configured, so no `dark:` variant needed. `text-destructive` for errors follows the existing pattern (`api-key-form.tsx`, `result-grid.tsx`).

- **Heading hierarchy:** `<h1>` for page title (consistent with `search-page.tsx`), `<h2>` for section headings (System Prompts, Search Parameters, Product Taxonomy).

- **`space-y-8` root spacing:** Generous spacing between sections. Matches the comfortable admin tool aesthetic. Each section uses `space-y-6` internally.

---

### 4.3 Prompt Editor

**File:** `components/prompt-editor.tsx`

A reusable presentational component for editing a system prompt. Used twice — once for the image analysis prompt, once for the re-ranking prompt.

```typescript
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PromptEditorProps {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PromptEditor({
  id,
  label,
  description,
  value,
  onChange,
  disabled,
}: PromptEditorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="font-mono text-sm"
        disabled={disabled}
      />
    </div>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** No hooks, no event handlers beyond the inline `onChange`. Pure presentational component. It will be client-rendered because its parent (`AdminPanel`) is a Client Component, but the directive is unnecessary.

- **`font-mono text-sm` on Textarea:** Monospace font makes template variables (`{{taxonomy}}`, `{{resultsCount}}`, `{{#userPrompt}}...{{/userPrompt}}`) visually distinct from natural language. `text-sm` keeps the font readable without taking excessive space.

- **`rows={10}`:** Provides ~800 visible characters at ~80 chars per line. The typical prompt is 500–1500 characters. The textarea is natively resizable (browser default resize handle). Adding `resize-y` explicitly is unnecessary — shadcn Textarea preserves the default browser resize behavior.

- **`Label` with `htmlFor`:** Clicking the label focuses the textarea. Required for accessibility.

- **`description` as `<p>` below label:** Explains what the prompt is used for and which template variables are available. Not connected via `aria-describedby` (the prompt is not a validated field — there are no error states at the field level; empty prompts are caught by the Save button's disabled state).

- **No character counter:** Unlike the search prompt textarea (max 500 chars), system prompts have no practical length limit (the Zod schema only requires `min(1)`). A counter would add noise without value.

---

### 4.4 Config Controls

**File:** `components/config-controls.tsx`

Renders three labeled sliders for the numeric admin parameters. Each slider has a label, current value display, description, and range constraints.

```typescript
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { AdminConfig } from "@/lib/schemas";

type NumericField = "resultsCount" | "maxCandidates" | "scoreThreshold";

interface ConfigControlsProps {
  resultsCount: number;
  maxCandidates: number;
  scoreThreshold: number;
  onValueChange: (field: keyof AdminConfig, value: number) => void;
  disabled?: boolean;
}

const CONTROLS: {
  field: NumericField;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    field: "resultsCount",
    label: "Number of displayed results",
    description: "How many top results to show after re-ranking (3–12)",
    min: 3,
    max: 12,
    step: 1,
  },
  {
    field: "maxCandidates",
    label: "Maximum candidates for re-ranking",
    description:
      "Products retrieved from MongoDB before Claude re-ranks them (10–100). Higher values improve result quality but increase latency and API cost.",
    min: 10,
    max: 100,
    step: 5,
  },
  {
    field: "scoreThreshold",
    label: "Score threshold",
    description:
      "Results below this score are marked as low-relevance (0–100). Set to 0 to disable.",
    min: 0,
    max: 100,
    step: 1,
  },
];

export function ConfigControls({
  resultsCount,
  maxCandidates,
  scoreThreshold,
  onValueChange,
  disabled,
}: ConfigControlsProps) {
  const values: Record<NumericField, number> = {
    resultsCount,
    maxCandidates,
    scoreThreshold,
  };

  return (
    <div className="space-y-6">
      {CONTROLS.map((control) => (
        <div key={control.field} className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{control.label}</Label>
            <span className="text-sm font-medium tabular-nums w-8 text-right">
              {values[control.field]}
            </span>
          </div>
          <Slider
            value={[values[control.field]]}
            onValueChange={([v]) => onValueChange(control.field, v)}
            min={control.min}
            max={control.max}
            step={control.step}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {control.description}
          </p>
        </div>
      ))}
    </div>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** No hooks. The `onValueChange` callback is passed from the parent. Pure presentational component.

- **`CONTROLS` array:** Data-driven rendering of three sliders. Each entry defines the field name, display label, help text, and range constraints. Avoids repeating the same slider layout three times. Easy to add new numeric parameters if needed.

- **`Slider value={[values[control.field]]}`:** shadcn/Radix Slider uses `number[]` (supports multi-thumb). For a single-value slider, wrap in an array. The `onValueChange` callback destructures `([v])` to get the scalar value.

- **`tabular-nums w-8 text-right`:** The value display uses `tabular-nums` for consistent digit widths (e.g., `6` and `12` occupy the same horizontal space). `w-8` provides a fixed width so the label doesn't shift as the value changes. `text-right` aligns numbers to the right edge.

- **`onValueChange` typed as `(field: keyof AdminConfig, value: number)`:** Matches the `updateField` signature from `AdminPanel`. The parent passes it directly without wrapping. The `keyof AdminConfig` type is broader than `NumericField`, but the component only calls it with numeric field names — type safety is enforced by the `CONTROLS` definition.

- **Description below each slider:** Short text explaining what the parameter does and its range. More contextual than a tooltip, appropriate for a back-office tool.

---

### 4.5 Taxonomy Display

**File:** `components/taxonomy-display.tsx`

Renders the product taxonomy as an expandable list using native `<details>`/`<summary>` elements. All categories collapsed by default.

```typescript
import { ChevronRight } from "lucide-react";
import type { TaxonomyCategory } from "@/lib/schemas";

interface TaxonomyDisplayProps {
  taxonomy: TaxonomyCategory[];
}

export function TaxonomyDisplay({ taxonomy }: TaxonomyDisplayProps) {
  if (taxonomy.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Taxonomy unavailable — could not connect to the product database.
      </p>
    );
  }

  const totalTypes = taxonomy.reduce((sum, cat) => sum + cat.types.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {taxonomy.length} categories, {totalTypes} types
      </p>
      <div className="space-y-1">
        {taxonomy.map((cat) => (
          <details key={cat.category} className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium select-none hover:bg-muted/50">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <span className="flex-1">{cat.category}</span>
              <span className="text-xs text-muted-foreground">
                {cat.types.length}
              </span>
            </summary>
            <div className="border-t border-border px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {cat.types.map((type) => (
                  <span
                    key={type}
                    className="rounded-md bg-muted px-2.5 py-1 text-xs"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
```

**Design decisions:**

- **No `"use client"` directive:** No hooks, no state. Pure presentational component. Native `<details>` manages expand/collapse state internally without React state.

- **Empty taxonomy fallback:** If `taxonomy.length === 0` (MongoDB unavailable), shows a simple message instead of an empty list. This handles the error case from the Server Component's `try/catch`.

- **Summary line with stats:** `"{N} categories, {M} types"` gives the admin a quick overview before expanding anything. Matches US-021: "The panel displays the full list of categories (15) with their assigned types (63)."

- **`group` + `group-open:rotate-90` on ChevronRight:** The `<details>` element has `className="group"`. The chevron icon uses `group-open:rotate-90` to rotate 90 degrees when the `<details>` is open. The `transition-transform` class animates the rotation smoothly.

- **`select-none` on summary:** Prevents text selection when clicking to expand/collapse. Standard UX for interactive summaries.

- **Types as styled tags:** Each type is rendered as a `<span>` with `bg-muted rounded-md px-2.5 py-1 text-xs`. This creates a tag-like visual that's easy to scan. `flex-wrap gap-2` allows tags to flow across multiple lines. Not using `Badge` component — badges are for status indicators (scores, counts), not data labels.

- **Type count on summary line:** `{cat.types.length}` displayed as muted text on the right side of each category header. Lets the admin see how many types each category has without expanding.

- **All collapsed by default:** 15 categories × ~4 types each = a lot of expanded content. Starting collapsed lets the admin choose which categories to inspect. Multiple items can be open simultaneously (unlike accordion with `type="single"`), which is useful for comparing categories while tuning prompts.

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: shadcn Slider installed correctly
1. Run `npx shadcn@latest add slider`.
2. **Verify:** `components/ui/slider.tsx` exists.
3. **Verify:** `npx tsc --noEmit` passes.

### Test 2: Admin page loads with current config
1. Start dev server. Open `http://localhost:3000`. Enter a valid API key.
2. Click "Admin" in the header.
3. **Verify:** Page shows "Admin Panel" heading with description.
4. **Verify:** Two textareas populated with the current system prompts (not empty).
5. **Verify:** Three sliders showing default values: Results 6, Candidates 50, Threshold 0.
6. **Verify:** Save button is disabled (no changes yet).
7. **Verify:** No "Discard Changes" button visible.

### Test 3: Taxonomy displays correctly
1. On the admin page, scroll to "Product Taxonomy" section.
2. **Verify:** Summary shows "15 categories, 63 types" (or actual counts from the database).
3. **Verify:** All categories listed, all collapsed.
4. Click on "Bedroom Furniture" (or any category).
5. **Verify:** Chevron rotates, types appear as tags below.
6. **Verify:** Multiple categories can be open simultaneously.

### Test 4: Edit prompt and save
1. Modify the image analysis prompt (add a word).
2. **Verify:** Save button becomes enabled. "Discard Changes" button appears.
3. Click "Save Configuration".
4. **Verify:** Button shows "Saving..." with spinner.
5. **Verify:** After response, green "Configuration saved" message appears next to button.
6. **Verify:** Save button becomes disabled again (isDirty = false).
7. **Verify:** Message disappears after ~3 seconds.

### Test 5: Edit numeric parameter and save
1. Drag the "Number of displayed results" slider from 6 to 8.
2. **Verify:** Value display updates to 8.
3. **Verify:** Save button becomes enabled.
4. Click "Save Configuration".
5. **Verify:** Success message. Navigate to search, perform a search.
6. **Verify:** Search returns 8 results instead of 6.

### Test 6: Discard changes
1. Change the score threshold slider to 50.
2. Modify the re-ranking prompt.
3. Click "Discard Changes".
4. **Verify:** Slider reverts to previous value. Prompt reverts to previous text.
5. **Verify:** Save button disabled. "Discard Changes" button disappears.

### Test 7: Validation — empty prompt rejected
1. Clear the image analysis prompt textarea (select all, delete).
2. **Verify:** Save button is disabled (isValid = false).
3. Type some text back.
4. **Verify:** Save button re-enables (if isDirty is true).

### Test 8: Server validation error
1. Open browser DevTools Console.
2. Temporarily modify the fetch to send `{ resultsCount: 999 }` (or use DevTools to intercept).
3. **Verify:** Red error message appears next to Save button with the server error message.
4. **Verify:** Error message persists (does not auto-clear).

### Test 9: Navigation preserves saved changes
1. Change results count to 10. Save.
2. Navigate to Search (click "Search" in header).
3. Navigate back to Admin.
4. **Verify:** Results count shows 10 (saved value), not 6 (original default).
5. **Verify:** Save button is disabled (no unsaved changes).

### Test 10: Navigation discards unsaved changes
1. Change results count to 4 (do not save).
2. Navigate to Search.
3. Navigate back to Admin.
4. **Verify:** Results count shows the last saved value (not 4).

### Test 11: API key not required for admin API
1. **Verify:** The admin page loads and functions without `X-API-Key` header in admin API requests.
2. **Verify:** The page is behind the ApiKeyGate (user must have entered a key to see the app), but admin API endpoints themselves don't require the key.

### Test 12: Taxonomy unavailable gracefully
1. Temporarily disconnect from MongoDB (e.g., invalid connection string).
2. Navigate to admin page.
3. **Verify:** Config section still renders with default values.
4. **Verify:** Taxonomy section shows "Taxonomy unavailable" message.

### Test 13: Slider keyboard interaction
1. Tab to a slider.
2. Press arrow keys.
3. **Verify:** Value changes by step increment.
4. Press Home/End.
5. **Verify:** Value jumps to min/max.

### Test 14: Responsive layout
1. Open DevTools responsive mode.
2. Width 375px: **Verify** sliders and textareas stack vertically and remain usable.
3. Width 1280px: **Verify** comfortable layout with appropriate spacing.

### Test 15: Build check
1. `npx tsc --noEmit` — no TypeScript errors.
2. `npx next lint` — no ESLint errors.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | shadcn `slider` installed in `components/ui/` | Test 1 — file exists, tsc passes |
| 2 | Admin page loads with current config from server (no loading spinner) | Test 2 — immediate data display |
| 3 | Image analysis prompt textarea populated and editable | Test 2, 4 — edit and save |
| 4 | Re-ranking prompt textarea populated and editable | Test 2, 4 — edit and save |
| 5 | Results count slider (3–12) with value display | Test 2, 5 — drag and verify value |
| 6 | Max candidates slider (10–100) with value display | Test 2 — drag and verify value |
| 7 | Score threshold slider (0–100) with value display | Test 2 — drag and verify value |
| 8 | Save button disabled when no changes (isDirty = false) | Tests 2, 4 — disabled when clean |
| 9 | Save button disabled when prompts empty (isValid = false) | Test 7 — disabled when empty |
| 10 | Save sends config to PUT /api/admin/config | Test 4, 5 — verify via DevTools Network tab |
| 11 | Success message "Configuration saved" appears and auto-clears | Test 4 — message appears, fades after 3s |
| 12 | Error message displayed on save failure | Test 8 — red error text |
| 13 | "Discard Changes" button reverts all fields to last saved values | Test 6 — all fields revert |
| 14 | Configuration changes applied immediately (no server restart) | Test 5 — search reflects new resultsCount |
| 15 | Taxonomy displays all categories with expandable type lists | Test 3 — 15 categories, 63 types |
| 16 | Taxonomy shows summary counts | Test 3 — "15 categories, 63 types" |
| 17 | Taxonomy gracefully handles database unavailability | Test 12 — fallback message |
| 18 | Saved changes persist across client-side navigation | Test 9 — navigate away and back |
| 19 | Unsaved changes lost on navigation (no blocking) | Test 10 — fresh values on return |
| 20 | Slider keyboard navigation works (arrow keys, Home/End) | Test 13 |
| 21 | Monospace font for prompt textareas | Test 2 — visual check |
| 22 | Prompt textareas have template variable hints in descriptions | Test 2 — description text visible |
| 23 | `tsc --noEmit` clean | Test 15 |
| 24 | `next lint` clean | Test 15 |

---

## 7. Out of Scope for Step 8

These items are deliberately deferred to later steps or are out of MVP scope:

- **Feedback (thumbs up/down)** — Step 9. Admin panel does not display feedback data.
- **Error boundaries** — Step 10. Unhandled rendering errors show the default Next.js error page.
- **Reset to default prompts** — Would require a new API endpoint to expose default prompt values. The server doesn't currently distinguish "default" from "current." Users can restart the server to reset all config.
- **Config persistence to disk** — Explicitly out of scope per PRD section 4 ("In-memory, lost on restart").
- **Authentication for admin** — US-022 explicitly says admin is accessible without additional authentication.
- **Prompt syntax highlighting** — Monospace font is sufficient for template variable visibility. No code editor needed.
- **Undo/redo stack** — Browser's native undo (Ctrl+Z) works in textareas. No custom undo history.
- **Confirmation dialog on navigation** — Unsaved changes are low-cost to re-enter (see assumption 2.11).
- **Dark mode** — Not in MVP scope. `text-emerald-600` for success messages may need a `dark:` variant when dark mode is added.
- **Toast notifications** — Inline text messages are sufficient for a single save action (see assumption 2.8).
- **Config validation history / audit log** — Out of MVP scope.
- **Prompt versioning / comparison** — Out of MVP scope.
- **Real-time config sync** (multiple browser tabs) — Out of MVP scope. Each tab loads config on navigation.
