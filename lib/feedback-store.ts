/**
 * In-memory feedback store (RF-024/RF-025).
 * Stores the latest rating per product ID.
 * Lost on server restart — acceptable for MVP.
 */

const g = globalThis as typeof globalThis & {
  __feedbackStore?: Map<string, "up" | "down">;
};

if (!g.__feedbackStore) {
  g.__feedbackStore = new Map();
}

/** Records or updates a rating for a product. */
export function addFeedback(productId: string, rating: "up" | "down"): void {
  g.__feedbackStore!.set(productId, rating);
}

/** Returns aggregate counts of all stored feedback. */
export function getFeedbackCounts(): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (const rating of g.__feedbackStore!.values()) {
    if (rating === "up") up++;
    else down++;
  }
  return { up, down };
}
