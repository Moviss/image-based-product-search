/**
 * Replaces template variables in a prompt string.
 *
 * Supported patterns:
 *   {{taxonomy}}                        → replaced with the taxonomy string
 *   {{resultsCount}}                    → replaced with the number
 *   {{#userPrompt}}...{{/userPrompt}}   → conditional block, stripped if no userPrompt
 */
export function renderPrompt(
  template: string,
  vars: {
    taxonomy?: string;
    resultsCount?: number;
    userPrompt?: string;
  }
): string {
  let result = template;

  if (vars.taxonomy !== undefined) {
    result = result.replaceAll("{{taxonomy}}", vars.taxonomy);
  }

  if (vars.resultsCount !== undefined) {
    result = result.replaceAll(
      "{{resultsCount}}",
      String(vars.resultsCount)
    );
  }

  // Conditional {{#userPrompt}}...{{/userPrompt}} block
  const conditionalRe =
    /\{\{#userPrompt\}\}([\s\S]*?)\{\{\/userPrompt\}\}/g;

  if (vars.userPrompt) {
    result = result.replace(conditionalRe, (_match, inner: string) =>
      inner.replaceAll("{{userPrompt}}", vars.userPrompt!)
    );
  } else {
    result = result.replace(conditionalRe, "");
  }

  return result;
}
