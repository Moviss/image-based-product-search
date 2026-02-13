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

export default class ImageAnalysisProvider implements ApiProvider {
  private modelId: string;
  private maxTokens: number;

  constructor(options: ProviderOptions) {
    this.modelId = (options.config?.model as string) || MODEL;
    this.maxTokens = (options.config?.max_tokens as number) || 1024;
  }

  id(): string {
    return `image-analysis:${this.modelId}`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams
  ): Promise<ProviderResponse> {
    const imagePath = context?.vars?.image as string;
    const mimeType =
      (context?.vars?.mimeType as string) || "image/jpeg";

    if (!imagePath) {
      return { error: "Missing 'image' variable in test case" };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "Missing ANTHROPIC_API_KEY environment variable" };
    }

    // Resolve file path: strip file:// prefix if present, resolve relative to cwd
    const resolved = imagePath.startsWith("file://")
      ? imagePath.slice(7)
      : imagePath;
    const absPath = path.resolve(process.cwd(), resolved);

    if (!fs.existsSync(absPath)) {
      return { error: `Image file not found: ${absPath}` };
    }

    const imageBase64 = fs.readFileSync(absPath).toString("base64");

    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create({
        model: this.modelId,
        max_tokens: this.maxTokens,
        temperature: 0,
        system: prompt,
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
                text: "Analyze this image and classify the furniture item.",
              },
            ],
          },
        ],
      });

      const raw = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      // Strip markdown fences (```json ... ```) that Claude sometimes adds
      const text = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

      return {
        output: text,
        tokenUsage: {
          total:
            response.usage.input_tokens +
            response.usage.output_tokens,
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
