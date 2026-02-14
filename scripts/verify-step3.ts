/**
 * Step 3 verification — search pipeline end-to-end.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-step3.ts
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env.local
 *   - MONGODB_URI in .env.local
 *   - Test images in promptfoo/test-images/
 */

import fs from "node:fs";
import path from "node:path";
import { searchPhase1, searchPhase2 } from "@/lib/search-pipeline";
import type { SearchInput } from "@/lib/search-pipeline";
import { getConfig } from "@/lib/config-store";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable.");
  process.exit(1);
}

const API_KEY: string = process.env.ANTHROPIC_API_KEY;

function loadImage(relativePath: string): { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" } {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing test image: ${relativePath}`);
    process.exit(1);
  }
  const base64 = fs.readFileSync(fullPath).toString("base64");
  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return { base64, mimeType: mimeMap[ext] ?? "image/jpeg" };
}

async function main() {
  const config = getConfig();

  // --- 1. Phase 1: furniture image ---
  console.log("1. Testing searchPhase1 (furniture image)...");
  const sofa = loadImage("promptfoo/test-images/modern-sofa.jpg");
  const input: SearchInput = {
    apiKey: API_KEY,
    imageBase64: sofa.base64,
    mimeType: sofa.mimeType,
  };

  const phase1 = await searchPhase1(input);
  console.log(`   Analysis: isFurniture=${phase1.analysis.isFurniture}, category=${phase1.analysis.category}, type=${phase1.analysis.type}`);

  if (!phase1.isFurniture) {
    console.error("   ✗ Expected furniture classification for sofa image!");
    process.exit(1);
  }

  const { candidates } = phase1;
  console.log(`   Candidates: ${candidates.length} products (max: ${config.maxCandidates})`);

  // Verify _id is string
  if (candidates.length > 0 && typeof candidates[0]._id !== "string") {
    console.error("   ✗ candidates[0]._id is not a string!");
    process.exit(1);
  }

  // Breakdown by type and category
  const typeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const c of candidates) {
    typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
    categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
  }

  console.log("   Breakdown by type:");
  for (const [type, count] of typeCounts) {
    console.log(`     - ${count} × "${type}"`);
  }
  console.log("   Breakdown by category:");
  for (const [category, count] of categoryCounts) {
    console.log(`     - ${count} × "${category}"`);
  }

  console.log(`   ✓ Phase 1 returned furniture analysis + ${candidates.length} candidates\n`);

  // --- 2. Phase 2: re-ranking ---
  console.log("2. Testing searchPhase2 (re-ranking)...");
  const results = await searchPhase2(input, candidates);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`   #${i + 1} [Score: ${r.score}] ${r.title} — "${r.justification}"`);
  }

  // Verify sorted descending
  for (let i = 1; i < results.length; i++) {
    if (results[i].score > results[i - 1].score) {
      console.error("   ✗ Results not sorted by score descending!");
      process.exit(1);
    }
  }

  // Verify scores 0-100
  for (const r of results) {
    if (r.score < 0 || r.score > 100) {
      console.error(`   ✗ Score out of range: ${r.score}`);
      process.exit(1);
    }
  }

  console.log(`   ✓ Phase 2 returned ${results.length} scored results (sorted desc)\n`);

  // --- 3. Edge case: non-furniture image ---
  console.log("3. Testing searchPhase1 (non-furniture image)...");
  const landscape = loadImage("promptfoo/test-images/landscape.jpg");
  const nonFurnitureInput: SearchInput = {
    apiKey: API_KEY,
    imageBase64: landscape.base64,
    mimeType: landscape.mimeType,
  };

  const nonFurnitureResult = await searchPhase1(nonFurnitureInput);
  console.log(`   Analysis: isFurniture=${nonFurnitureResult.analysis.isFurniture}`);

  if (nonFurnitureResult.isFurniture) {
    console.error("   ✗ Expected non-furniture classification for landscape image!");
    process.exit(1);
  }

  console.log("   ✓ Correctly classified as non-furniture, no candidates\n");

  console.log("Step 3 verification complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
