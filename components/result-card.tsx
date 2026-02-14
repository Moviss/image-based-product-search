import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <Dialog>
      <DialogTrigger asChild>
        <Card
          className={cn(
            "cursor-pointer transition-shadow hover:shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            lowRelevance && "opacity-60",
          )}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <CardTitle className="line-clamp-1">
                  {product.title}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {product.description}
                </CardDescription>
              </div>
              {scored && (
                <Badge
                  variant={scoreBadgeVariant(product.score, scoreThreshold)}
                >
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
              {product.width} &times; {product.height} &times; {product.depth}{" "}
              cm
            </p>
            {scored && product.justification && (
              <p className="line-clamp-2 text-sm italic text-muted-foreground">
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
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(product._id, "up");
                }}
                onKeyDown={(e) => e.stopPropagation()}
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
                onClick={(e) => {
                  e.stopPropagation();
                  onFeedback(product._id, "down");
                }}
                onKeyDown={(e) => e.stopPropagation()}
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
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product.title}</DialogTitle>
          <DialogDescription>
            {product.category} &mdash; {product.type}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">{product.description}</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Price</p>
              <p className="font-medium">
                {priceFormat.format(product.price)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Dimensions</p>
              <p className="font-medium">
                {product.width} &times; {product.height} &times;{" "}
                {product.depth} cm
              </p>
            </div>
          </div>
          {scored && (
            <>
              <div>
                <p className="text-muted-foreground text-sm">Match Score</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant={scoreBadgeVariant(
                      product.score,
                      scoreThreshold,
                    )}
                  >
                    {product.score}
                  </Badge>
                  {lowRelevance && (
                    <span className="text-xs text-destructive">
                      Low relevance
                    </span>
                  )}
                </div>
              </div>
              {product.justification && (
                <div>
                  <p className="text-muted-foreground text-sm">
                    AI Justification
                  </p>
                  <p className="mt-1 text-sm">{product.justification}</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
