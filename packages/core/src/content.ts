/**
 * Strip thinking blocks from node content.
 *
 * Handles three formats:
 * - `<details><summary>Thinking</summary>...</details>` (stored format)
 * - `> *Thinking:*\n> ...` (blockquote format)
 * - `<think>...</think>` (raw model output, e.g. Qwen3)
 */
export function stripThinking(content: string): string {
  return content
    .replace(/<details>\s*\n?<summary>Thinking<\/summary>[\s\S]*?<\/details>\s*\n*/g, '')
    .replace(/^> \*Thinking:\*\n(?:>.*\n)*\n?/g, '')
    .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
    .trim();
}

/**
 * Extract a thinking block from content, returning both the thinking text
 * and the remaining content. Returns `null` for thinking if no block is found.
 */
export function extractThinking(content: string): { thinking: string | null; rest: string } {
  const detailsMatch = content.match(
    /^<details>\s*\n<summary>Thinking<\/summary>\s*\n\n([\s\S]*?)\n\n<\/details>\s*\n\n/,
  );
  if (detailsMatch) {
    return { thinking: detailsMatch[1], rest: content.slice(detailsMatch[0].length) };
  }

  const bqMatch = content.match(/^> \*Thinking:\*\n((?:>.*\n)*)\n?/);
  if (bqMatch) {
    const thinking = bqMatch[1]
      .split('\n')
      .map((l) => l.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    return { thinking, rest: content.slice(bqMatch[0].length) };
  }

  return { thinking: null, rest: content };
}
