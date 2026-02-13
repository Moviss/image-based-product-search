/**
 * Step 2 verification script — tests Claude service end-to-end.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY in environment (or .env.local)
 *   - A test furniture image at scripts/test-chair.{jpg,png,webp}
 *   - MongoDB connection via MONGODB_URI in .env.local
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-step2.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeImage, rerankCandidates, validateApiKey } from "@/lib/claude";
import { getTaxonomy, getTaxonomyString } from "@/lib/taxonomy";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/product";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable.");
  process.exit(1);
}
const API_KEY: string = process.env.ANTHROPIC_API_KEY;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPPORTED_EXTENSIONS: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const imageFile = Object.keys(SUPPORTED_EXTENSIONS)
  .map((ext) => path.join(__dirname, `test-chair${ext}`))
  .find((p) => fs.existsSync(p));

if (!imageFile) {
  console.error("Missing test image. Place a furniture photo at scripts/test-chair.{jpg,png,webp}");
  process.exit(1);
}

const mimeType = SUPPORTED_EXTENSIONS[path.extname(imageFile)];
const imageBase64 = fs.readFileSync(imageFile).toString("base64");
console.log(`Using image: ${path.basename(imageFile)} (${mimeType})\n`);

async function main() {
  // --- Taxonomy cache ---
  console.log("0. Testing taxonomy cache...");
  const t0 = Date.now();
  const taxonomy = await getTaxonomy();
  const firstCallMs = Date.now() - t0;
  console.log(
    `   Fetched ${taxonomy.length} categories (${firstCallMs}ms)`
  );

  const t1 = Date.now();
  await getTaxonomy();
  const secondCallMs = Date.now() - t1;
  console.log(
    `   Second call (cached): ${secondCallMs}ms`
  );

  const taxonomyStr = await getTaxonomyString();
  console.log(`   Preview: ${taxonomyStr.slice(0, 120)}...`);
  console.log("   \u2713 Taxonomy fetched and cached\n");

  // --- analyzeImage ---
  console.log("1. Testing analyzeImage...");
  const analysis = await analyzeImage(API_KEY, imageBase64, mimeType);
  console.log(`   Result: ${JSON.stringify(analysis, null, 2)}`);

  if (!analysis.isFurniture) {
    console.log(
      "   \u26a0 Image classified as non-furniture — skipping rerank test."
    );
    console.log(
      "   Use a clear furniture photo for full verification.\n"
    );
  } else {
    console.log("   \u2713 Image classified as furniture\n");

    // --- rerankCandidates ---
    console.log("2. Testing rerankCandidates...");
    await connectDB();

    const filter: Record<string, string> = {};
    if (analysis.category) filter.category = analysis.category;

    const candidates = await Product.find(filter)
      .limit(10)
      .lean<Array<{ _id: unknown; title: string; description: string; category: string; type: string; price: number; width: number; height: number; depth: number }>>();

    const products = candidates.map((c) => ({
      ...c,
      _id: String(c._id),
    }));

    console.log(`   Found ${products.length} candidates for re-ranking`);

    const scored = await rerankCandidates(
      API_KEY,
      imageBase64,
      mimeType,
      products
    );

    for (const item of scored) {
      console.log(
        `   #${scored.indexOf(item) + 1} [Score: ${item.score}] ${item.title} — "${item.justification}"`
      );
    }
    console.log(
      `   \u2713 Re-ranking returned ${scored.length} scored results\n`
    );
  }

  // --- validateApiKey (valid) ---
  console.log("3. Testing validateApiKey (valid key)...");
  const validResult = await validateApiKey(API_KEY);
  if (validResult) {
    console.log("   \u2713 Valid key accepted\n");
  } else {
    console.error("   \u2717 Valid key was rejected!");
    process.exit(1);
  }

  // --- validateApiKey (invalid) ---
  console.log("4. Testing validateApiKey (invalid key)...");
  const invalidResult = await validateApiKey("sk-ant-invalid-key-12345");
  if (!invalidResult) {
    console.log("   \u2713 Invalid key rejected\n");
  } else {
    console.error("   \u2717 Invalid key was accepted!");
    process.exit(1);
  }

  console.log("Step 2 verification complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
