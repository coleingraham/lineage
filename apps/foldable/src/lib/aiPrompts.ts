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

export function buildSummaryPrompt(thread: string): string {
  return [
    'Summarize the following line of thinking into a single concise paragraph,',
    'capturing the key points and any conclusion. Output only the summary.',
    '',
    thread.trim(),
  ].join('\n');
}

export function buildReplyPrompt(thread: string): string {
  return [
    'You are a thoughtful interlocutor. Respond to the following line of thinking',
    'with a concise, substantive reply that advances it. Output only your reply.',
    '',
    thread.trim(),
  ].join('\n');
}
