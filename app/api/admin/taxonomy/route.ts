import { getTaxonomy } from "@/lib/taxonomy";
import { mapApiError } from "@/lib/api-error";

export async function GET() {
  try {
    const taxonomy = await getTaxonomy();
    return Response.json(taxonomy);
  } catch (error) {
    const { status, message } = mapApiError(error);
    return Response.json({ error: message }, { status });
  }
}
