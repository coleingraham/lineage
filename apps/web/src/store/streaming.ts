import { create } from 'zustand';

export type StreamingStatus = 'idle' | 'pending' | 'streaming' | 'complete' | 'error';

export interface StreamingState {
  /** Which node the completion is being generated for (the parent node) */
  parentNodeId: string | null;
  /** Accumulated content from SSE delta events */
  content: string;
  /** Current streaming status */
  status: StreamingStatus;
  /** Error message if status is 'error' */
  error: string | null;
  /** The nodeId of the newly created AI node (set on 'done' event) */
  resultNodeId: string | null;
}

interface StreamingActions {
  /** Start a completion request via SSE */
  startCompletion: (opts: {
    serverUrl: string;
    treeId: string;
    nodeId: string;
    maxTokens?: number;
    temperature?: number;
    endpoint?: 'complete' | 'summarize';
  }) => void;
  /** Cancel the current streaming request */
  cancel: () => void;
  /** Reset to idle state */
  reset: () => void;
}

export type StreamingStore = StreamingState & StreamingActions;

const initialState: StreamingState = {
  parentNodeId: null,
  content: '',
  status: 'idle',
  error: null,
  resultNodeId: null,
};

let abortController: AbortController | null = null;

export const useStreamingStore = create<StreamingStore>((set, get) => ({
  ...initialState,

  startCompletion: ({
    serverUrl,
    treeId,
    nodeId,
    maxTokens = 4096,
    temperature,
    endpoint = 'complete',
  }) => {
    // Cancel any in-flight request
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();
    const signal = abortController.signal;

    set({
      parentNodeId: nodeId,
      content: '',
      status: 'pending',
      error: null,
      resultNodeId: null,
    });

    const url = `${serverUrl}/trees/${treeId}/nodes/${nodeId}/${endpoint}`;
    const body = JSON.stringify({
      nodeId,
      maxTokens,
      ...(temperature !== undefined && { temperature }),
    });

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          set({
            status: 'error',
            error: (err as { error?: string }).error ?? `HTTP ${res.status}`,
          });
          return;
        }

        set({ status: 'streaming' });

        const reader = res.body?.getReader();
        if (!reader) {
          set({ status: 'error', error: 'No response body' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames from the buffer
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);

                if (currentEvent === 'delta') {
                  set((s) => ({ content: s.content + (parsed.content ?? '') }));
                } else if (currentEvent === 'done') {
                  set({
                    status: 'complete',
                    resultNodeId: parsed.nodeId ?? null,
                  });
                  abortController = null;
                  return;
                }
              } catch {
                // Ignore malformed JSON
              }
            }
          }
        }

        // If we reached end of stream without a 'done' event, check state
        if (get().status === 'streaming') {
          set({ status: 'complete' });
        }
      })
      .catch((err: unknown) => {
        if (signal.aborted) return;
        set({
          status: 'error',
          error: err instanceof Error ? err.message : 'Network error',
        });
      })
      .finally(() => {
        if (!signal.aborted) {
          abortController = null;
        }
      });
  },

  cancel: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    set(initialState);
  },

  reset: () => {
    set(initialState);
  },
}));
