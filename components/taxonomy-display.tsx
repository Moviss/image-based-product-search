import { ChevronRight } from "lucide-react";
import type { TaxonomyCategory } from "@/lib/schemas";

interface TaxonomyDisplayProps {
  taxonomy: TaxonomyCategory[];
}

export function TaxonomyDisplay({ taxonomy }: TaxonomyDisplayProps) {
  if (taxonomy.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Taxonomy unavailable — could not connect to the product database.
      </p>
    );
  }

  const totalTypes = taxonomy.reduce((sum, cat) => sum + cat.types.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {taxonomy.length} categories, {totalTypes} types
      </p>
      <div className="space-y-1">
        {taxonomy.map((cat) => (
          <details key={cat.category} className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium select-none hover:bg-muted/50">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <span className="flex-1">{cat.category}</span>
              <span className="text-xs text-muted-foreground">
                {cat.types.length}
              </span>
            </summary>
            <div className="border-t border-border px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {cat.types.map((type) => (
                  <span
                    key={type}
                    className="rounded-md bg-muted px-2.5 py-1 text-xs"
                  >
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
