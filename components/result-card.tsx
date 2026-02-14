import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { Product, ScoredProduct } from "@/lib/schemas";

interface ResultCardProps {
  product: Product | ScoredProduct;
  scoreThreshold?: number;
  currentRating?: "up" | "down" | null;
  onFeedback?: (productId: string, rating: "up" | "down") => void;
}

function isScored(product: Product | ScoredProduct): product is ScoredProduct {
  return "score" in product;
}

const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function scoreBadgeVariant(
  score: number,
  threshold: number,
): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default";
  if (score >= threshold) return "secondary";
  return "destructive";
}

export function ResultCard({
  product,
  scoreThreshold = 0,
  currentRating = null,
  onFeedback,
}: ResultCardProps) {
  const scored = isScored(product);
  const lowRelevance = scored && product.score < scoreThreshold;

  return (
    <Card className={lowRelevance ? "opacity-60" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="line-clamp-1">{product.title}</CardTitle>
            <CardDescription className="line-clamp-2">
              {product.description}
            </CardDescription>
          </div>
          {scored && (
            <Badge variant={scoreBadgeVariant(product.score, scoreThreshold)}>
              {product.score}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2">
        <p className="text-sm font-medium">
          {priceFormat.format(product.price)}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.width} &times; {product.height} &times; {product.depth} cm
        </p>
        {scored && product.justification && (
          <p className="text-sm italic text-muted-foreground">
            {product.justification}
          </p>
        )}
        {lowRelevance && (
          <p className="text-xs text-destructive">Low relevance match</p>
        )}
      </CardContent>
      {scored && onFeedback && (
        <CardFooter className="justify-end gap-1 border-t">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onFeedback(product._id, "up")}
            aria-pressed={currentRating === "up"}
            aria-label="Rate as relevant"
          >
            <ThumbsUp
              className={
                currentRating === "up"
                  ? "text-emerald-600"
                  : "text-muted-foreground"
              }
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onFeedback(product._id, "down")}
            aria-pressed={currentRating === "down"}
            aria-label="Rate as not relevant"
          >
            <ThumbsDown
              className={
                currentRating === "down"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }
            />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
