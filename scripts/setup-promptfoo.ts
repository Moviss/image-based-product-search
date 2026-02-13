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
    `  Taxonomy saved: ${taxonomy.length} categories, ${totalTypes} types`
  );
  console.log(`    -> promptfoo/fixtures/taxonomy.txt`);

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
    console.log("\nNo test images found in promptfoo/test-images/");
    console.log("   Add 10-15 furniture images to run the evaluation.");
    console.log("   See promptfoo/test-cases.yaml for required filenames.");
  } else {
    console.log(`\n  Found ${images.length} test image(s)`);
  }

  await mongoose.disconnect();
  console.log("\nSetup complete. Run: npm run eval");
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
