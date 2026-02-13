import { z } from "zod";

/**
 * Feedback request schema (RF-024/RF-025).
 * Binary thumbs up/down rating per product.
 */
export const FeedbackRequestSchema = z.object({
  productId: z.string().min(1),
  rating: z.enum(["up", "down"]),
});

export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
