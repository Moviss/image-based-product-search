import { Loader2, Info, AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ResultCard } from "@/components/result-card";
import type { SearchState } from "@/hooks/use-search";

interface ResultGridProps extends SearchState {
  onRetry: () => void;
}

export function ResultGrid({
  status,
  candidates,
  results,
  scoreThreshold,
  error,
  onRetry,
}: ResultGridProps) {
  if (status === "idle") return null;

  if (status === "analyzing") {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Analyzing image...</span>
      </div>
    );
  }

  if (status === "not-furniture") {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertTitle>No furniture detected</AlertTitle>
        <AlertDescription>
          The uploaded image does not appear to contain furniture. Please try a
          different image.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>Search failed</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "ranking") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Ranking results...</span>
        </div>
        <p className="text-sm text-muted-foreground">Preliminary results</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.slice(0, 6).map((product) => (
            <ResultCard key={product._id} product={product} />
          ))}
        </div>
      </div>
    );
  }

  // status === "done"
  if (results.length === 0) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertTitle>No results</AlertTitle>
        <AlertDescription>
          No matching products were found. Try a different image or adjust your
          search prompt.
        </AlertDescription>
      </Alert>
    );
  }

  const allBelowThreshold = results.every((r) => r.score < scoreThreshold);

  return (
    <div className="space-y-4">
      {allBelowThreshold && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>Low relevance</AlertTitle>
          <AlertDescription>
            All results scored below the relevance threshold. Consider trying a
            different image or refining your search prompt.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((product) => (
          <ResultCard
            key={product._id}
            product={product}
            scoreThreshold={scoreThreshold}
          />
        ))}
      </div>
    </div>
  );
}
