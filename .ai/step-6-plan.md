# Step 6 — API Key UI

## 1. Overview

Step 6 replaces the minimal inline API key form (created in Step 5 as a temporary scaffold) with a polished UI built on shadcn/ui components. This is the first step that introduces shadcn components into the project.

The work has three parts:

1. **Install shadcn components** — `button`, `input`, `card`, `label` via the CLI. These are the foundation components that later steps (Search UI, Admin panel) will also use.
2. **Extract and enhance the API key form** — Move the inline `ApiKeyPrompt` out of `api-key-gate.tsx` into a dedicated `components/api-key-form.tsx` Client Component. Replace plain HTML elements with shadcn components. Add client-side format validation (`sk-ant-` prefix check), a loading spinner (Loader2 icon), privacy reassurance copy, and full accessibility attributes.
3. **Upgrade the header button** — Replace the plain `<button>` for "Change API Key" with a shadcn `Button` (ghost variant) for visual consistency with the new design system.

After Step 6, the API key entry experience is visually polished, accessible, and consistent with shadcn/ui. The gate logic, context provider, layout composition, and backend endpoint are unchanged.

---

## 2. Assumptions

### 2.1 Component Extraction: Separate File

**Decision:** Extract the form into a new `components/api-key-form.tsx` file. The gate component imports and renders it.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **Separate `api-key-form.tsx`** | Clear separation of concerns — gate handles conditional logic, form handles UI/validation. Form could be reused (e.g., inline in a settings page). Each file is small and focused. | One more file in `components/`. |
| **Keep form inside `api-key-gate.tsx`** | Fewer files. Colocation of gate + form. | File grows with shadcn imports, accessibility attributes, format validation. Two distinct responsibilities in one file. Step 5 plan explicitly noted this extraction would happen in Step 6. |

**Rationale:** The gate's job is "check context, render form or children." The form's job is "collect input, validate, call API, report result." These are different responsibilities. Extracting aligns with the Step 5 plan (section 4.3: "Step 6 will extract `ApiKeyPrompt` into a standalone `ApiKeyForm` component"). The form file is ~80 lines — small enough to not warrant further splitting.

### 2.2 Client-Side Format Validation: Prefix Check Only

**Decision:** Validate that the key starts with `"sk-ant-"` before making the API call. No full regex for the key format.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **`startsWith("sk-ant-")`** | Catches obvious mistakes (pasting wrong key, random text). Simple. Stable — the `sk-ant-` prefix has been consistent across Anthropic key formats. | Does not catch all invalid keys (e.g., `sk-ant-abc` passes the prefix check but fails server validation). |
| **Full regex** (`/^sk-ant-api03-[A-Za-z0-9_-]{95}$/`) | More precise — rejects structurally invalid keys without an API call. | Fragile — Anthropic may change key format (length, version prefix). Would need maintenance. Over-specific for a convenience check. |
| **No client-side validation** | Simplest. Server is the authority anyway. | Wastes a network round-trip for obviously wrong input (e.g., pasting a GitHub token). Poor UX. |

**Rationale:** The prefix check is a UX convenience, not a security measure. It catches the most common mistake (pasting the wrong API key) without being fragile. The server-side validation via `POST /api/key` remains the authoritative check. The PRD does not specify a format — this is purely a usability improvement.

### 2.3 Error Display: Inline Text

**Decision:** Display errors as a `<p>` element directly below the input, styled with `text-destructive`.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **Inline `<p>` below input** | Visible next to the field. Standard form pattern. No extra component needed. Connected via `aria-describedby`. | Less visually prominent than an alert banner. |
| **shadcn `Alert` component** | More prominent. Structured with icon + title + description. | Overkill for a single-field form. Adds another component install. Alert banners are better for page-level messages, not field-level errors. |
| **Toast notification** | Non-intrusive. | Disappears after timeout — user might miss it. Errors should persist until corrected. Requires toast provider setup. |

**Rationale:** One input, one error — inline text is the simplest and most conventional pattern. The error is directly adjacent to the input, making the cause-effect relationship clear. `aria-describedby` connects them for screen readers.

### 2.4 Form State: Plain useState

**Decision:** Use `useState` for `inputValue`, `error`, and `isLoading`. No form library.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **Plain `useState`** | Zero dependencies. Simple for one field. Consistent with Step 5 pattern. Full control over validation timing. | Manual state management. |
| **react-hook-form** | Built-in validation, error tracking, dirty/touched state. | Adds a dependency for a single input. Registration boilerplate. Learning curve for contributors unfamiliar with it. Over-engineering for one field. |
| **Server Actions** (`useActionState`) | Next.js-native form handling. Progressive enhancement. | Requires `"use server"` action. The API key must stay client-side (RF-002) — server actions would put it in the server action's closure. Also, we need the key in React state after validation, not just a server-side result. |

**Rationale:** One input with three states (`value`, `error`, `loading`) does not justify a form library. `useState` is the simplest correct approach. If future steps add multi-field forms (e.g., admin config), react-hook-form can be evaluated then.

### 2.5 shadcn Component Set: Minimal

**Decision:** Install exactly four components: `button`, `input`, `card`, `label`.

**Rationale:** These are the minimum needed for the API key form. Each maps to a specific UI element:

| Component | Used for |
|---|---|
| `Card` (+ `CardHeader`, `CardContent`, `CardTitle`, `CardDescription`) | Form container with title and description |
| `Input` | API key text field |
| `Button` | Submit button + header "Change API Key" button |
| `Label` | Accessible input label |

No `Alert` (inline text is sufficient — see 2.3), no `Spinner` (Loader2 icon from lucide-react with `animate-spin` is the shadcn pattern for loading buttons), no `Dialog` (no confirmation needed for clearing key).

### 2.6 Change API Key Flow: No Confirmation Dialog

**Decision:** Clicking "Change API Key" immediately clears the key and shows the form. No confirmation step.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **Immediate clear** | Zero friction. Easily reversible (just re-enter the key). Simple. | Accidental click clears the key. |
| **Confirmation dialog** | Prevents accidental clears. | Over-engineering — the key is not persisted, so there is no data loss. Re-entering takes seconds. Adds AlertDialog component dependency and state management. |

**Rationale:** This is a developer/demo tool. The key is stored only in React state — clearing it causes no data loss. The action is easily reversible. A confirmation dialog adds friction to a low-stakes action.

---

## 3. File Structure

```
New files:
  components/api-key-form.tsx        — Client Component: polished API key entry form with shadcn components

Auto-generated by shadcn CLI (do not write manually):
  components/ui/button.tsx           — shadcn Button component
  components/ui/input.tsx            — shadcn Input component
  components/ui/card.tsx             — shadcn Card component (Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter)
  components/ui/label.tsx            — shadcn Label component

Modified files:
  components/api-key-gate.tsx        — Remove inline ApiKeyPrompt, import ApiKeyForm instead
  components/header.tsx              — Replace plain <button> with shadcn Button (ghost variant)

Existing files (unchanged):
  components/api-key-provider.tsx    — Context logic unchanged
  app/layout.tsx                     — Composition unchanged
  app/api/key/route.ts               — Backend unchanged
  lib/schemas/api-key.ts             — Schema unchanged
  app/globals.css                    — Tailwind CSS 4 config (already set up with shadcn theme vars)
  lib/utils.ts                       — cn() helper (already exists)
  components.json                    — shadcn config (already configured)
```

---

## 4. Implementation Tasks

### 4.0 Install shadcn Components

**Command:** `npx shadcn@latest add button input card label`

This installs four components into `components/ui/`. The CLI reads `components.json` for style (new-york), aliases (`@/components/ui`), and CSS config (`app/globals.css`). All runtime dependencies (`radix-ui`, `class-variance-authority`, `lucide-react`) are already in `package.json`.

**Expected output:** Four new files in `components/ui/`:
- `button.tsx` — Button with `variant` and `size` props via CVA
- `input.tsx` — Input with consistent border/ring styling
- `card.tsx` — Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter
- `label.tsx` — Label with Radix UI Label primitive for accessibility

No manual edits to these files. They are maintained by shadcn CLI.

---

### 4.1 API Key Form

**File:** `components/api-key-form.tsx`

This Client Component is the polished replacement for the inline `ApiKeyPrompt` from Step 5. It wraps the form in a shadcn Card, uses proper Input/Button/Label components, adds client-side prefix validation, a loading spinner, and full accessibility attributes.

```typescript
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_KEY_PREFIX = "sk-ant-";

interface ApiKeyFormProps {
  onValidated: (key: string) => void;
}

export function ApiKeyForm({ onValidated }: ApiKeyFormProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = inputValue.trim();
    if (!key) return;

    // Client-side format check
    if (!key.startsWith(API_KEY_PREFIX)) {
      setError(`API key must start with "${API_KEY_PREFIX}".`);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Validation failed");
        return;
      }

      if (data.valid) {
        onValidated(key);
      } else {
        setError("Invalid API key. Please check your key and try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const errorId = "api-key-error";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Enter your API key</CardTitle>
          <CardDescription>
            An Anthropic API key is required to use this application.
            Your key is stored in memory only and never saved to disk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="sk-ant-..."
                disabled={isLoading}
                autoFocus
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
              />
              {error && (
                <p id={errorId} className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !inputValue.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Validating...
                </>
              ) : (
                "Validate & Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Design decisions:**

- **Card as container:** Provides visual structure — a bordered, padded container that separates the form from the background. Matches the shadcn `card-with-form` example pattern. The card's `--card` / `--card-foreground` CSS variables ensure consistent theming.
- **CardDescription for privacy reassurance:** "Your key is stored in memory only and never saved to disk" addresses a natural concern when entering a secret. This is a UX trust signal, not a legal disclaimer.
- **Client-side prefix validation before API call:** `startsWith("sk-ant-")` catches obvious mistakes without a network round-trip. The error message tells the user exactly what prefix is expected. This runs synchronously before `setIsLoading(true)`, so the user gets instant feedback for format errors.
- **Error in `finally` block vs. early return:** When `!res.ok`, the function does `setError(...); return;` before `finally` runs. The `finally` block always runs `setIsLoading(false)`, so loading state is correctly cleaned up on all paths (success, API error, network error).
- **Loader2 icon with `animate-spin`:** This is the standard shadcn pattern for loading buttons (no separate Spinner component in new-york-v4 style). The icon is placed before the text as a child of Button — shadcn Button handles icon + text layout with gap.
- **`errorId` constant:** Used for both the `id` on the error `<p>` and the `aria-describedby` on the Input. The `aria-describedby` is conditionally applied only when an error exists, so screen readers do not announce a non-existent element.
- **`aria-invalid`:** Set to `true` when `error` is non-null. Screen readers announce the input as invalid, prompting the user to check the associated description.
- **No `CardFooter`:** The button is inside `CardContent` within the `<form>`. This is semantically correct — the button is part of the form, not a separate footer action. Using `CardFooter` would place the button outside the form, requiring `form="..."` attribute wiring.
- **`w-full max-w-md` on Card:** Fills available width on mobile, caps at 28rem on larger screens. `min-h-[60vh]` on the wrapper centers the card vertically in the viewport space below the header.
- **`Label htmlFor="apiKey"`:** Connected to the Input via matching `id`. This is required for accessibility — clicking the label focuses the input, and screen readers associate the label text with the field.
- **`autoFocus`:** The input receives focus on mount. Since this is the only interactive element on the page (when the gate is blocking), auto-focus is appropriate and expected.

---

### 4.2 API Key Gate (Modified)

**File:** `components/api-key-gate.tsx`

The gate component is simplified. The inline `ApiKeyPrompt` function (~40 lines) is deleted entirely. The gate now imports `ApiKeyForm` from the new file.

```typescript
"use client";

import { useApiKey } from "@/components/api-key-provider";
import { ApiKeyForm } from "@/components/api-key-form";

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { apiKey, setApiKey } = useApiKey();

  if (apiKey) {
    return <>{children}</>;
  }

  return <ApiKeyForm onValidated={setApiKey} />;
}
```

**Changes from Step 5:**

- **Removed:** `import { useState } from "react"` — no longer needed (form has its own state).
- **Removed:** Entire `ApiKeyPrompt` function definition (~35 lines of JSX and state logic).
- **Added:** `import { ApiKeyForm } from "@/components/api-key-form"`.
- **Changed:** `<ApiKeyPrompt onValidated={setApiKey} />` becomes `<ApiKeyForm onValidated={setApiKey} />`.
- **Unchanged:** Gate logic (`if (apiKey)` check), `useApiKey()` hook usage, props interface.

The gate is now 12 lines total — a pure structural component with no UI logic.

---

### 4.3 Header (Modified)

**File:** `components/header.tsx`

Replace the plain `<button>` element for "Change API Key" with a shadcn `Button` component. This brings it into the design system and provides proper hover/focus states, consistent sizing, and visual harmony with the new form button.

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiKey } from "@/components/api-key-provider";
import { Button } from "@/components/ui/button";

export function Header() {
  const pathname = usePathname();
  const { apiKey, clearApiKey } = useApiKey();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold">
            Furniture Search
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Search
            </Link>
            <Link
              href="/admin"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/admin"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Admin
            </Link>
          </nav>
        </div>
        {apiKey && (
          <Button variant="ghost" size="sm" onClick={clearApiKey}>
            Change API Key
          </Button>
        )}
      </div>
    </header>
  );
}
```

**Changes from Step 5:**

- **Added:** `import { Button } from "@/components/ui/button"`.
- **Changed:** Plain `<button>` element with inline Tailwind classes replaced with `<Button variant="ghost" size="sm">`. The ghost variant renders a transparent button that shows a subtle background on hover — appropriate for a secondary action in the header. Size `sm` keeps it compact.
- **Removed:** Inline `className` string on the button (`"text-sm text-muted-foreground hover:text-foreground transition-colors"`). The shadcn Button ghost variant provides equivalent styling plus focus ring, disabled state, and consistent sizing.
- **Unchanged:** All nav link styling, layout structure, conditional rendering logic.

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: shadcn components installed correctly
1. Run `npx shadcn@latest add button input card label`.
2. **Verify:** `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/card.tsx`, `components/ui/label.tsx` exist.
3. **Verify:** `npx tsc --noEmit` passes — all shadcn components type-check.

### Test 2: Form renders with Card layout
1. Start the dev server. Open `http://localhost:3000`.
2. **Verify:** A Card component is rendered with a centered layout.
3. **Verify:** Card has title "Enter your API key" and description mentioning memory-only storage.
4. **Verify:** Input has a "API Key" label above it.
5. **Verify:** Input has `type="password"` (text is masked).
6. **Verify:** Button reads "Validate & Continue" and is disabled (input is empty).
7. **Verify:** Input has focus on page load (autoFocus).

### Test 3: Client-side format validation
1. Type `my-random-key` into the input.
2. Click "Validate & Continue".
3. **Verify:** Error message appears immediately: `API key must start with "sk-ant-".`
4. **Verify:** No network request was made (check browser DevTools Network tab).
5. **Verify:** Error text is red (`text-destructive`).

### Test 4: Server-side validation — invalid key
1. Clear the input. Type `sk-ant-invalid-key-12345`.
2. Click "Validate & Continue".
3. **Verify:** Button shows Loader2 spinner icon + "Validating..." text.
4. **Verify:** Input is disabled during validation.
5. **Verify:** After the API responds, error message appears: "Invalid API key. Please check your key and try again."
6. **Verify:** Input and button are re-enabled.

### Test 5: Server-side validation — valid key
1. Enter a valid Anthropic API key.
2. Click "Validate & Continue".
3. **Verify:** Spinner + "Validating..." shown.
4. **Verify:** After success, the Card disappears and page content (search placeholder) is shown.
5. **Verify:** "Change API Key" button appears in the header (ghost variant styling).

### Test 6: Navigation preserves key
1. With a valid key set, click "Admin" in the nav.
2. **Verify:** Admin placeholder shown (not the API key form).
3. Click "Search".
4. **Verify:** Search placeholder shown (not the API key form).
5. **Verify:** Key was not lost during navigation.

### Test 7: Change API Key
1. Click "Change API Key" in the header.
2. **Verify:** The Card form reappears.
3. **Verify:** "Change API Key" button disappears from the header.
4. **Verify:** A new key can be entered and validated.

### Test 8: Page refresh loses key
1. With a valid key set, press F5.
2. **Verify:** The Card form reappears — key was lost (React state only).

### Test 9: Direct URL without key
1. Open `http://localhost:3000/admin` in a new tab.
2. **Verify:** The Card form is shown, not the admin content.

### Test 10: Accessibility check
1. Tab through the form.
2. **Verify:** Focus moves: Input → Button (two tab stops).
3. Trigger an error (enter wrong format).
4. **Verify:** Screen reader announces the error text (via `aria-describedby`).
5. **Verify:** Input has `aria-invalid="true"` when error is present.

### Test 11: Build check
1. Run `npx tsc --noEmit` — no TypeScript errors.
2. Run `npx next lint` — no ESLint errors.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | shadcn `button`, `input`, `card`, `label` components installed in `components/ui/` | Test 1 — files exist, tsc passes |
| 2 | API key form uses Card as container with title and description | Test 2 — visual check |
| 3 | Input uses shadcn Input with Label, type="password", autoFocus | Test 2 — visual check, DOM inspection |
| 4 | Client-side format validation rejects keys not starting with `sk-ant-` | Test 3 — instant error, no network request |
| 5 | Server-side validation via POST /api/key — valid key accepted | Test 5 — gate opens |
| 6 | Server-side validation via POST /api/key — invalid key rejected with error | Test 4 — error message shown |
| 7 | Error messages displayed inline below input with `text-destructive` | Test 3, 4 — red text below input |
| 8 | Loading state shows Loader2 spinner + "Validating..." text, input/button disabled | Test 4, 5 — visual check during API call |
| 9 | Success stores key in context, gate renders children | Test 5 — page content visible after validation |
| 10 | "Change API Key" in header uses shadcn Button ghost variant | Test 5, 7 — visual check, DOM inspection |
| 11 | Accessibility: Label with htmlFor, aria-invalid, aria-describedby, autoFocus | Test 10 — tab navigation, screen reader |
| 12 | API key persists across client-side navigation | Test 6 — key not lost when switching pages |
| 13 | API key lost on page refresh (React state only) | Test 8 — gate reappears after F5 |
| 14 | `api-key-gate.tsx` simplified — no inline form, imports `ApiKeyForm` | Code review — file is ~12 lines |
| 15 | `tsc --noEmit` clean | Test 11 |
| 16 | `next lint` clean | Test 11 |

---

## 7. Out of Scope for Step 6

These items are deliberately deferred to later steps:

- **Dark mode toggle** — Not in MVP scope
- **Key format validation beyond prefix** — Full regex is fragile (see assumption 2.2)
- **Confirmation dialog for clearing key** — Easily reversible action (see assumption 2.6)
- **Fetch wrapper/hook** — Deferred to Step 7 when multiple API calls exist
- **Session/localStorage persistence** — Violates RF-002 (see Step 5, assumption 2.1)
- **Key rotation/expiry handling** — Out of MVP scope
- **Toast notifications** — Not needed for single-field form errors (see assumption 2.3)
- **react-hook-form** — Not justified for one input (see assumption 2.4)
- **Search UI** — Step 7
- **Admin UI** — Step 8
