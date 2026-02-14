import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_PROMPT_LENGTH,
} from "@/lib/schemas";
import { searchPhase1, searchPhase2 } from "@/lib/search-pipeline";
import { getConfig } from "@/lib/config-store";
import { mapApiError } from "@/lib/api-error";
import type { SearchInput } from "@/lib/search-pipeline";

export async function POST(request: Request) {
  // 1. Extract API key from header
  const apiKey = request.headers.get("X-API-Key");
  if (!apiKey) {
    return Response.json(
      { error: "Missing X-API-Key header" },
      { status: 401 },
    );
  }

  // 2. Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  // 3. Validate image file
  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return Response.json(
      { error: "Missing image file. Send a 'image' field in FormData." },
      { status: 400 },
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
    )
  ) {
    return Response.json(
      {
        error: `Invalid image type: ${file.type}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return Response.json(
      {
        error: `Image too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB.`,
      },
      { status: 400 },
    );
  }

  // 4. Validate optional prompt
  const promptRaw = formData.get("prompt");
  const prompt =
    typeof promptRaw === "string" && promptRaw.trim() !== ""
      ? promptRaw.trim()
      : undefined;

  if (prompt && prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      {
        error: `Prompt too long: ${prompt.length} chars. Maximum: ${MAX_PROMPT_LENGTH}.`,
      },
      { status: 400 },
    );
  }

  // 5. Convert image to base64
  const arrayBuffer = await file.arrayBuffer();
  const imageBase64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type as "image/jpeg" | "image/png" | "image/webp";

  // 6. Build SearchInput
  const input: SearchInput = {
    apiKey,
    imageBase64,
    mimeType,
    userPrompt: prompt,
  };

  // 7. Stream results as NDJSON
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        const phase1 = await searchPhase1(input);

        if (!phase1.isFurniture) {
          emit({ phase: "not-furniture", analysis: phase1.analysis });
          controller.close();
          return;
        }

        emit({
          phase: "candidates",
          analysis: phase1.analysis,
          candidates: phase1.candidates,
        });

        const results = await searchPhase2(input, phase1.candidates);
        const { scoreThreshold } = getConfig();
        emit({ phase: "results", results, scoreThreshold });
        controller.close();
      } catch (error) {
        const { message } = mapApiError(error);
        emit({ phase: "error", message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
