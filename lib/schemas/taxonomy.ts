import { z } from "zod";

/**
 * Single taxonomy category with its associated product types.
 * Used in GET /api/admin/taxonomy response (RF-030).
 */
export const TaxonomyCategorySchema = z.object({
  category: z.string(),
  types: z.array(z.string()),
});

export type TaxonomyCategory = z.infer<typeof TaxonomyCategorySchema>;

/** Full taxonomy response — array of categories with their types. */
export const TaxonomyResponseSchema = z.array(TaxonomyCategorySchema);

export type TaxonomyResponse = z.infer<typeof TaxonomyResponseSchema>;
