import { z } from "zod";

/**
 * API key validation schema (RF-003).
 * Ensures a non-empty key string is provided.
 * Actual key validation happens by calling the Anthropic API.
 */
export const ApiKeyRequestSchema = z.object({
  apiKey: z.string().min(1, { error: "API key is required" }),
});

export type ApiKeyRequest = z.infer<typeof ApiKeyRequestSchema>;
