"use client";

import { useReducer, useRef, useCallback } from "react";
import type { ImageAnalysisResult, Product, ScoredProduct } from "@/lib/schemas";

export type SearchStatus =
  | "idle"
  | "analyzing"
  | "ranking"
  | "done"
  | "error"
  | "not-furniture";

export interface SearchState {
  status: SearchStatus;
  analysis: ImageAnalysisResult | null;
  candidates: Product[];
  results: ScoredProduct[];
  scoreThreshold: number;
  error: string | null;
}

type SearchAction =
  | { type: "SEARCH_START" }
  | { type: "NOT_FURNITURE"; analysis: ImageAnalysisResult }
  | {
      type: "CANDIDATES_RECEIVED";
      analysis: ImageAnalysisResult;
      candidates: Product[];
    }
  | {
      type: "RESULTS_RECEIVED";
      results: ScoredProduct[];
      scoreThreshold: number;
    }
  | { type: "ERROR"; message: string }
  | { type: "RESET" };

const initialState: SearchState = {
  status: "idle",
  analysis: null,
  candidates: [],
  results: [],
  scoreThreshold: 0,
  error: null,
};

function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "SEARCH_START":
      return { ...initialState, status: "analyzing" };
    case "NOT_FURNITURE":
      return { ...state, status: "not-furniture", analysis: action.analysis };
    case "CANDIDATES_RECEIVED":
      return {
        ...state,
        status: "ranking",
        analysis: action.analysis,
        candidates: action.candidates,
      };
    case "RESULTS_RECEIVED":
      return {
        ...state,
        status: "done",
        results: action.results,
        scoreThreshold: action.scoreThreshold,
      };
    case "ERROR":
      return { ...state, status: "error", error: action.message };
    case "RESET":
      return initialState;
  }
}

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

export function useSearch(apiKey: string | null) {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (file: File, prompt?: string) => {
      if (!apiKey) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "SEARCH_START" });

      try {
        const formData = new FormData();
        formData.append("image", file);
        if (prompt) {
          formData.append("prompt", prompt);
        }

        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "X-API-Key": apiKey },
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const message =
            body?.error ?? `Search failed (${response.status})`;
          dispatch({ type: "ERROR", message });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          dispatch({ type: "ERROR", message: "No response stream" });
          return;
        }

        for await (const chunk of readNdjsonStream(reader)) {
          const data = chunk as Record<string, unknown>;

          switch (data.phase) {
            case "not-furniture":
              dispatch({
                type: "NOT_FURNITURE",
                analysis: data.analysis as ImageAnalysisResult,
              });
              break;
            case "candidates":
              dispatch({
                type: "CANDIDATES_RECEIVED",
                analysis: data.analysis as ImageAnalysisResult,
                candidates: data.candidates as Product[],
              });
              break;
            case "results":
              dispatch({
                type: "RESULTS_RECEIVED",
                results: data.results as ScoredProduct[],
                scoreThreshold: data.scoreThreshold as number,
              });
              break;
            case "error":
              dispatch({
                type: "ERROR",
                message: (data.message as string) ?? "Search failed",
              });
              break;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({
          type: "ERROR",
          message:
            err instanceof Error ? err.message : "An unexpected error occurred",
        });
      }
    },
    [apiKey],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { ...state, search, reset };
}
