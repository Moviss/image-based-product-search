import Anthropic from "@anthropic-ai/sdk";
import {
  ImageAnalysisResultSchema,
  type ImageAnalysisResult,
  type Product,
  type ScoredProduct,
} from "@/lib/schemas";
import { getConfig } from "@/lib/config-store";
import { getTaxonomyString } from "@/lib/taxonomy";
import { renderPrompt } from "@/lib/prompt";

const MODEL = "claude-sonnet-4-5-20250929";

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/**
 * Extracts JSON from Claude's response text.
 * Handles cases where Claude wraps JSON in markdown fences
 * despite instructions not to.
 */
function extractJSON(text: string): unknown {
  let cleaned = text.trim();

  const fenceRe = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = cleaned.match(fenceRe);
  if (match) {
    cleaned = match[1];
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Failed to parse Claude response as JSON. Raw text:\n${text}`
    );
  }
}

/**
 * Sends a base64 image to Claude Vision and returns structured
 * furniture attributes. Validates the response against
 * `ImageAnalysisResultSchema`.
 */
export async function analyzeImage(
  apiKey: string,
  imageBase64: string,
  mimeType: ImageMimeType
): Promise<ImageAnalysisResult> {
  const config = getConfig();
  const taxonomy = await getTaxonomyString();
  const systemPrompt = renderPrompt(config.imageAnalysisPrompt, { taxonomy });

  const client = createClient(apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: "Analyze this image and classify the furniture item.",
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = extractJSON(text);
  return ImageAnalysisResultSchema.parse(parsed);
}

/**
 * Sends product candidates and a reference image to Claude for
 * re-ranking. Returns scored products sorted by score descending.
 */
export async function rerankCandidates(
  apiKey: string,
  imageBase64: string,
  mimeType: ImageMimeType,
  candidates: Product[],
  userPrompt?: string
): Promise<ScoredProduct[]> {
  const config = getConfig();
  const systemPrompt = renderPrompt(config.rerankingPrompt, {
    resultsCount: config.resultsCount,
    userPrompt,
  });

  const candidatesText = formatCandidates(candidates);

  const client = createClient(apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: candidatesText,
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const parsed = extractJSON(text) as Array<{
    productId: string;
    score: number;
    justification: string;
  }>;

  const candidateMap = new Map(candidates.map((c) => [c._id, c]));

  const scored: ScoredProduct[] = [];
  for (const item of parsed) {
    const product = candidateMap.get(item.productId);
    if (!product) continue; // skip hallucinated IDs
    scored.push({
      ...product,
      score: item.score,
      justification: item.justification,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Verifies that the provided Anthropic API key is valid by making
 * a minimal API call.
 * Returns `false` for invalid keys, re-throws other errors.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  const client = createClient(apiKey);
  try {
    await client.messages.create({
      model: MODEL,
      max_tokens: 10,
      messages: [{ role: "user", content: "Hi" }],
    });
    return true;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return false;
    }
    throw error;
  }
}

/** Serializes candidates into a compact text format for the user message. */
function formatCandidates(candidates: Product[]): string {
  const lines = candidates.map(
    (c, i) =>
      `[${i + 1}] ID: ${c._id}, Title: "${c.title}", Category: ${c.category}, Type: ${c.type}, Price: $${c.price.toLocaleString()}, Dimensions: ${c.width}×${c.height}×${c.depth} cm, Description: "${c.description}"`
  );
  return `Product candidates:\n${lines.join("\n")}`;
}
