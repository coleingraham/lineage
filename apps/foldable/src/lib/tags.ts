/** Ask the on-device model for a few short topical tags for a note. */
export function buildTagPrompt(content: string): string {
  return [
    'Read the following note and list 3 to 6 short topical tags that capture its subjects.',
    'Use one or two lowercase words each. Output the tags as a comma-separated list only —',
    'no numbering, no explanation, no other text.',
    '',
    'Note:',
    content.trim(),
  ].join('\n');
}

/**
 * Parse the model's tag output into clean tag names: split on commas/newlines,
 * strip bullets/numbering/hashes/quotes/trailing punctuation, lowercase,
 * de-duplicate, drop overly long entries, cap the count.
 */
export function parseTags(modelOutput: string, max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of modelOutput.split(/[,\n]/)) {
    const tag = raw
      .replace(/^[-*•#\d.)\s"'`]+/, '')
      .replace(/["'`.]+$/, '')
      .trim()
      .toLowerCase();
    if (!tag || tag.length > 30 || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
