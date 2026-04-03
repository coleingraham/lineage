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

  const onNodeReply = useCallback(
    (nodeId: string) => {
      try {
        const serverUrl = getServerUrl();
        startCompletion({ serverUrl, treeId, nodeId });
      } catch (e) {
        console.error('[streaming]', e);
      }
    },
    [treeId, startCompletion, getServerUrl],
  );

  const onNodeRegenerate = useCallback(
    (nodeId: string, parentId: string | null) => {
      if (!parentId) return;
      try {
        const serverUrl = getServerUrl();
        startCompletion({ serverUrl, treeId, nodeId: parentId });
      } catch (e) {
        console.error('[streaming]', e);
      }
    },
    [treeId, startCompletion, getServerUrl],
  );

  return { onNodeReply, onNodeRegenerate, cancel, reset, status };
}
