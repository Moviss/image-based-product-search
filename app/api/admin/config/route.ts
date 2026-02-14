import { AdminConfigSchema } from "@/lib/schemas";
import { getConfig, updateConfig } from "@/lib/config-store";

export async function GET() {
  const config = getConfig();
  return Response.json(config);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AdminConfigSchema.partial().safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid configuration", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return Response.json(
      { error: "No configuration fields provided" },
      { status: 400 },
    );
  }

  const updated = updateConfig(parsed.data);
  return Response.json(updated);
}
