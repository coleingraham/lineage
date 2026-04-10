import { useState, useEffect, useCallback, useMemo } from 'react';
import { GraphView } from './views/GraphView.js';
import { LinearView } from './views/LinearView.js';
import { Settings } from './components/Settings.js';
import { TagManager } from './components/TagManager.js';
import { TagPicker } from './components/TagPicker.js';
import { TopBar } from './components/TopBar.js';
import { COLORS, FONTS } from './styles/theme.js';
import { useRepository } from './hooks/useRepository.js';
import { useTreeList } from './hooks/useTreeList.js';
import { useTreeData } from './hooks/useTreeData.js';
import { useStreamingStore } from './store/streaming.js';
import { useNodeOperations } from './hooks/useNodeOperations.js';
import { SETTINGS_KEYS } from './hooks/useSettings.js';
import { Sidebar } from './components/graph/Sidebar.js';
import type { SidebarMode, PinnedNode } from './components/graph/GraphRendererTypes.js';
import { streamCompletion } from '@lineage/sdk';
import type { ContextSource, Node } from '@lineage/core';
import './styles/graph.css';

const PINNED_KEY = 'lineage:pinnedNodes';

type ViewMode = 'graph' | 'linear';

const VIEW_MODE_KEY = 'lineage:viewMode';
const SELECTED_TREE_KEY = 'lineage:selectedTreeId';

function readSavedMode(): ViewMode {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === 'linear' ? 'linear' : 'graph';
}

export function App() {
  const [mode, setMode] = useState<ViewMode>(readSavedMode);
  const [showSettings, setShowSettings] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagPickerTarget, setTagPickerTarget] = useState<
    { type: 'node'; nodeId: string } | { type: 'tree'; treeId: string } | null
  >(null);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('conversations');
  const [autoAiReply, setAutoAiReply] = useState(
    () => localStorage.getItem(SETTINGS_KEYS.autoAiReply) !== 'false',
  );

  const handleAutoAiReplyToggle = useCallback(() => {
    setAutoAiReply((prev) => {
      const next = !prev;
      localStorage.setItem(SETTINGS_KEYS.autoAiReply, String(next));
      return next;
    });
  }, []);

  const [settingsVersion, setSettingsVersion] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, [mode]);

  // ── Repository ──────────────────────────────────────────────────────────────
  const { repo, error: repoError, isLoading: repoLoading } = useRepository(settingsVersion);

  // ── Tree list ───────────────────────────────────────────────────────────────
  const { trees, isLoading: treesLoading } = useTreeList(repo, refreshKey);

  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(
    localStorage.getItem(SELECTED_TREE_KEY),
  );

  // Auto-select first tree only when nothing is selected
  useEffect(() => {
    if (selectedTreeId || trees.length === 0) return;
    setSelectedTreeId(trees[0].treeId);
  }, [trees, selectedTreeId]);

  // Persist selected tree & reset node selection when tree changes
  useEffect(() => {
    if (selectedTreeId) {
      localStorage.setItem(SELECTED_TREE_KEY, selectedTreeId);
    } else {
      localStorage.removeItem(SELECTED_TREE_KEY);
    }
    setSelectedNodeId(null);
  }, [selectedTreeId]);

  // ── Pinned nodes ───────────────────────────────────────────────────────────
  const [pinnedNodes, setPinnedNodes] = useState<PinnedNode[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedNodes));
  }, [pinnedNodes]);

  const handleTogglePin = useCallback(
    (nodeId: string) => {
      setPinnedNodes((prev) => {
        const exists = prev.some((p) => p.nodeId === nodeId);
        if (exists) return prev.filter((p) => p.nodeId !== nodeId);
        if (!selectedTreeId) return prev;
        return [...prev, { nodeId, treeId: selectedTreeId }];
      });
    },
    [selectedTreeId],
  );

  const handleUnpin = useCallback((nodeId: string) => {
    setPinnedNodes((prev) => prev.filter((p) => p.nodeId !== nodeId));
  }, []);

  const handleClearAllPins = useCallback(() => {
    setPinnedNodes([]);
  }, []);

  // ── Pin selection (ephemeral, not persisted) ───────────────────────────────
  const [selectedPinNodeIds, setSelectedPinNodeIds] = useState<Set<string>>(new Set());

  const handlePinSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedPinNodeIds(ids);
  }, []);

  // ── Create tree from selected pins ─────────────────────────────────────────
  const handleCreateTreeFromContext = useCallback(async () => {
    if (!repo || selectedPinNodeIds.size === 0) return;

    const serverUrl = localStorage.getItem('lineage:serverUrl');
    if (!serverUrl) throw new Error('No server URL configured — set it in Settings');
    const url = serverUrl.replace(/\/+$/, '');
    const model = localStorage.getItem('lineage:llmModel') || undefined;
    const thinking = localStorage.getItem('lineage:thinkingEnabled') === 'true';

    // Collect the selected pins in selection order
    const selectedPins = pinnedNodes.filter((p) => selectedPinNodeIds.has(p.nodeId));

    // Fetch all nodes per tree (deduplicated) so we can check types and existing summaries
    const treeNodesCache = new Map<string, Node[]>();
    const uniqueTreeIds = [...new Set(selectedPins.map((p) => p.treeId))];
    await Promise.all(
      uniqueTreeIds.map(async (treeId) => {
        treeNodesCache.set(treeId, await repo.getNodes(treeId));
      }),
    );

    // Resolve each pin: use as-is if summary, reuse existing summary child, or generate
    const resolved = await Promise.all(
      selectedPins.map(async (pin): Promise<ContextSource | null> => {
        const treeNodes = treeNodesCache.get(pin.treeId) ?? [];
        const node = treeNodes.find((n) => n.nodeId === pin.nodeId);

        if (!node) {
          throw new Error(`Node ${pin.nodeId} not found in tree ${pin.treeId}`);
        }

        // Already a summary — use as-is
        if (node.type === 'summary') {
          return { treeId: pin.treeId, nodeId: pin.nodeId };
        }

        // Check for an existing direct summary child (best-effort reuse)
        const existingSummaryChild = treeNodes.find(
          (n) => n.parentId === pin.nodeId && n.type === 'summary' && !n.isDeleted,
        );
        if (existingSummaryChild) {
          return { treeId: pin.treeId, nodeId: existingSummaryChild.nodeId };
        }

        // Generate a new summary
        return new Promise<ContextSource>((resolve, reject) => {
          streamCompletion({
            serverUrl: url,
            treeId: pin.treeId,
            nodeId: pin.nodeId,
            model,
            thinking,
            endpoint: 'summarize',
            onDone: (summaryNodeId) => {
              resolve({ treeId: pin.treeId, nodeId: summaryNodeId });
            },
            onError: (err) => {
              reject(new Error(`Failed to summarize node ${pin.nodeId}: ${err}`));
            },
          });
        });
      }),
    );

    const contextSources = resolved.filter((cs): cs is ContextSource => cs !== null);

    if (contextSources.length === 0) {
      throw new Error('No context sources could be resolved');
    }

    // Create the new tree with context_sources
    const treeId = crypto.randomUUID();
    const rootNodeId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const title = `Seeded conversation`;

    await repo.putTree({ treeId, title, createdAt, rootNodeId, contextSources });
    await repo.putNode({
      nodeId: rootNodeId,
      treeId,
      parentId: null,
      type: 'human',
      content: '',
      isDeleted: false,
      createdAt,
      modelName: null,
      provider: null,
      tokenCount: null,
      embeddingModel: null,
      metadata: null,
      author: null,
    });

    // Clear pin selection and navigate with root node in edit mode
    setSelectedPinNodeIds(new Set());
    refresh();
    setSelectedTreeId(treeId);
    setPendingEditNodeId(rootNodeId);
  }, [repo, selectedPinNodeIds, pinnedNodes, refresh, setSelectedTreeId]);

  // ── Node data ───────────────────────────────────────────────────────────────
  const {
    nodes,
    isLoading: nodesLoading,
    error: nodesError,
  } = useTreeData(selectedTreeId, repo, refreshKey);

  // ── Refetch after streaming completes ───────────────────────────────────────
  const streamingStatus = useStreamingStore((s) => s.status);
  const resultNodeId = useStreamingStore((s) => s.resultNodeId);
  const resetStreaming = useStreamingStore((s) => s.reset);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingEditNodeId, setPendingEditNodeId] = useState<string | null>(null);
  const clearPendingEdit = useCallback(() => setPendingEditNodeId(null), []);

  useEffect(() => {
    if (streamingStatus === 'complete') {
      if (resultNodeId) {
        setFocusNodeId(resultNodeId);
      }
      refresh();
    }
  }, [streamingStatus, resultNodeId, refresh]);

  const handleFocusHandled = useCallback(() => {
    setFocusNodeId(null);
    resetStreaming();
  }, [resetStreaming]);

  // ── Node operations ─────────────────────────────────────────────────────────
  const {
    draftNode,
    handleDelete,
    handleDeleteTree,
    handleEdit,
    handleCreateSibling,
    handleCompose,
    handleAddHumanNode,
    handleRootNodeSubmitted,
  } = useNodeOperations({
    repo,
    selectedTreeId,
    nodes,
    trees,
    refresh,
    setSelectedTreeId,
    setPendingEditNodeId,
  });

  // ── Merge draft node into the node list so it appears in the UI ─────────────
  const effectiveNodes = useMemo(
    () => (draftNode ? [...nodes, draftNode] : nodes),
    [nodes, draftNode],
  );

  // ── Settings close handler ──────────────────────────────────────────────────
  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    setSettingsVersion((v) => v + 1);
  }, []);

  // ── Tree selection (re-selecting the same tree forces a data refresh) ──────
  const handleSelectTree = useCallback(
    (treeId: string) => {
      if (treeId === selectedTreeId) {
        refresh();
      } else {
        setSelectedTreeId(treeId);
      }
    },
    [selectedTreeId, refresh],
  );

  const handleNavigateToNode = useCallback(
    (treeId: string, nodeId: string) => {
      if (treeId === selectedTreeId) {
        setFocusNodeId(nodeId);
      } else {
        setSelectedTreeId(treeId);
        setFocusNodeId(nodeId);
      }
    },
    [selectedTreeId],
  );

  // ── Loading / error states ──────────────────────────────────────────────────
  const isLoading = repoLoading || treesLoading || nodesLoading;

  const treeProps = repo
    ? {
        trees,
        selectedTreeId,
        onSelectTree: handleSelectTree,
        onDeleteTree: handleDeleteTree,
        repo,
        onTreeCreated: refresh,
        onRequestEdit: setPendingEditNodeId,
        pendingEditNodeId,
        onPendingEditHandled: clearPendingEdit,
        sidebarMode,
        onSidebarModeChange: setSidebarMode,
        pinnedNodes,
        onTogglePin: handleTogglePin,
        onUnpin: handleUnpin,
        onClearAllPins: handleClearAllPins,
        selectedPinNodeIds,
        onPinSelectionChange: handlePinSelectionChange,
        onCreateTreeFromContext: handleCreateTreeFromContext,
        onNavigateToNode: handleNavigateToNode,
      }
    : null;

  const renderContent = () => {
    if (repoError) {
      return (
        <div style={statusStyle}>
          <span style={{ color: '#e55' }}>Failed to initialize storage:</span> {repoError.message}
        </div>
      );
    }

    // Show sidebar + status message for empty/error states when repo is available
    const statusMessage = (() => {
      if (trees.length === 0 && !isLoading)
        return 'No conversations yet. Use ☰ in the sidebar to create one.';
      if (nodesError && trees.length > 0) return null;
      return null;
    })();

    if (statusMessage !== null && repo) {
      return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: COLORS.bg }}>
          <Sidebar nodes={[]} selectedNodeId={null} onSelect={() => {}} {...treeProps} />
          <div style={{ ...statusStyle, flex: 1 }}>{statusMessage}</div>
        </div>
      );
    }

    if (statusMessage !== null) {
      return <div style={statusStyle}>{statusMessage}</div>;
    }

    const treeId = selectedTreeId ?? '';
    if (mode === 'graph') {
      return (
        <GraphView
          nodes={effectiveNodes}
          treeId={treeId}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onCompose={handleCompose}
          onAddHumanNode={handleAddHumanNode}
          onCreateSibling={handleCreateSibling}
          selectedNodeId={selectedNodeId}
          onSelectedNodeChange={setSelectedNodeId}
          focusNodeId={focusNodeId}
          onFocusHandled={handleFocusHandled}
          onRootNodeSubmitted={handleRootNodeSubmitted}
          autoAiReply={autoAiReply}
          onOpenTagPicker={setTagPickerTarget}
          {...treeProps!}
        />
      );
    }
    return (
      <LinearView
        nodes={effectiveNodes}
        treeId={treeId}
        onDelete={handleDelete}
        onEdit={handleEdit}
        onCompose={handleCompose}
        onAddHumanNode={handleAddHumanNode}
        onCreateSibling={handleCreateSibling}
        selectedNodeId={selectedNodeId}
        onSelectedNodeChange={setSelectedNodeId}
        focusNodeId={focusNodeId}
        onFocusHandled={handleFocusHandled}
        onRootNodeSubmitted={handleRootNodeSubmitted}
        autoAiReply={autoAiReply}
        onOpenTagPicker={setTagPickerTarget}
        {...treeProps!}
      />
    );
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: COLORS.bg, color: COLORS.text }}>
      <TopBar
        mode={mode}
        onModeChange={setMode}
        autoAiReply={autoAiReply}
        onAutoAiReplyToggle={handleAutoAiReplyToggle}
        onSettingsOpen={() => setShowSettings(true)}
        onTagsOpen={() => setShowTagManager(true)}
      />

      {renderContent()}

      {showSettings && <Settings onClose={handleSettingsClose} />}

      {showTagManager && repo && (
        <TagManager repo={repo} onClose={() => setShowTagManager(false)} />
      )}

      {tagPickerTarget && repo && (
        <TagPicker
          repo={repo}
          target={tagPickerTarget}
          onClose={() => setTagPickerTarget(null)}
          onTagsChanged={refresh}
          onOpenManager={() => {
            setTagPickerTarget(null);
            setShowTagManager(true);
          }}
        />
      )}
    </div>
  );
}

const statusStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  fontFamily: FONTS.mono,
  fontSize: '13px',
  color: COLORS.textSecondary,
  gap: '6px',
};
