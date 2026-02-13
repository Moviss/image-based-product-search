import { z } from "zod";

/**
 * Schema for a product document from the MongoDB `products` collection.
 * `_id` is serialized as string (from ObjectId via `.lean()` + `.toString()`).
 */
export const ProductSchema = z.object({
  _id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  type: z.string(),
  price: z.number(),
  width: z.number(),
  height: z.number(),
  depth: z.number(),
});

export type Product = z.infer<typeof ProductSchema>;

/**
 * Product enriched with a relevance score (0-100) and AI justification
 * after the re-ranking phase.
 */
export const ScoredProductSchema = ProductSchema.extend({
  score: z.number().min(0).max(100),
  justification: z.string(),
});

export type ScoredProduct = z.infer<typeof ScoredProductSchema>;
