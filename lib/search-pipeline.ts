import type { ImageAnalysisResult, Product, ScoredProduct } from "@/lib/schemas";
import { analyzeImage, rerankCandidates } from "@/lib/claude";
import { getConfig } from "@/lib/config-store";
import { connectDB } from "@/lib/db";
import { Product as ProductModel } from "@/lib/models/product";

type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface SearchInput {
  apiKey: string;
  imageBase64: string;
  mimeType: ImageMimeType;
  userPrompt?: string;
}

interface NotFurnitureResult {
  isFurniture: false;
  analysis: ImageAnalysisResult;
}

interface CandidatesResult {
  isFurniture: true;
  analysis: ImageAnalysisResult;
  candidates: Product[];
}

export type SearchPhase1Result = NotFurnitureResult | CandidatesResult;

/**
 * Converts a Mongoose lean document to a Product.
 * Lean documents have ObjectId `_id`; Product expects string.
 */
function toProduct(doc: Record<string, unknown>): Product {
  return {
    _id: String(doc._id),
    title: doc.title as string,
    description: doc.description as string,
    category: doc.category as string,
    type: doc.type as string,
    price: doc.price as number,
    width: doc.width as number,
    height: doc.height as number,
    depth: doc.depth as number,
  };
}

/**
 * Retrieves product candidates using a cascading query strategy:
 *   Level 1 — exact type match (most relevant)
 *   Level 2 — same category, different type (related products)
 *   Level 3 — no filter (broad fallback)
 *
 * Each level fills remaining capacity up to `maxCandidates`.
 */
async function findCandidates(
  analysis: ImageAnalysisResult,
  maxCandidates: number
): Promise<Product[]> {
  await connectDB();

  const candidates: Product[] = [];
  const seenIds: string[] = [];

  // Level 1: Type match
  if (analysis.type) {
    const docs = await ProductModel.find({ type: analysis.type })
      .limit(maxCandidates)
      .lean();

    for (const doc of docs) {
      const product = toProduct(doc as Record<string, unknown>);
      candidates.push(product);
      seenIds.push(product._id);
    }
  }

  // Level 2: Category match (excluding already-found type)
  if (candidates.length < maxCandidates && analysis.category) {
    const remaining = maxCandidates - candidates.length;

    const filter: Record<string, unknown> = {
      category: analysis.category,
    };

    if (analysis.type) {
      filter.type = { $ne: analysis.type };
    }

    const docs = await ProductModel.find(filter)
      .limit(remaining)
      .lean();

    for (const doc of docs) {
      const product = toProduct(doc as Record<string, unknown>);
      candidates.push(product);
      seenIds.push(product._id);
    }
  }

  // Level 3: Broad fallback (any product not yet selected)
  if (candidates.length < maxCandidates && seenIds.length > 0) {
    const remaining = maxCandidates - candidates.length;

    const docs = await ProductModel.find({
      _id: { $nin: seenIds },
    })
      .limit(remaining)
      .lean();

    for (const doc of docs) {
      candidates.push(toProduct(doc as Record<string, unknown>));
    }
  }

  // Edge case: no type AND no category (Claude uncertain)
  if (candidates.length === 0) {
    const docs = await ProductModel.find({})
      .limit(maxCandidates)
      .lean();

    for (const doc of docs) {
      candidates.push(toProduct(doc as Record<string, unknown>));
    }
  }

  return candidates;
}

/**
 * Phase 1: Analyze the image and retrieve candidates from MongoDB.
 *
 * Returns a discriminated union:
 * - `isFurniture: false` — image is not furniture, no candidates
 * - `isFurniture: true`  — analysis + candidates ready for re-ranking
 */
export async function searchPhase1(
  input: SearchInput
): Promise<SearchPhase1Result> {
  const { apiKey, imageBase64, mimeType } = input;

  const analysis = await analyzeImage(apiKey, imageBase64, mimeType);

  if (!analysis.isFurniture) {
    return { isFurniture: false, analysis };
  }

  const config = getConfig();
  const candidates = await findCandidates(analysis, config.maxCandidates);

  return { isFurniture: true, analysis, candidates };
}

/**
 * Phase 2: Re-rank candidates using Claude.
 *
 * Takes candidates from phase 1, sends them to Claude with the
 * reference image, and returns scored results sorted by relevance.
 */
export async function searchPhase2(
  input: SearchInput,
  candidates: Product[]
): Promise<ScoredProduct[]> {
  const { apiKey, imageBase64, mimeType, userPrompt } = input;

  return rerankCandidates(apiKey, imageBase64, mimeType, candidates, userPrompt);
}
