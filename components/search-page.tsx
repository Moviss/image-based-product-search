"use client";

import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useApiKey } from "@/components/api-key-provider";
import { useSearchStore } from "@/lib/store/search-store";
import { ImageUpload } from "@/components/image-upload";
import { ResultGrid } from "@/components/result-grid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_PROMPT_LENGTH } from "@/lib/schemas";

export function SearchPage() {
  const { apiKey } = useApiKey();
  const searchState = useSearchStore();

  const isSearching =
    searchState.status === "analyzing" || searchState.status === "ranking";
  const hasResults =
    searchState.status === "done" ||
    searchState.status === "not-furniture" ||
    searchState.status === "error";

  const handleSearch = useCallback(() => {
    if (!apiKey || !searchState.fileState) return;
    searchState.search(apiKey);
  }, [apiKey, searchState]);

  const handleRetry = useCallback(() => {
    if (!apiKey || !searchState.fileState) return;
    searchState.search(apiKey);
  }, [apiKey, searchState]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Image-Based Product Search
        </h1>
        <p className="text-muted-foreground">
          Upload a furniture image to find matching products from the catalog.
        </p>
      </div>

      <ImageUpload
        value={searchState.fileState}
        onChange={searchState.setFileState}
        disabled={isSearching}
      />

      <div className="space-y-2">
        <Label htmlFor="search-prompt">
          Search prompt <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="search-prompt"
          placeholder="Describe what you're looking for..."
          value={searchState.prompt}
          onChange={(e) => searchState.setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
          disabled={isSearching}
          rows={2}
        />
        <p className="text-xs text-muted-foreground text-right">
          {searchState.prompt.length}/{MAX_PROMPT_LENGTH}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSearch}
          disabled={!searchState.fileState || isSearching}
        >
          {isSearching && <Loader2 className="size-4 animate-spin" />}
          {isSearching ? "Searching..." : "Search"}
        </Button>
        {hasResults && (
          <Button variant="outline" onClick={searchState.reset}>
            New Search
          </Button>
        )}
      </div>

      <ResultGrid
        status={searchState.status}
        analysis={searchState.analysis}
        candidates={searchState.candidates}
        results={searchState.results}
        scoreThreshold={searchState.scoreThreshold}
        error={searchState.error}
        onRetry={handleRetry}
        feedback={searchState.feedback}
        onFeedback={searchState.setFeedback}
      />
    </div>
  );
}
