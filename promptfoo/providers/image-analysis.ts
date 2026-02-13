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
    const imageBase64 = context?.vars?.image as string;
    const mimeType =
      (context?.vars?.mimeType as string) || "image/jpeg";

    if (!imageBase64) {
      return { error: "Missing 'image' variable in test case" };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "Missing ANTHROPIC_API_KEY environment variable" };
    }

    try {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create({
        model: this.modelId,
        max_tokens: this.maxTokens,
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

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

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
