import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";

const MODEL = "claude-sonnet-4-5-20250929";

interface Candidate {
  _id: string;
  title: string;
  description: string;
  category: string;
  type: string;
  price: number;
  width: number;
  height: number;
  depth: number;
}

/**
 * Minimal prompt renderer — handles {{resultsCount}} and
 * {{#userPrompt}}...{{/userPrompt}} conditional blocks.
 * Self-contained (no @/lib/ imports) per project convention.
 */
function renderPrompt(
  template: string,
  vars: { resultsCount: number; userPrompt?: string }
): string {
  let result = template;

  result = result.replaceAll("{{resultsCount}}", String(vars.resultsCount));

  const conditionalRe =
    /\{\{#userPrompt\}\}([\s\S]*?)\{\{\/userPrompt\}\}/g;

  if (vars.userPrompt) {
    result = result.replace(conditionalRe, (_match, inner: string) =>
      inner.replaceAll("{{userPrompt}}", vars.userPrompt!)
    );
  } else {
    result = result.replace(conditionalRe, "");
  }

  return result;
}

/** Formats candidates into the same compact text format used by lib/claude.ts */
function formatCandidates(candidates: Candidate[]): string {
  const lines = candidates.map(
    (c, i) =>
      `[${i + 1}] ID: ${c._id}, Title: "${c.title}", Category: ${c.category}, Type: ${c.type}, Price: $${c.price.toLocaleString()}, Dimensions: ${c.width}×${c.height}×${c.depth} cm, Description: "${c.description}"`
  );
  return `Product candidates:\n${lines.join("\n")}`;
}

export default class RerankingProvider implements ApiProvider {
  private modelId: string;
  private maxTokens: number;

  constructor(options: ProviderOptions) {
    this.modelId = (options.config?.model as string) || MODEL;
    this.maxTokens = (options.config?.max_tokens as number) || 4096;
  }

  id(): string {
    return `reranking:${this.modelId}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams
  ): Promise<ProviderResponse> {
    const imagePath = context?.vars?.image as string;
    const mimeType = (context?.vars?.mimeType as string) || "image/jpeg";
    const candidatesPath = context?.vars?.candidatesFixture as string;
    const userPrompt = context?.vars?.userPrompt as string | undefined;
    const resultsCount = (context?.vars?.resultsCount as number) || 6;

    if (!imagePath) {
      return { error: "Missing 'image' variable in test case" };
    }
    if (!candidatesPath) {
      return { error: "Missing 'candidatesFixture' variable in test case" };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "Missing ANTHROPIC_API_KEY environment variable" };
    }

    // Resolve paths relative to cwd
    const absImagePath = path.resolve(process.cwd(), imagePath);
    const absCandidatesPath = path.resolve(process.cwd(), candidatesPath);

    if (!fs.existsSync(absImagePath)) {
      return { error: `Image file not found: ${absImagePath}` };
    }
    if (!fs.existsSync(absCandidatesPath)) {
      return { error: `Candidates fixture not found: ${absCandidatesPath}` };
    }

    const imageBase64 = fs.readFileSync(absImagePath).toString("base64");
    const candidates: Candidate[] = JSON.parse(
      fs.readFileSync(absCandidatesPath, "utf-8")
    );

    // Render the system prompt template with the user prompt.
    // The `prompt` parameter from promptfoo is the raw template file content.
    const systemPrompt = renderPrompt(prompt, {
      resultsCount,
      userPrompt: userPrompt || undefined,
    });
    const candidatesText = formatCandidates(candidates);

    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create({
        model: this.modelId,
        max_tokens: this.maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/webp",
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

      const raw = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Strip markdown fences
      const text = raw
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "");

      return {
        output: text,
        tokenUsage: {
          total:
            response.usage.input_tokens + response.usage.output_tokens,
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
        },
      };
    } catch (err) {
      return {
        error: `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
