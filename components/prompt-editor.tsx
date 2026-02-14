import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PromptEditorProps {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PromptEditor({
  id,
  label,
  description,
  value,
  onChange,
  disabled,
}: PromptEditorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="font-mono text-sm"
        disabled={disabled}
      />
    </div>
  );
}
