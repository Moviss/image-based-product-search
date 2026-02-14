import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { AdminConfig } from "@/lib/schemas";

type NumericField = "resultsCount" | "maxCandidates" | "scoreThreshold";

interface ConfigControlsProps {
  resultsCount: number;
  maxCandidates: number;
  scoreThreshold: number;
  onValueChange: (field: keyof AdminConfig, value: number) => void;
  disabled?: boolean;
}

const CONTROLS: {
  field: NumericField;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    field: "resultsCount",
    label: "Number of displayed results",
    description: "How many top results to show after re-ranking (3–12)",
    min: 3,
    max: 12,
    step: 1,
  },
  {
    field: "maxCandidates",
    label: "Maximum candidates for re-ranking",
    description:
      "Products retrieved from MongoDB before Claude re-ranks them (10–100). Higher values improve result quality but increase latency and API cost.",
    min: 10,
    max: 100,
    step: 5,
  },
  {
    field: "scoreThreshold",
    label: "Score threshold",
    description:
      "Results below this score are marked as low-relevance (0–100). Set to 0 to disable.",
    min: 0,
    max: 100,
    step: 1,
  },
];

export function ConfigControls({
  resultsCount,
  maxCandidates,
  scoreThreshold,
  onValueChange,
  disabled,
}: ConfigControlsProps) {
  const values: Record<NumericField, number> = {
    resultsCount,
    maxCandidates,
    scoreThreshold,
  };

  return (
    <div className="space-y-6">
      {CONTROLS.map((control) => (
        <div key={control.field} className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{control.label}</Label>
            <span className="text-sm font-medium tabular-nums w-8 text-right">
              {values[control.field]}
            </span>
          </div>
          <Slider
            value={[values[control.field]]}
            onValueChange={([v]) => onValueChange(control.field, v)}
            min={control.min}
            max={control.max}
            step={control.step}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            {control.description}
          </p>
        </div>
      ))}
    </div>
  );
}
