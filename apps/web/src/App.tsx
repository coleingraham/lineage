import { useState, useEffect, useCallback } from 'react';
import { GraphView } from './views/GraphView.js';
import { LinearView } from './views/LinearView.js';
import { Settings } from './components/Settings.js';
import { COLORS, FONTS } from './styles/theme.js';
import { useRepository } from './hooks/useRepository.js';
import { useTreeList } from './hooks/useTreeList.js';
import { useTreeData } from './hooks/useTreeData.js';
import { useStreamingStore } from './store/streaming.js';
import { useNodeOperations } from './hooks/useNodeOperations.js';
import { Sidebar } from './components/graph/Sidebar.js';
import type { SidebarMode, PinnedNode } from './components/graph/GraphRendererTypes.js';
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
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('conversations');

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
          nodes={nodes}
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
          {...treeProps!}
        />
      );
    }
    return (
      <LinearView
        nodes={nodes}
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
        {...treeProps!}
      />
    );
  };

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: COLORS.bg, color: COLORS.text }}>
      {/* Top bar */}
      <div
        style={{
          position: 'fixed',
          top: '12px',
          right: '16px',
          zIndex: 100,
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        {/* View toggle */}
        <div
          style={{
            display: 'flex',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '6px',
            overflow: 'hidden',
            fontFamily: FONTS.mono,
            fontSize: '10px',
            letterSpacing: '0.06em',
          }}
        >
          <button
            onClick={() => setMode('graph')}
            style={{
              background: mode === 'graph' ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: mode === 'graph' ? COLORS.text : COLORS.textSecondary,
              border: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: FONTS.mono,
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            Graph
          </button>
          <button
            onClick={() => setMode('linear')}
            style={{
              background: mode === 'linear' ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: mode === 'linear' ? COLORS.text : COLORS.textSecondary,
              border: 'none',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: FONTS.mono,
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            Linear
          </button>
        </div>

        {/* Settings gear */}
        <button
          onClick={() => setShowSettings(true)}
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '6px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontFamily: FONTS.mono,
            fontSize: '12px',
            color: COLORS.textSecondary,
          }}
          title="Settings"
        >
          &#9881;
        </button>
      </div>

      {renderContent()}

      {showSettings && <Settings onClose={handleSettingsClose} />}
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
