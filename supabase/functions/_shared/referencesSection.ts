export function splitTrailingReferencesSection(content: string): { body: string; references: string } {
  const matches = [...content.matchAll(/^##\s+References:?\s*$/gim)];
  const lastMatch = matches.at(-1);

  if (!lastMatch || lastMatch.index === undefined) {
    return { body: content.trim(), references: "" };
  }

  const body = content.slice(0, lastMatch.index).trimEnd();
  const references = content.slice(lastMatch.index).trim();
  return { body, references };
}

export function restoreTrailingReferencesSection(content: string, originalReferences: string): string {
  const cleaned = content.replace(/^##\s+References:?\s*[\s\S]*$/im, "").trimEnd();
  if (!originalReferences.trim()) return cleaned;
  return `${cleaned}\n\n${originalReferences.trim()}`.trim();
}