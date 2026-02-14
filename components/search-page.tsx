"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useApiKey } from "@/components/api-key-provider";
import { useSearch } from "@/hooks/use-search";
import { ImageUpload, type FileWithPreview } from "@/components/image-upload";
import { ResultGrid } from "@/components/result-grid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_PROMPT_LENGTH } from "@/lib/schemas";

export function SearchPage() {
  const { apiKey } = useApiKey();
  const { status, analysis, candidates, results, scoreThreshold, error, search, reset } =
    useSearch(apiKey);

  const [fileState, setFileState] = useState<FileWithPreview | null>(null);
  const [prompt, setPrompt] = useState("");

  const isSearching = status === "analyzing" || status === "ranking";
  const hasResults =
    status === "done" || status === "not-furniture" || status === "error";

  const handleSearch = useCallback(() => {
    if (!fileState) return;
    search(fileState.file, prompt.trim() || undefined);
  }, [fileState, prompt, search]);

  const handleNewSearch = useCallback(() => {
    reset();
    if (fileState) {
      URL.revokeObjectURL(fileState.previewUrl);
      setFileState(null);
    }
    setPrompt("");
  }, [reset, fileState]);

  const handleRetry = useCallback(() => {
    if (!fileState) return;
    search(fileState.file, prompt.trim() || undefined);
  }, [fileState, prompt, search]);

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
        value={fileState}
        onChange={setFileState}
        disabled={isSearching}
      />

      <div className="space-y-2">
        <Label htmlFor="search-prompt">
          Search prompt <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="search-prompt"
          placeholder="Describe what you're looking for..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_PROMPT_LENGTH))}
          disabled={isSearching}
          rows={2}
        />
        <p className="text-xs text-muted-foreground text-right">
          {prompt.length}/{MAX_PROMPT_LENGTH}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSearch}
          disabled={!fileState || isSearching}
        >
          {isSearching && <Loader2 className="size-4 animate-spin" />}
          {isSearching ? "Searching..." : "Search"}
        </Button>
        {hasResults && (
          <Button variant="outline" onClick={handleNewSearch}>
            New Search
          </Button>
        )}
      </div>

      <ResultGrid
        status={status}
        analysis={analysis}
        candidates={candidates}
        results={results}
        scoreThreshold={scoreThreshold}
        error={error}
        onRetry={handleRetry}
      />
    </div>
  );
}
