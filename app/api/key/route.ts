import { ApiKeyRequestSchema } from "@/lib/schemas";
import { validateApiKey } from "@/lib/claude";
import { mapApiError } from "@/lib/api-error";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = ApiKeyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const valid = await validateApiKey(parsed.data.apiKey);
    return Response.json({ valid });
  } catch (error) {
    const { status, message } = mapApiError(error);
    return Response.json({ error: message }, { status });
  }
}
