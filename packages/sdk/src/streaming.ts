export interface StreamCompletionOptions {
  serverUrl: string;
  treeId: string;
  nodeId: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  thinking?: boolean;
  endpoint?: 'complete' | 'summarize';
  signal?: AbortSignal;
  onDelta?: (content: string, thinking: boolean) => void;
  onDone?: (nodeId: string) => void;
  onError?: (error: string) => void;
}

/**
 * Stream an LLM completion (or summarization) from the Lineage server via SSE.
 *
 * This is a framework-agnostic function that handles the SSE fetch, parsing,
 * and callback dispatch. UI frameworks can wrap this with their own state
 * management (e.g. Zustand, React state).
 */
export async function streamCompletion(options: StreamCompletionOptions): Promise<void> {
  const {
    serverUrl,
    treeId,
    nodeId,
    maxTokens = 4096,
    temperature,
    model,
    thinking,
    endpoint = 'complete',
    signal,
    onDelta,
    onDone,
    onError,
  } = options;

  const url = `${serverUrl}/trees/${treeId}/nodes/${nodeId}/${endpoint}`;
  const body = JSON.stringify({
    nodeId,
    maxTokens,
    ...(temperature !== undefined && { temperature }),
    ...(model && { model }),
    ...(thinking !== undefined && { thinking }),
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted) return;
    onError?.(err instanceof Error ? err.message : 'Network error');
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    onError?.((err as { error?: string }).error ?? `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError?.('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (currentEvent === 'delta') {
              onDelta?.(parsed.content ?? '', !!parsed.thinking);
            } else if (currentEvent === 'done') {
              onDone?.(parsed.nodeId ?? '');
              return;
            } else if (currentEvent === 'error') {
              onError?.(parsed.error ?? 'Unknown streaming error');
              return;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) return;
    onError?.(err instanceof Error ? err.message : 'Stream read error');
  }
}
