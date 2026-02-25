import { create } from 'zustand';
import type { ImageAnalysisResult, Product, ScoredProduct } from "@/lib/schemas";
import { FileWithPreview } from "@/components/image-upload";

export type SearchStatus =
  | "idle"
  | "analyzing"
  | "ranking"
  | "done"
  | "error"
  | "not-furniture";

export interface SearchState {
  // Core Search State
  status: SearchStatus;
  analysis: ImageAnalysisResult | null;
  candidates: Product[];
  results: ScoredProduct[];
  scoreThreshold: number;
  error: string | null;

  // UI State
  fileState: FileWithPreview | null;
  prompt: string;
  feedback: Record<string, "up" | "down">;

  // Actions
  setFileState: (fileState: FileWithPreview | null) => void;
  setPrompt: (prompt: string) => void;
  setFeedback: (productId: string, rating: "up" | "down") => void;
  search: (apiKey: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  status: "idle" as SearchStatus,
  analysis: null,
  candidates: [],
  results: [],
  scoreThreshold: 0,
  error: null,
  fileState: null,
  prompt: "",
  feedback: {},
};

async function* readNdjsonStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        yield JSON.parse(trimmed);
      }
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer.trim());
  }
}

// Controller reference kept outside Zustand state to avoid storing non-serializable objects in state directly
let activeAbortController: AbortController | null = null;

export const useSearchStore = create<SearchState>((set, get) => ({
  ...initialState,

  setFileState: (fileState) => set({ fileState }),
  
  setPrompt: (prompt) => set({ prompt }),
  
  setFeedback: (productId, rating) => {
    set((state) => ({
      feedback: { ...state.feedback, [productId]: rating }
    }));
    
    // Fire and forget the analytics hit
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, rating }),
    }).catch(() => {});
  },

  search: async (apiKey: string) => {
    const state = get();
    if (!apiKey || !state.fileState?.file) return;

    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    set({ 
      status: "analyzing", 
      analysis: null, 
      candidates: [], 
      results: [], 
      error: null 
    });

    try {
      const formData = new FormData();
      formData.append("image", state.fileState.file);
      if (state.prompt.trim()) {
        formData.append("prompt", state.prompt.trim());
      }

      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "X-API-Key": apiKey },
        body: formData,
        signal: activeAbortController.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error ?? `Search failed (${response.status})`;
        set({ status: "error", error: message });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        set({ status: "error", error: "No response stream" });
        return;
      }

      for await (const chunk of readNdjsonStream(reader)) {
        const data = chunk as Record<string, unknown>;

        switch (data.phase) {
          case "not-furniture":
            set({
              status: "not-furniture",
              analysis: data.analysis as ImageAnalysisResult,
            });
            break;
          case "candidates":
            set({
              status: "ranking",
              analysis: data.analysis as ImageAnalysisResult,
              candidates: data.candidates as Product[],
            });
            break;
          case "results":
            set({
              status: "done",
              results: data.results as ScoredProduct[],
              scoreThreshold: data.scoreThreshold as number,
            });
            break;
          case "error":
            set({
              status: "error",
              error: (data.message as string) ?? "Search failed",
            });
            break;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      set({
        status: "error",
        error: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    }
  },

  reset: () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    const state = get();
    if (state.fileState) {
      URL.revokeObjectURL(state.fileState.previewUrl);
    }
    set(initialState);
  },
}));
