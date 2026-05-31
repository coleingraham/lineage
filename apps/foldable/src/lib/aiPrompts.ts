import type { Node } from '@lineage/core';

function roleLabel(type: string): string {
  if (type === 'ai') return 'AI';
  if (type === 'summary') return 'Summary';
  return 'Author';
}

/** Render a line of nodes (root→focused) as a role-labelled thread for prompts. */
export function threadText(nodes: Node[]): string {
  return nodes.map((n) => `${roleLabel(n.type)}: ${n.content}`).join('\n\n');
}

function withContext(context: string | undefined, body: string[]): string {
  const parts: string[] = [];
  if (context && context.trim()) {
    parts.push('Background the author pinned as context:', context.trim(), '');
  }
  parts.push(...body);
  return parts.join('\n');
}

export function buildSummaryPrompt(thread: string, context?: string): string {
  return withContext(context, [
    'Summarize the following line of thinking into a single concise paragraph,',
    'capturing the key points and any conclusion. Output only the summary.',
    '',
    thread.trim(),
  ]);
}

export function buildReplyPrompt(thread: string, context?: string): string {
  return withContext(context, [
    'You are a thoughtful interlocutor. Respond to the following line of thinking',
    'with a concise, substantive reply that advances it, drawing on the background',
    'context where relevant. Output only your reply.',
    '',
    thread.trim(),
  ]);
}
