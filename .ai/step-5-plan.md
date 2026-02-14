# Step 5 — App Shell: Layout, Navigation, API Key Context

## 1. Overview

Step 5 builds the application shell — the structural layer that wraps all page content and provides three pieces of infrastructure:

1. **API Key Context** — a React Context that holds the user's Anthropic API key in client-side memory, exposes it to all components, and provides `setApiKey`/`clearApiKey` functions.
2. **Root Layout + Navigation** — an updated root layout with a branded header containing nav links (`/` and `/admin`). The layout is a Server Component; interactive parts (nav, context) are Client Components composed inside it.
3. **API Key Gate** — a Client Component that wraps page content and blocks rendering until a valid API key is present. When no key is set, it renders a minimal inline form (input + validate button). Step 6 replaces this with the full-featured API key UI.

This step also creates placeholder pages for `/` (search) and `/admin` so the navigation targets exist and the gate can be verified end-to-end.

After Step 5, a user can: open the app → see the branded header with nav → be prompted for an API key → enter and validate a key → see placeholder content → navigate between `/` and `/admin` without losing the key.

---

## 2. Assumptions

### 2.1 API Key Persistence: React State Only

**Decision:** Store the API key exclusively in React state (`useState`). It is lost on page refresh (F5) or tab close.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **React state only** | Strictest PRD compliance (RF-002: "stored exclusively in memory — on the client side in React state"). Zero persistence. Simple. | Lost on refresh — user must re-enter the key. |
| **sessionStorage** | Survives soft refresh and client-side navigation. Better UX for development workflow. Cleared on tab close. | Technically written to disk by the browser. PRD says "never persisted to disk". Adds complexity (hydration mismatch if SSR reads it). |
| **localStorage** | Survives browser restart. | Clearly violates "never persisted to disk". Security concern. |

**Rationale:** The PRD (RF-002) explicitly says "stored exclusively in memory — on the client side in React state" and "never persisted to disk". React state satisfies this literally. The app is a local development/demo tool, so re-entering the key on refresh is acceptable. US-022 ("switching between views does not cause loss of the API key from memory") is satisfied because client-side navigation via `<Link>` does not remount the root layout — state persists across route transitions.

### 2.2 Gate Strategy: Conditional Rendering

**Decision:** The `ApiKeyGate` component checks the context. If `apiKey` is null, it renders a gate prompt (minimal form in Step 5, full form in Step 6). If the key exists, it renders `{children}`.

**Alternatives considered:**

| Strategy | Pros | Cons |
|---|---|---|
| **Conditional rendering** | No flash of unauthorized content. No URL change. Simple. Works for both `/` and `/admin`. Gate is a pure client component — no server involvement. | Gate replaces page content inline instead of redirecting to a dedicated `/login` route. |
| **Next.js Middleware** | Server-side gate. Standard pattern for auth. | Cannot access React state or context. The API key is client-side only — middleware has no way to check it. Would require cookies, which violates "in memory only". |
| **Client-side redirect (`useRouter`)** | Familiar redirect pattern. Separate gate page at `/key`. | Flash of content before redirect (useEffect runs after render). More complex — requires a separate page, redirect logic, and return-URL handling. |

**Rationale:** Conditional rendering is the simplest approach that satisfies all requirements. The gate component checks context synchronously during render — no flash, no redirect. Middleware is eliminated because it cannot access client-side React state. Client-side redirect adds unnecessary complexity for no benefit.

### 2.3 Client/Server Boundary

**Decision:** The root layout (`app/layout.tsx`) remains a Server Component (for metadata, fonts). Client Components are composed inside it:

```
app/layout.tsx (Server Component)
  └── <html><body>
       └── ApiKeyProvider (Client Component — provides context)
            └── Header (Client Component — uses usePathname)
            └── <main>
                 └── ApiKeyGate (Client Component — checks context)
                      └── {children} (pages — Server or Client)
```

**Rationale:** This follows the Next.js pattern from the docs (`.next-docs/01-app/01-getting-started/05-server-and-client-components.mdx`, "Context providers" section): create a Client Component that accepts `children`, import it in a Server Component layout. The `children` prop creates a slot — Server Component pages passed as children are rendered on the server and streamed through the Client Component boundary. This preserves server rendering for pages while enabling client-side context.

### 2.4 Layout Structure: Single Root Layout

**Decision:** One root layout for the entire app. Both `/` and `/admin` share the same header and navigation.

**Alternatives considered:**

| Structure | Pros | Cons |
|---|---|---|
| **Single root layout** | Simple. Consistent header/nav across all pages. Easier context setup. | Admin can't have a different shell (not needed for MVP). |
| **Nested layouts** (`app/(main)/layout.tsx` + `app/admin/layout.tsx`) | Different UI shells per section. | Over-engineering for MVP. Both sections share the same header. Adds route group complexity. |

**Rationale:** The PRD has a simple two-page app (`/` and `/admin`) sharing a common header. No section needs a different layout structure. A single root layout is the simplest correct solution.

### 2.5 Navigation: Plain Tailwind + Link

**Decision:** Build the header with Tailwind utility classes and Next.js `<Link>` component. Use `usePathname()` for active link styling. No shadcn NavigationMenu or other UI library components.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| **Tailwind + Link** | Minimal. No dependencies. Full control. Matches MVP scope. | Manually styled. |
| **shadcn NavigationMenu** | Polished. Accessible (Radix-based). | Heavy for two links. Adds component installation and complexity. NavigationMenu is designed for complex dropdown menus, not simple nav. |

**Rationale:** Two nav links don't justify a full NavigationMenu component. Plain `<Link>` with Tailwind classes is simpler, lighter, and sufficient. If the nav grows, shadcn components can be added later.

### 2.6 Fetch Helper: Deferred

**Decision:** No fetch wrapper or custom hook for API calls in Step 5. Consumers access the API key from context and pass it in headers manually.

**Rationale:** Step 5 only makes one API call (key validation in the gate form). Step 6 (API key UI) and Step 7 (search UI) will be the first heavy users of the API. If a pattern emerges, a helper can be extracted then. Creating an abstraction for one call site is premature.

### 2.7 Gate Scope: All Routes

**Decision:** The gate blocks all routes (`/` and `/admin`) until a valid API key is provided.

**Rationale:** RF-001 says "The application requires an Anthropic API key before any functionality is available." While admin endpoints don't require a key server-side (Step 4, section 2.3), the admin UI is still "functionality" per the PRD. Gating everything is simpler and more secure — no risk of accessing admin without a key.

---

## 3. File Structure

```
New files:
  components/api-key-provider.tsx    — Client Component: React Context + Provider + useApiKey hook
  components/header.tsx              — Client Component: branded header with nav links
  components/api-key-gate.tsx        — Client Component: gates content behind API key
  app/admin/page.tsx                 — Admin page placeholder (Server Component)

Modified files:
  app/layout.tsx                     — Updated: metadata, providers, header, gate, structure
  app/page.tsx                       — Replaced: search page placeholder (Server Component)

Existing files (unchanged):
  app/globals.css                    — Tailwind CSS 4 config (already set up)
  app/api/key/route.ts               — POST /api/key (used by gate form)
  lib/schemas/api-key.ts             — ApiKeyRequestSchema (contract for key validation)
  lib/utils.ts                       — cn() helper (already exists)
```

---

## 4. Implementation Tasks

### 4.1 API Key Provider

**File:** `components/api-key-provider.tsx`

This Client Component creates a React Context for the API key and exports a Provider component plus a consumer hook.

```typescript
"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | null>(null);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  const setApiKey = useCallback((key: string) => {
    setApiKeyState(key);
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState(null);
  }, []);

  return (
    <ApiKeyContext value={{ apiKey, setApiKey, clearApiKey }}>
      {children}
    </ApiKeyContext>
  );
}

export function useApiKey(): ApiKeyContextType {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error("useApiKey must be used within an ApiKeyProvider");
  }
  return context;
}
```

**Design decisions:**

- **Context value type:** `{ apiKey, setApiKey, clearApiKey }`. Minimal surface — just what consumers need. No `isValidated` flag because `apiKey !== null` implies the key was validated (the gate form validates before calling `setApiKey`).
- **`useCallback` for setters:** Prevents unnecessary re-renders of consumers that destructure `setApiKey` or `clearApiKey` into dependencies.
- **`null` default for context:** The `useApiKey` hook throws if used outside the provider — this is a developer error (misconfigured layout), not a runtime edge case. Catching it early avoids subtle bugs.
- **React 19 `<Context value={...}>` syntax:** React 19 allows passing `value` directly on the context component (`<ApiKeyContext value={...}>`) instead of `<ApiKeyContext.Provider value={...}>`. Both work; the shorter form is preferred.
- **No persistence:** State lives only in React `useState`. Lost on refresh (see assumption 2.1).

---

### 4.2 Header with Navigation

**File:** `components/header.tsx`

A Client Component that renders the app header with the application name and navigation links. Uses `usePathname()` from `next/navigation` for active link styling.

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiKey } from "@/components/api-key-provider";

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
          <button
            onClick={clearApiKey}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Change API Key
          </button>
        )}
      </div>
    </header>
  );
}
```

**Design decisions:**

- **`usePathname()` for active links:** The standard Next.js App Router approach for checking the current route. This requires `"use client"` — nav highlighting is a client concern.
- **Active link styling:** Uses shadcn theme colors (`bg-accent`, `text-accent-foreground`, `text-muted-foreground`) to match the design system. Active link gets a subtle background; inactive links are muted.
- **"Change API Key" button:** Only visible when a key is set. Calls `clearApiKey()` which resets the state to `null`, causing the gate to re-display. This satisfies US-002 ("option to change/clear key") at a basic level. Step 6 may enhance this with a confirmation dialog or dropdown.
- **Max width container:** `max-w-5xl mx-auto` constrains the header content. This width works well for the 2x3 result grid (Step 7).
- **No shadcn components:** Pure Tailwind + `<Link>`. Two nav links don't warrant a NavigationMenu component (see assumption 2.5).
- **No hamburger/mobile menu:** For MVP, the header is simple enough to fit on mobile without collapsing. Two short nav links + a small button work at 375px width.

---

### 4.3 API Key Gate

**File:** `components/api-key-gate.tsx`

A Client Component that wraps page content. If no API key is in context, it renders a minimal inline form for entering and validating a key. If the key is set, it renders `{children}`.

Step 6 will replace the inline form with a full-featured `ApiKeyForm` component. The gate's structural role (check → block/allow) remains unchanged.

```typescript
"use client";

import { useState } from "react";
import { useApiKey } from "@/components/api-key-provider";

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { apiKey, setApiKey } = useApiKey();

  if (apiKey) {
    return <>{children}</>;
  }

  return <ApiKeyPrompt onValidated={setApiKey} />;
}

function ApiKeyPrompt({
  onValidated,
}: {
  onValidated: (key: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = inputValue.trim();
    if (!key) return;

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

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Enter your API key
          </h1>
          <p className="text-sm text-muted-foreground">
            An Anthropic API key is required to use this application.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="sk-ant-..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isLoading}
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isLoading ? "Validating..." : "Validate & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Design decisions:**

- **Two components in one file:** `ApiKeyGate` (structural) and `ApiKeyPrompt` (UI). They are tightly coupled — the prompt is only used by the gate. Step 6 will extract `ApiKeyPrompt` into a standalone `ApiKeyForm` component and the gate will import it instead.
- **`type="password"`** on the input: Masks the API key while typing. Prevents shoulder-surfing. The key is sensitive — treat it like a password.
- **Validation via `POST /api/key`:** Calls the existing endpoint (Step 4). On success (`{ valid: true }`), calls `onValidated(key)` which sets the key in context. On failure (`{ valid: false }`), shows an error. Network errors are caught separately.
- **Loading state:** Disables the input and button during validation. Shows "Validating..." text on the button.
- **No shadcn components:** Uses plain HTML elements styled with Tailwind classes that match the shadcn design tokens (same border, ring, and color values). This keeps Step 5 dependency-free. Step 6 replaces these with proper `<Input>` and `<Button>` from shadcn.
- **`autoFocus`:** The input gets focus on mount — the user can immediately start typing.
- **`min-h-[60vh]`:** Centers the form vertically in the available space below the header.

---

### 4.4 Root Layout (Updated)

**File:** `app/layout.tsx`

The root layout is updated with proper metadata, font variables, and the component composition described in assumption 2.3.

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiKeyProvider } from "@/components/api-key-provider";
import { Header } from "@/components/header";
import { ApiKeyGate } from "@/components/api-key-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Image-Based Product Search",
  description:
    "Upload a furniture image and find matching products from the catalog using AI-powered visual search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ApiKeyProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-6">
            <ApiKeyGate>{children}</ApiKeyGate>
          </main>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
```

**Design decisions:**

- **Still a Server Component:** No `"use client"` directive. The layout imports Client Components (`ApiKeyProvider`, `Header`, `ApiKeyGate`) but renders them as children — this is the standard Next.js pattern. Metadata and fonts are handled server-side.
- **Metadata updated:** Title changed from "Create Next App" to "Image-Based Product Search". Description reflects the app's purpose.
- **Component composition order:**
  1. `ApiKeyProvider` wraps everything — all components can access the API key context.
  2. `Header` sits above `<main>` — always visible, even when the gate is blocking content. This lets the user see the app branding and nav links.
  3. `ApiKeyGate` wraps `{children}` inside `<main>` — gates only the page content, not the header.
- **`<main>` styling:** `max-w-5xl mx-auto px-4 py-6` constrains page content width and adds padding. This matches the header's max width for visual alignment.
- **Fonts preserved:** Geist Sans and Geist Mono from the original layout — these are good defaults that pair well with shadcn/ui.

---

### 4.5 Search Page Placeholder

**File:** `app/page.tsx`

Replaces the default Next.js welcome page with a minimal placeholder for the search UI (Step 7).

```typescript
export default function SearchPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Image-Based Product Search
      </h1>
      <p className="text-muted-foreground">
        Upload a furniture image to find matching products from the catalog.
      </p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        Image upload and search results will be displayed here.
      </div>
    </div>
  );
}
```

**Design decisions:**

- **Server Component:** No `"use client"` — it's static placeholder content with no interactivity. Step 7 will add the upload area and result grid, which will require client-side components.
- **Dashed border placeholder:** Visual indication of where the upload area will go. Conventional pattern for upload drop zones.

---

### 4.6 Admin Page Placeholder

**File:** `app/admin/page.tsx`

Creates the `/admin` route with a minimal placeholder for the admin panel (Step 8).

```typescript
export default function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Admin Panel
      </h1>
      <p className="text-muted-foreground">
        Configure search parameters and system prompts.
      </p>
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        System prompt editors, parameter controls, and taxonomy display will be here.
      </div>
    </div>
  );
}
```

**Design decisions:**

- **Server Component:** Same reasoning as the search page — no interactivity in the placeholder.
- **Route:** `app/admin/page.tsx` creates the `/admin` route. No nested layout for admin — it shares the root layout (see assumption 2.4).

---

## 5. Verification

Manual verification using the Next.js dev server (`npm run dev`) and a browser.

### Test 1: Layout and navigation render correctly
1. Start the dev server.
2. Open `http://localhost:3000`.
3. **Verify:** The header shows "Furniture Search" with "Search" and "Admin" nav links.
4. **Verify:** The gate prompt ("Enter your API key") is displayed below the header.
5. **Verify:** The "Change API Key" button is NOT visible (no key set).

### Test 2: API key validation works
1. Enter a valid Anthropic API key in the gate form.
2. Click "Validate & Continue".
3. **Verify:** The button shows "Validating..." during the API call.
4. **Verify:** After successful validation, the gate disappears and the search page placeholder is shown.
5. **Verify:** The "Change API Key" button appears in the header.

### Test 3: Invalid key shows error
1. Clear the key (click "Change API Key" or refresh).
2. Enter an invalid key (e.g., `sk-ant-invalid`).
3. Click "Validate & Continue".
4. **Verify:** The error message "Invalid API key. Please check your key and try again." appears below the input.
5. **Verify:** The gate remains visible — no access to page content.

### Test 4: Navigation preserves API key
1. Enter a valid key (test 2).
2. Click "Admin" in the nav.
3. **Verify:** The admin page placeholder is shown (not the gate).
4. **Verify:** The "Admin" nav link has active styling.
5. Click "Search" in the nav.
6. **Verify:** The search page placeholder is shown (not the gate).
7. **Verify:** The "Search" nav link has active styling.
8. **Verify:** The API key was NOT lost during navigation (US-022).

### Test 5: Key is lost on page refresh
1. With a valid key set, press F5 (hard refresh).
2. **Verify:** The gate prompt reappears — the key was lost (stored in React state only).

### Test 6: Change API Key flow
1. Enter a valid key.
2. Click "Change API Key" in the header.
3. **Verify:** The gate prompt reappears.
4. **Verify:** A new key can be entered and validated.

### Test 7: Direct URL access to /admin without key
1. Open `http://localhost:3000/admin` in a new tab (no key set).
2. **Verify:** The gate prompt is shown, not the admin content.
3. **Verify:** After entering a valid key, the admin placeholder is displayed.

### Test 8: Build check
1. Run `npx tsc --noEmit` — no TypeScript errors.
2. Run `npx next lint` — no ESLint errors.

---

## 6. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Root layout renders branded header with "Furniture Search" title | Test 1 — visual check |
| 2 | Navigation contains links to `/` and `/admin` | Test 1 — visual check |
| 3 | Active nav link has distinct styling matching current pathname | Test 4 — click between links |
| 4 | `ApiKeyProvider` makes `apiKey`, `setApiKey`, `clearApiKey` available to all descendants | Test 2, 6 — setting and clearing key propagates |
| 5 | `ApiKeyGate` blocks page content when no API key is set | Test 1, 7 — gate visible without key |
| 6 | `ApiKeyGate` shows page content when API key is set | Test 2 — content visible after validation |
| 7 | Gate form validates key via `POST /api/key` before accepting it | Test 2, 3 — valid key accepted, invalid rejected |
| 8 | Gate form shows error message for invalid key | Test 3 — error message displayed |
| 9 | API key persists across client-side navigation (`/` ↔ `/admin`) | Test 4 — key not lost when switching pages (US-022) |
| 10 | API key is lost on page refresh (React state only, RF-002) | Test 5 — gate reappears after F5 |
| 11 | "Change API Key" button clears key and shows gate (US-002) | Test 6 — clearing key works |
| 12 | `/admin` route exists and shows placeholder content | Test 4, 7 — admin page renders |
| 13 | `/` route shows search placeholder content | Test 2, 4 — search page renders |
| 14 | Direct navigation to `/admin` without key shows gate | Test 7 — gate blocks direct URL access |
| 15 | `tsc --noEmit` clean | Test 8 — no TypeScript errors |
| 16 | `next lint` clean | Test 8 — no ESLint errors |

---

## 7. Out of Scope for Step 5

These items are deliberately deferred to later steps:

- **Full API Key form UI** — Step 6 (polished form with shadcn `Input`/`Button`, redirect, styled error messages, key format hints)
- **API Key format validation** — Step 6 (client-side check that key starts with `sk-ant-` before hitting the API)
- **Search UI** — Step 7 (image upload, result grid, progress indicators, NDJSON stream reader)
- **Admin UI** — Step 8 (prompt editors, numeric controls, taxonomy display)
- **Feedback UI** — Step 9 (thumbs up/down on results)
- **Error handling polish** — Step 10 (retry buttons, error boundaries, edge case messages)
- **Dark mode toggle** — Not in MVP scope
- **Responsive hamburger menu** — Not needed for two nav links
- **Loading states for page transitions** — Can be added later if needed
- **Middleware-based route protection** — Not viable with client-side key storage (see assumption 2.2)
- **Fetch wrapper/hook** — Deferred until Step 7 when multiple API calls exist (see assumption 2.6)
- **shadcn component installation** — No shadcn UI components needed in Step 5; Step 6 installs `button`, `input`, `card`, etc.
