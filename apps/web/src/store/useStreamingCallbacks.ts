import { useCallback } from 'react';
import { useStreamingStore } from './streaming.js';

/**
 * Returns callback handlers that trigger streaming completions.
 * Reads the server URL from localStorage (set in Settings).
 */
export function useStreamingCallbacks(treeId: string) {
  const { startCompletion, cancel, reset, status } = useStreamingStore();

  const getServerUrl = useCallback(() => {
    const url = localStorage.getItem('lineage:serverUrl');
    if (!url) {
      throw new Error('No server URL configured — set it in Settings');
    }
    return url.replace(/\/+$/, '');
  }, []);

  const getModel = useCallback(() => {
    return localStorage.getItem('lineage:llmModel') || undefined;
  }, []);

  const getThinking = useCallback(() => {
    return localStorage.getItem('lineage:thinkingEnabled') === 'true';
  }, []);

  const onNodeReply = useCallback(
    (nodeId: string) => {
      try {
        const serverUrl = getServerUrl();
        const model = getModel();
        const thinking = getThinking();
        startCompletion({ serverUrl, treeId, nodeId, model, thinking });
      } catch (e) {
        console.error('[streaming]', e);
      }
    },
    [treeId, startCompletion, getServerUrl, getModel, getThinking],
  );

  const onNodeRegenerate = useCallback(
    (nodeId: string, parentId: string | null) => {
      if (!parentId) return;
      try {
        const serverUrl = getServerUrl();
        const model = getModel();
        const thinking = getThinking();
        startCompletion({ serverUrl, treeId, nodeId: parentId, model, thinking });
      } catch (e) {
        console.error('[streaming]', e);
      }
    },
    [treeId, startCompletion, getServerUrl, getModel, getThinking],
  );

  const onNodeSummarize = useCallback(
    (nodeId: string) => {
      try {
        const serverUrl = getServerUrl();
        const model = getModel();
        const thinking = getThinking();
        startCompletion({ serverUrl, treeId, nodeId, model, thinking, endpoint: 'summarize' });
      } catch (e) {
        console.error('[streaming]', e);
      }
    },
    [treeId, startCompletion, getServerUrl, getModel, getThinking],
  );

  return { onNodeReply, onNodeRegenerate, onNodeSummarize, cancel, reset, status };
}
