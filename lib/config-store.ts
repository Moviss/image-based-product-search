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

const DEFAULT_CONFIG: AdminConfig = {
  imageAnalysisPrompt: DEFAULT_IMAGE_ANALYSIS_PROMPT,
  rerankingPrompt: DEFAULT_RERANKING_PROMPT,
  resultsCount: 6,
  maxCandidates: 50,
  scoreThreshold: 0,
};

/**
 * Cache config on globalThis to survive Next.js dev-server module
 * re-evaluations (same pattern as lib/db.ts for Mongoose connection).
 */
const g = globalThis as typeof globalThis & { __adminConfig?: AdminConfig };
if (!g.__adminConfig) {
  g.__adminConfig = { ...DEFAULT_CONFIG };
}

/** Returns a shallow copy of the current config (prevents external mutation). */
export function getConfig(): AdminConfig {
  return { ...g.__adminConfig! };
}

/**
 * Merges partial updates into the current config.
 * The Route Handler (Step 4) validates the full merged result
 * with `AdminConfigSchema.parse()` before calling this.
 */
export function updateConfig(updates: Partial<AdminConfig>): AdminConfig {
  g.__adminConfig = { ...g.__adminConfig!, ...updates };
  return { ...g.__adminConfig };
}
