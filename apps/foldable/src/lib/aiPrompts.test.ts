import { describe, it, expect } from 'vitest';
import type { Node } from '@lineage/core';
import { buildReplyPrompt, buildSummaryPrompt, threadText } from './aiPrompts.js';

function node(type: string, content: string): Node {
  return {
    nodeId: content,
    treeId: 't',
    parentId: null,
    type,
    content,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    intent: null,
  };
}

describe('threadText', () => {
  it('labels nodes by role', () => {
    const t = threadText([node('human', 'a thought'), node('ai', 'a reply'), node('summary', 'a recap')]);
    expect(t).toBe('Author: a thought\n\nAI: a reply\n\nSummary: a recap');
  });
});

describe('prompt builders', () => {
  it('embed the thread and ask for summary-only / reply-only output', () => {
    expect(buildSummaryPrompt('X')).toContain('Output only the summary');
    expect(buildSummaryPrompt('X')).toContain('X');
    expect(buildReplyPrompt('Y')).toContain('Output only your reply');
    expect(buildReplyPrompt('Y')).toContain('Y');
  });
});
