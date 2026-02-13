# Step 2.5 — Promptfoo Setup + Prompt Evaluation

## 1. Overview

This step introduces [promptfoo](https://www.promptfoo.dev/) as the offline evaluation framework for measuring prompt quality against the PRD success metrics. The primary focus is on evaluating the **image analysis prompt** — the component with the greatest impact on end-to-end search accuracy, since misclassification at this stage cascades through the entire pipeline (wrong MongoDB query → irrelevant candidates → poor re-ranking).

Promptfoo enables:

- **Automated testing** of prompt variants against a fixed set of test images with expected labels
- **Quantitative metrics** — Category Accuracy and Type Accuracy mapped directly from PRD targets (>85% and >70%)
- **Side-by-side comparison** of prompt variants in an interactive web dashboard
- **Regression detection** — run eval before and after prompt changes to prevent quality degradation
- **Cost and latency tracking** per API call

The evaluation runs as a standalone CLI command (`npm run eval`), independent of the Next.js dev server. It uses `ANTHROPIC_API_KEY` from `.env.local` and connects to MongoDB for taxonomy data only during the one-time setup step.

---

## 2. Assumptions

1. **Test images are developer-provided.** The PRD lists "Generating or sourcing test images" as out of scope. This plan defines 12 test cases with filenames and expected labels; the developer must manually source the actual JPEG/PNG/WebP images (royalty-free stock photos, personal photos, or screenshots of furniture). Each image should be under 1 MB.

2. **Taxonomy is stable.** The MongoDB taxonomy (15 categories, 63 types) does not change during development. We pre-fetch it once via a setup script and store it as a static text fixture. If the database changes, re-run `npm run eval:setup`.

3. **Promptfoo Nunjucks templating is compatible.** Promptfoo uses Nunjucks-style `{{variable}}` substitution in prompt files. Our prompt templates contain `{{taxonomy}}` as the only double-brace variable — all other content uses single braces (JSON examples) or angle brackets (placeholders), which do not conflict with Nunjucks syntax. Promptfoo substitutes `{{taxonomy}}` with the pre-fetched taxonomy text before passing the prompt to the provider.

4. **Custom provider is required.** The built-in `anthropic:messages:*` provider does not natively support the pattern we need: system prompt (from prompt file) + multimodal user message (image + text instruction). A lightweight custom TypeScript provider wraps a single Anthropic API call. It is self-contained — no imports from `lib/` — to avoid tsconfig path alias issues with promptfoo's module loader.

5. **`file://` image loading.** Promptfoo automatically detects image files referenced via `file://path/to/image.jpg` in test variables and converts them to base64 strings. The provider receives raw base64 data suitable for the Anthropic API.

6. **API cost per eval run.** Each image analysis call costs ~$0.01–0.03 (Claude Sonnet, 1 image input + ~200 output tokens). A full eval of 12 test cases × 1 prompt variant = 12 calls ≈ $0.12–0.36. With 2 prompt variants: ~$0.24–0.72. Acceptable for development iteration.

7. **Re-ranking prompt evaluation is deferred.** Testing the re-ranking prompt in isolation requires pre-fetched candidate product sets from MongoDB as fixtures, which adds significant complexity. The primary goal of this step is to establish baseline metrics for the image analysis prompt. Re-ranking evaluation can be added later as an extension to this framework.

---

## 3. File Structure

```
New files:
  prompts/
    image-analysis.txt                    # Versioned image analysis prompt template
    reranking.txt                         # Versioned re-ranking prompt template (for reference)
  promptfoo/
    providers/
      image-analysis.ts                   # Custom provider: system prompt + image → Claude Vision
    test-images/
      .gitkeep                            # Developer places test images here
    test-cases.yaml                       # Test case definitions with expected labels
  promptfooconfig.yaml                    # Main promptfoo configuration (project root)
  scripts/setup-promptfoo.ts              # Generates taxonomy fixture, validates setup

Modified files:
  lib/config-store.ts                     # Load default prompts from prompts/*.txt instead of hardcoded strings
  package.json                            # Add promptfoo devDependency + eval scripts
  .gitignore                              # Add promptfoo output/cache files

Existing files (unchanged):
  lib/claude.ts                           # analyzeImage (tested indirectly via same API pattern)
  lib/prompt.ts                           # renderPrompt (not used by provider — promptfoo handles substitution)
  lib/taxonomy.ts                         # getTaxonomyString (used by setup script only)
```

---

## 4. Implementation Tasks

### 4.1 Install promptfoo and add npm scripts

Install promptfoo as a dev dependency:

```bash
npm install -D promptfoo
```

Add evaluation scripts to `package.json`:

```json
{
  "scripts": {
    "eval:setup": "npx tsx --env-file=.env.local scripts/setup-promptfoo.ts",
    "eval": "npx promptfoo eval",
    "eval:view": "npx promptfoo view"
  }
}
```

**Workflow:** `npm run eval:setup` (once) → `npm run eval` (iterate) → `npm run eval:view` (compare).

---

### 4.2 Extract prompt files as single source of truth

Move the default prompt templates from hardcoded strings in `config-store.ts` into versioned text files. Both the application and promptfoo read from the same files — **one source of truth, zero risk of divergence.**

**File:** `prompts/image-analysis.txt`

Move `DEFAULT_IMAGE_ANALYSIS_PROMPT` from `lib/config-store.ts:8-28` verbatim into this file. The `{{taxonomy}}` placeholder is substituted at runtime by `renderPrompt()` (application) or by promptfoo's Nunjucks templating (evaluation).

**File:** `prompts/reranking.txt`

Move `DEFAULT_RERANKING_PROMPT` from `lib/config-store.ts:36-56` verbatim into this file. Not used by the evaluation in this step, but versioned for future re-ranking evaluation.

**Modify:** `lib/config-store.ts`

Replace the hardcoded prompt string literals with `fs.readFileSync()` calls that load from `prompts/*.txt` at module initialization:

```typescript
import fs from "node:fs";
import path from "node:path";
import type { AdminConfig } from "@/lib/schemas";

const DEFAULT_IMAGE_ANALYSIS_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "prompts", "image-analysis.txt"),
  "utf-8"
);

const DEFAULT_RERANKING_PROMPT = fs.readFileSync(
  path.join(process.cwd(), "prompts", "reranking.txt"),
  "utf-8"
);

// ... rest of config-store unchanged
```

This runs once at module load time (server-side only — `config-store.ts` is never imported by client components). `process.cwd()` in Next.js always points to the project root. The admin panel can still override prompts at runtime via `updateConfig()`, but every server restart resets defaults to the file contents.

**Creating prompt variants for evaluation:** To test a modified prompt, copy `image-analysis.txt` to `image-analysis-v2.txt`, make changes, and add the new file to the `prompts` list in `promptfooconfig.yaml`. Promptfoo will evaluate both variants against all test cases and display the comparison in the dashboard. If v2 wins, replace the contents of `image-analysis.txt` — the app picks up the change on next restart automatically.

---

### 4.3 Taxonomy fixture setup script

**File:** `scripts/setup-promptfoo.ts`

This script connects to MongoDB, fetches the live taxonomy, and saves it as a static text file. Promptfoo reads this file at eval time and injects it into the `{{taxonomy}}` placeholder in the prompt template.

```typescript
/**
 * Promptfoo setup — fetches taxonomy from MongoDB and saves as a fixture.
 *
 * Usage:
 *   npm run eval:setup
 *   (or: npx tsx --env-file=.env.local scripts/setup-promptfoo.ts)
 */

import fs from "node:fs";
import path from "node:path";
import { connectDB } from "@/lib/db";
import { getTaxonomyString, getTaxonomy } from "@/lib/taxonomy";
import mongoose from "mongoose";

async function main() {
  const root = process.cwd();

  // 1. Fetch taxonomy from MongoDB
  console.log("Fetching taxonomy from MongoDB...");
  await connectDB();
  const taxonomy = await getTaxonomy();
  const taxonomyString = await getTaxonomyString();

  // 2. Save taxonomy fixture
  const fixturesDir = path.join(root, "promptfoo", "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(
    path.join(fixturesDir, "taxonomy.txt"),
    taxonomyString
  );

  const totalTypes = taxonomy.reduce((sum, c) => sum + c.types.length, 0);
  console.log(
    `  ✓ Taxonomy saved: ${taxonomy.length} categories, ${totalTypes} types`
  );
  console.log(`    → promptfoo/fixtures/taxonomy.txt`);

  // 3. Print taxonomy for test case reference
  console.log("\nAvailable categories and types (for test case labeling):");
  for (const entry of taxonomy) {
    console.log(`  ${entry.category}:`);
    console.log(`    ${entry.types.join(", ")}`);
  }

  // 4. Check test images directory
  const imagesDir = path.join(root, "promptfoo", "test-images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const images = fs
    .readdirSync(imagesDir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  if (images.length === 0) {
    console.log("\n⚠  No test images found in promptfoo/test-images/");
    console.log("   Add 10-15 furniture images to run the evaluation.");
    console.log("   See promptfoo/test-cases.yaml for required filenames.");
  } else {
    console.log(`\n  ✓ Found ${images.length} test image(s)`);
  }

  await mongoose.disconnect();
  console.log("\nSetup complete. Run: npm run eval");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
```

**Note:** Uses `@/lib/...` imports — same pattern as the existing `scripts/verify-step2.ts`, which resolves via tsconfig `paths` with tsx.

The script also prints the full taxonomy to the console so the developer can verify and adjust expected labels in the test cases.

---

### 4.4 Custom image analysis provider

**File:** `promptfoo/providers/image-analysis.ts`

A self-contained provider that takes a rendered system prompt (with taxonomy already injected by promptfoo) and an image (base64 from `file://` test variable), calls Claude Vision, and returns the raw JSON text.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";

const MODEL = "claude-sonnet-4-5-20250929";

export default class ImageAnalysisProvider implements ApiProvider {
  private modelId: string;
  private maxTokens: number;

  constructor(options: ProviderOptions) {
    this.modelId = (options.config?.model as string) || MODEL;
    this.maxTokens = (options.config?.max_tokens as number) || 1024;
  }

  id(): string {
    return `image-analysis:${this.modelId}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams
  ): Promise<ProviderResponse> {
    const imageBase64 = context?.vars?.image as string;
    const mimeType =
      (context?.vars?.mimeType as string) || "image/jpeg";

    if (!imageBase64) {
      return { error: "Missing 'image' variable in test case" };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "Missing ANTHROPIC_API_KEY environment variable" };
    }

    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create({
        model: this.modelId,
        max_tokens: this.maxTokens,
        system: prompt, // Rendered system prompt from promptfoo (taxonomy already injected)
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/webp",
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Analyze this image and classify the furniture item.",
              },
            ],
          },
        ],
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        output: text,
        tokenUsage: {
          total:
            response.usage.input_tokens +
            response.usage.output_tokens,
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
        },
      };
    } catch (err) {
      return {
        error: `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
```

**Design decisions:**

- **Self-contained** — imports only from `@anthropic-ai/sdk` and `promptfoo` (both in `node_modules`). No imports from `lib/` avoids tsconfig path alias issues when promptfoo loads the provider via its own module system.
- **`prompt` parameter = system prompt** — promptfoo reads the prompt file, substitutes `{{taxonomy}}`, and passes the rendered text as the `prompt` argument. The provider uses it directly as the `system` parameter in the Anthropic API call.
- **Image from `context.vars`** — the base64 image data comes from the test case variable, automatically converted from `file://` by promptfoo.
- **Configurable model** — `options.config.model` allows testing with different Claude models without changing the provider code.
- **Error handling** — returns `{ error: "..." }` instead of throwing, so promptfoo can report the failure gracefully in the dashboard.

---

### 4.5 Test case definitions

**File:** `promptfoo/test-cases.yaml`

Defines 12 test cases: 10 furniture images covering diverse categories + 2 non-furniture images. Each case specifies the expected classification results.

```yaml
# Test cases for image analysis prompt evaluation.
#
# The developer must place the corresponding image files in promptfoo/test-images/.
# Expected category/type values must match the MongoDB taxonomy exactly.
# Run `npm run eval:setup` to see all valid categories and types.

# --- Furniture images (10 cases) ---

- description: "Modern fabric sofa"
  vars:
    image: file://promptfoo/test-images/modern-sofa.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Living Room Furniture"
    expectedType: "Sofas"

- description: "Wooden dining chair"
  vars:
    image: file://promptfoo/test-images/dining-chair.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Dining Room Furniture"
    expectedType: "Dining Chairs"

- description: "Office desk"
  vars:
    image: file://promptfoo/test-images/office-desk.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Office Furniture"
    expectedType: "Desks"

- description: "King-size bed"
  vars:
    image: file://promptfoo/test-images/bed.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Bedroom Furniture"
    expectedType: "Beds"

- description: "Wooden bookshelf"
  vars:
    image: file://promptfoo/test-images/bookshelf.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Storage Furniture"
    expectedType: "Bookshelves"

- description: "Glass coffee table"
  vars:
    image: file://promptfoo/test-images/coffee-table.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Living Room Furniture"
    expectedType: "Coffee Tables"

- description: "Bedside nightstand"
  vars:
    image: file://promptfoo/test-images/nightstand.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Bedroom Furniture"
    expectedType: "Nightstands"

- description: "Large wardrobe"
  vars:
    image: file://promptfoo/test-images/wardrobe.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Bedroom Furniture"
    expectedType: "Wardrobes"

- description: "Wooden dining table"
  vars:
    image: file://promptfoo/test-images/dining-table.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Dining Room Furniture"
    expectedType: "Dining Tables"

- description: "Leather armchair"
  vars:
    image: file://promptfoo/test-images/armchair.jpg
    mimeType: image/jpeg
    expectedIsFurniture: true
    expectedCategory: "Living Room Furniture"
    expectedType: "Armchairs"

# --- Non-furniture images (2 cases) ---

- description: "Landscape photo (not furniture)"
  vars:
    image: file://promptfoo/test-images/landscape.jpg
    mimeType: image/jpeg
    expectedIsFurniture: false
    expectedCategory: null
    expectedType: null

- description: "Car photo (not furniture)"
  vars:
    image: file://promptfoo/test-images/car.jpg
    mimeType: image/jpeg
    expectedIsFurniture: false
    expectedCategory: null
    expectedType: null
```

**Important notes:**

- The expected `category` and `type` values above are **provisional** — they must match the actual MongoDB taxonomy exactly. After running `npm run eval:setup`, the script prints all valid categories and types. Adjust the expected values in this file accordingly.
- The image filenames are a convention. The developer can use any name as long as the `vars.image` path matches the actual file.
- More test cases can be added over time. The framework supports YAML arrays of any length.
- For PNG or WebP images, update the `mimeType` field accordingly.

---

### 4.6 Promptfoo configuration

**File:** `promptfooconfig.yaml` (project root)

```yaml
description: "Image analysis prompt evaluation — furniture classification accuracy"

providers:
  - id: file://promptfoo/providers/image-analysis.ts
    label: "Claude Sonnet (image analysis)"
    config:
      model: claude-sonnet-4-5-20250929
      max_tokens: 1024

prompts:
  - id: file://prompts/image-analysis.txt
    label: "v1: baseline"

# Test cases loaded from external file
tests: file://promptfoo/test-cases.yaml

# Default assertions applied to every test case
defaultTest:
  vars:
    # Pre-fetched taxonomy injected into {{taxonomy}} placeholder in prompts
    taxonomy: file://promptfoo/fixtures/taxonomy.txt
  assert:
    # 1. Output must be valid JSON
    - type: is-json
      weight: 1
      metric: json-valid

    # 2. JSON must match expected schema
    - type: javascript
      weight: 1
      metric: schema-valid
      value: |
        const parsed = JSON.parse(output);
        if (typeof parsed.isFurniture !== 'boolean') return { pass: false, reason: 'missing isFurniture field' };
        if (parsed.isFurniture) {
          if (!parsed.category || !parsed.type) return { pass: false, reason: 'furniture=true but missing category/type' };
        }
        return { pass: true, score: 1 };

    # 3. Furniture detection — does isFurniture match expected?
    - type: javascript
      weight: 2
      metric: furniture-detection
      value: |
        const parsed = JSON.parse(output);
        const expected = context.vars.expectedIsFurniture;
        const pass = parsed.isFurniture === expected;
        return {
          pass,
          score: pass ? 1 : 0,
          reason: pass
            ? `Correctly classified as ${expected ? 'furniture' : 'non-furniture'}`
            : `Expected isFurniture=${expected}, got ${parsed.isFurniture}`
        };

    # 4. Category accuracy — does category match expected? (only for furniture images)
    - type: javascript
      weight: 2
      metric: category-accuracy
      value: |
        const parsed = JSON.parse(output);
        if (context.vars.expectedIsFurniture === false) {
          return { pass: true, score: 1, reason: 'Non-furniture — category check skipped' };
        }
        const pass = parsed.category === context.vars.expectedCategory;
        return {
          pass,
          score: pass ? 1 : 0,
          reason: pass
            ? `Category correct: "${parsed.category}"`
            : `Expected "${context.vars.expectedCategory}", got "${parsed.category}"`
        };

    # 5. Type accuracy — does type match expected? (only for furniture images)
    - type: javascript
      weight: 2
      metric: type-accuracy
      value: |
        const parsed = JSON.parse(output);
        if (context.vars.expectedIsFurniture === false) {
          return { pass: true, score: 1, reason: 'Non-furniture — type check skipped' };
        }
        const pass = parsed.type === context.vars.expectedType;
        return {
          pass,
          score: pass ? 1 : 0,
          reason: pass
            ? `Type correct: "${parsed.type}"`
            : `Expected "${context.vars.expectedType}", got "${parsed.type}"`
        };

    # 6. Latency bound — single API call should complete within 15 seconds
    - type: latency
      threshold: 15000
      weight: 0

    # 7. Cost bound — single image analysis call should cost under $0.05
    - type: cost
      threshold: 0.05
      weight: 0

# Execution settings
evaluateOptions:
  maxConcurrency: 2       # Avoid Anthropic rate limits
  cache: true             # Cache responses to avoid re-running unchanged test cases
  delay: 1000             # 1s delay between calls (rate limit safety)

outputPath: ./promptfoo-output.json
```

**How prompt variant comparison works:**

To compare a modified prompt, add a second entry to the `prompts` list:

```yaml
prompts:
  - id: file://prompts/image-analysis.txt
    label: "v1: baseline"
  - id: file://prompts/image-analysis-v2.txt
    label: "v2: stricter style vocabulary"
```

Promptfoo creates a matrix of (prompts × providers × tests). With 2 prompts, 1 provider, and 12 tests = 24 eval calls. The dashboard shows side-by-side results with aggregate pass rates per prompt variant.

---

### 4.7 .gitignore additions

Add the following entries to `.gitignore`:

```
# promptfoo
promptfoo/fixtures/
promptfoo-output.json
.promptfoo/
```

- `promptfoo/fixtures/` — generated taxonomy data, regenerated by `npm run eval:setup`
- `promptfoo-output.json` — evaluation results
- `.promptfoo/` — promptfoo's internal cache directory

Test images in `promptfoo/test-images/` are **not** gitignored — once sourced, they should be committed for reproducible evaluation. At ~100 KB each × 12 images ≈ 1.2 MB — acceptable repo size.

---

## 5. Metrics Mapping (PRD → Promptfoo)

| PRD Metric | PRD Target | Promptfoo Named Metric | Assertion Logic | Scope |
|---|---|---|---|---|
| Category Accuracy | >85% | `category-accuracy` | `parsed.category === expectedCategory` | Image analysis |
| Type Accuracy | >70% | `type-accuracy` | `parsed.type === expectedType` | Image analysis |
| Not-furniture Classification | 100% | `furniture-detection` | `parsed.isFurniture === expectedIsFurniture` | Image analysis |
| Precision@6 | >60% | — | Requires full pipeline (analyze → query → rerank) | Deferred to Step 3+ |
| End-to-end Response Time | <8s | `latency` (per step) | `threshold: 15000` (single step) | Partial |

**How to read the metrics after eval:**

```bash
npm run eval        # Run evaluation
npm run eval:view   # Open dashboard → Metrics tab shows aggregate pass rates
```

The dashboard displays each named metric's pass rate across all test cases. For example, if `category-accuracy` passes 9 out of 10 furniture test cases, the aggregate is 90% — above the PRD target of 85%.

**Important:** These metrics measure the **image analysis prompt** in isolation, not the full search pipeline. Category Accuracy and Type Accuracy at this stage are leading indicators — if the analysis prompt classifies correctly, the downstream MongoDB query and re-ranking have a strong foundation.

---

## 6. Workflow: Running an Evaluation

### First-time setup

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Generate taxonomy fixture
npm run eval:setup
# → Prints all valid categories and types
# → Saves promptfoo/fixtures/taxonomy.txt

# 3. Add test images
# Place 12 images in promptfoo/test-images/ matching the filenames in test-cases.yaml.
# Adjust expectedCategory and expectedType in test-cases.yaml to match the actual
# taxonomy printed by the setup script.

# 4. Run evaluation
npm run eval

# 5. View results in browser
npm run eval:view
```

### Prompt iteration cycle

```bash
# 1. Copy the current prompt and modify it
cp prompts/image-analysis.txt prompts/image-analysis-v2.txt
# Edit v2 with your changes

# 2. Add v2 to promptfooconfig.yaml prompts list

# 3. Run evaluation (both variants evaluated)
npm run eval

# 4. Compare results in dashboard
npm run eval:view
# → Side-by-side comparison shows which variant performs better

# 5. If v2 is better, replace the contents of prompts/image-analysis.txt
#    The app picks up the change on next restart — no other file to update
```

### Useful CLI options

```bash
# Run only the first 3 test cases (quick iteration)
npx promptfoo eval --filter-first-n 3

# Force fresh API calls (ignore cache)
npx promptfoo eval --no-cache

# Filter test cases by description
npx promptfoo eval --filter-pattern "sofa"

# Repeat each test 3 times (check consistency)
npx promptfoo eval --repeat 3
```

---

## 7. Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | `promptfoo` is installed as a devDependency | `npm ls promptfoo` shows the package |
| 2 | `npm run eval:setup` connects to MongoDB and saves taxonomy fixture | File exists at `promptfoo/fixtures/taxonomy.txt` with categories and types |
| 3 | `config-store.ts` loads defaults from `prompts/*.txt` files | No hardcoded prompt strings in `config-store.ts`; `fs.readFileSync` reads from `prompts/` |
| 4 | Custom provider calls Claude Vision and returns JSON text | `npx promptfoo eval --filter-first-n 1` runs successfully |
| 5 | All default assertions pass for a correctly labeled furniture image | Dashboard shows green for `json-valid`, `schema-valid`, `furniture-detection`, `category-accuracy`, `type-accuracy` |
| 6 | Non-furniture test case returns `isFurniture: false` | Dashboard shows `furniture-detection` pass for non-furniture images |
| 7 | Named metrics are aggregated in the dashboard | `npm run eval:view` → Metrics tab shows `category-accuracy`, `type-accuracy`, `furniture-detection` pass rates |
| 8 | Prompt variant comparison works | Adding a second prompt file to `prompts` list → dashboard shows side-by-side comparison |
| 9 | Only `lib/config-store.ts` is modified in `lib/` | Change limited to replacing hardcoded strings with `fs.readFileSync` from `prompts/` |
| 10 | `tsc --noEmit` still clean | No new TypeScript errors introduced |

---

## 8. Out of Scope for Step 2.5

These items are deliberately deferred:

- **Re-ranking prompt evaluation** — Requires pre-fetched candidate product fixtures from MongoDB and a separate custom provider. Can be added as a second `promptfooconfig.rerank.yaml` configuration later.
- **Precision@K metric** — Requires the full search pipeline (image analysis → MongoDB query → re-ranking). Will be measurable after Step 3 (search pipeline) is implemented.
- **`promptfoo redteam`** — Adversarial prompt injection testing is planned for Step 10 (polish + red teaming).
- **CI integration** — Running eval in CI requires test images and API keys in the CI environment. Out of scope for local development MVP.
- **Automated image sourcing** — No scripts to download test images. The developer sources them manually.
- **Build-time prompt validation** — No automated check that prompt files contain required placeholders (e.g., `{{taxonomy}}`). The developer is responsible for keeping placeholders intact when editing prompts.
