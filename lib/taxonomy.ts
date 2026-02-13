import type { TaxonomyCategory } from "@/lib/schemas";
import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/product";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { data: TaxonomyCategory[]; timestamp: number } | null = null;

/**
 * Returns the full taxonomy as structured data.
 * Cached in memory with a 5-minute TTL.
 */
export async function getTaxonomy(): Promise<TaxonomyCategory[]> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  await connectDB();

  const results = await Product.aggregate<TaxonomyCategory>([
    { $group: { _id: "$category", types: { $addToSet: "$type" } } },
    { $project: { _id: 0, category: "$_id", types: 1 } },
    { $sort: { category: 1 } },
  ]);

  // Sort types alphabetically for deterministic output
  for (const entry of results) {
    entry.types.sort();
  }

  cache = { data: results, timestamp: Date.now() };
  return results;
}

/**
 * Returns the taxonomy formatted as a string for prompt injection.
 *
 * Example output:
 * ```
 * Categories and types:
 * - Bedroom Furniture: Beds, Dressers, Nightstands, Wardrobes
 * - Living Room Furniture: Armchairs, Coffee Tables, Sofas, TV Stands
 * ```
 */
export async function getTaxonomyString(): Promise<string> {
  const taxonomy = await getTaxonomy();

  const lines = taxonomy.map(
    (entry) => `- ${entry.category}: ${entry.types.join(", ")}`
  );

  return `Categories and types:\n${lines.join("\n")}`;
}
