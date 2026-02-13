import { z } from "zod";

/**
 * Admin configuration schema for tunable system parameters (RF-029).
 * Used to validate PUT /api/admin/config body.
 * For partial updates, callers can use `AdminConfigSchema.partial()`.
 */
export const AdminConfigSchema = z.object({
  imageAnalysisPrompt: z.string().min(1, { error: "Prompt cannot be empty" }),
  rerankingPrompt: z.string().min(1, { error: "Prompt cannot be empty" }),
  resultsCount: z.number().int().min(3).max(12),
  maxCandidates: z.number().int().min(10).max(100),
  scoreThreshold: z.number().min(0).max(100),
});

export type AdminConfig = z.infer<typeof AdminConfigSchema>;
