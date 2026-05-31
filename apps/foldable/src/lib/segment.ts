/**
 * Build the prompt that asks the on-device model to decompose prose into a
 * sequence of short, ordered thoughts (the spine of a monologue). Kept simple
 * and directive — Gemini Nano is small, so we ask for plain one-per-line output
 * rather than JSON.
 */
export function buildSegmentPrompt(prose: string): string {
  return [
    'Split the following text into short, self-contained thoughts for an outline.',
    'Keep the original order and meaning. Each thought should stand on its own.',
    'Output one thought per line. Do not add numbering, bullets, or any commentary.',
    '',
    'Text:',
    prose.trim(),
  ].join('\n');
}

/**
 * Parse the model's output into clean segments: split on lines, strip any
 * leading bullets/numbering the model added anyway, and drop blanks.
 */
export function parseSegments(modelOutput: string): string[] {
  return modelOutput
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}
