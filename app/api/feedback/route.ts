import { FeedbackRequestSchema } from "@/lib/schemas";
import { addFeedback, getFeedbackCounts } from "@/lib/feedback-store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = FeedbackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid feedback", details: parsed.error.issues },
      { status: 400 },
    );
  }

  addFeedback(parsed.data.productId, parsed.data.rating);

  const counts = getFeedbackCounts();
  return Response.json({ success: true, counts });
}
