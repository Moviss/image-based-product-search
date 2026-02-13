import { z } from "zod";

/** Accepted image MIME types for upload (RF-004, RF-005). */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Maximum image file size in bytes (10 MB). */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum length of the optional text prompt. */
export const MAX_PROMPT_LENGTH = 500;

/**
 * Validates the text fields from the search FormData.
 * The image File itself is validated imperatively (type + size)
 * since Zod has no built-in File type.
 */
export const SearchRequestSchema = z.object({
  prompt: z.string().max(MAX_PROMPT_LENGTH).optional(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * Structured output from Claude Vision image analysis (RF-010).
 * When `isFurniture` is false, all other fields are null.
 */
export const ImageAnalysisResultSchema = z.object({
  isFurniture: z.boolean(),
  category: z.string().nullable(),
  type: z.string().nullable(),
  style: z.string().nullable(),
  material: z.string().nullable(),
  color: z.string().nullable(),
  priceRange: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .nullable(),
});

export type ImageAnalysisResult = z.infer<typeof ImageAnalysisResultSchema>;
