"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptEditor } from "@/components/prompt-editor";
import { ConfigControls } from "@/components/config-controls";
import { TaxonomyDisplay } from "@/components/taxonomy-display";
import type { AdminConfig, TaxonomyCategory } from "@/lib/schemas";

interface AdminPanelProps {
  initialConfig: AdminConfig;
  taxonomy: TaxonomyCategory[];
}

export function AdminPanel({ initialConfig, taxonomy }: AdminPanelProps) {
  const [formValues, setFormValues] = useState<AdminConfig>(initialConfig);
  const [serverValues, setServerValues] = useState<AdminConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isDirty =
    formValues.imageAnalysisPrompt !== serverValues.imageAnalysisPrompt ||
    formValues.rerankingPrompt !== serverValues.rerankingPrompt ||
    formValues.resultsCount !== serverValues.resultsCount ||
    formValues.maxCandidates !== serverValues.maxCandidates ||
    formValues.scoreThreshold !== serverValues.scoreThreshold;

  const isValid =
    formValues.imageAnalysisPrompt.trim() !== "" &&
    formValues.rerankingPrompt.trim() !== "";

  const updateField = useCallback(
    (field: keyof AdminConfig, value: string | number) => {
      setFormValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isValid) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveMessage({
          type: "error",
          text: data.error ?? "Failed to save configuration",
        });
        return;
      }

      setServerValues(data);
      setFormValues(data);
      setSaveMessage({ type: "success", text: "Configuration saved" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({
        type: "error",
        text: "Network error. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [formValues, isValid]);

  const handleDiscard = useCallback(() => {
    setFormValues(serverValues);
    setSaveMessage(null);
  }, [serverValues]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">
          Configure search parameters and system prompts.
        </p>
      </div>

      {/* System Prompts */}
      <section className="space-y-6">
        <h2 className="text-lg font-medium">System Prompts</h2>
        <PromptEditor
          id="image-analysis-prompt"
          label="Image Analysis Prompt"
          description="Sent to Claude when analyzing uploaded images. Supports {{taxonomy}} template variable."
          value={formValues.imageAnalysisPrompt}
          onChange={(v) => updateField("imageAnalysisPrompt", v)}
          disabled={isSaving}
        />
        <PromptEditor
          id="reranking-prompt"
          label="Re-ranking Prompt"
          description="Sent to Claude when ranking candidates. Supports {{resultsCount}} and {{#userPrompt}}...{{/userPrompt}} template variables."
          value={formValues.rerankingPrompt}
          onChange={(v) => updateField("rerankingPrompt", v)}
          disabled={isSaving}
        />
      </section>

      {/* Search Parameters */}
      <section className="space-y-6">
        <h2 className="text-lg font-medium">Search Parameters</h2>
        <ConfigControls
          resultsCount={formValues.resultsCount}
          maxCandidates={formValues.maxCandidates}
          scoreThreshold={formValues.scoreThreshold}
          onValueChange={updateField}
          disabled={isSaving}
        />
      </section>

      {/* Save / Discard */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!isDirty || !isValid || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="animate-spin" />
              Saving...
            </>
          ) : (
            "Save Configuration"
          )}
        </Button>
        {isDirty && !isSaving && (
          <Button variant="outline" onClick={handleDiscard}>
            Discard Changes
          </Button>
        )}
        {saveMessage && (
          <p
            className={`text-sm font-medium ${
              saveMessage.type === "success"
                ? "text-emerald-600"
                : "text-destructive"
            }`}
          >
            {saveMessage.text}
          </p>
        )}
      </div>

      {/* Product Taxonomy */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Product Taxonomy</h2>
          <p className="text-sm text-muted-foreground">
            Categories and types available in the product catalog (read-only).
          </p>
        </div>
        <TaxonomyDisplay taxonomy={taxonomy} />
      </section>
    </div>
  );
}
