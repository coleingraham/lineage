import { useState, useEffect, useCallback } from 'react';
import { GraphView } from './views/GraphView.js';
import { LinearView } from './views/LinearView.js';
import { Settings } from './components/Settings.js';
import { COLORS, FONTS } from './styles/theme.js';
import { useRepository } from './hooks/useRepository.js';
import { useTreeList } from './hooks/useTreeList.js';
import { useTreeData } from './hooks/useTreeData.js';
import { useStreamingStore } from './store/streaming.js';
import { Sidebar } from './components/graph/Sidebar.js';
import './styles/graph.css';

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
  const [sidebarMode, setSidebarMode] = useState<'focus' | 'power' | 'conversations'>('conversations');
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

  // Auto-select first tree if none selected (or selected tree no longer exists)
  useEffect(() => {
    if (treesLoading || trees.length === 0) return;
    const exists = trees.some((t) => t.treeId === selectedTreeId);
    if (!exists) {
      setSelectedTreeId(trees[0].treeId);
    }
  }, [trees, treesLoading, selectedTreeId]);

  // Persist selected tree & reset node selection when tree changes
  useEffect(() => {
    if (selectedTreeId) {
      localStorage.setItem(SELECTED_TREE_KEY, selectedTreeId);
    } else {
      localStorage.removeItem(SELECTED_TREE_KEY);
    }
    setSelectedNodeId(null);
  }, [selectedTreeId]);

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

  // ── Callbacks for views ─────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (nodeId: string) => {
      if (!repo) return;
      try {
        await repo.softDeleteNode(nodeId);
        refresh();
      } catch (e) {
        console.error('[App] delete failed', e);
      }
    },
    [repo, refresh],
  );

  const handleDeleteTree = useCallback(
    async (treeId: string) => {
      if (!repo) return;
      try {
        await repo.deleteTree(treeId);
        if (treeId === selectedTreeId) {
          setSelectedTreeId(null);
        }
        refresh();
      } catch (e) {
        console.error('[App] delete tree failed', e);
      }
    },
    [repo, selectedTreeId, refresh],
  );

  const generateTitle = useCallback(
    async (treeId: string, content: string) => {
      if (!repo) return;
      const serverUrl =
        localStorage.getItem('lineage:serverUrl') || 'http://localhost:3000';
      const model = localStorage.getItem('lineage:llmModel') || undefined;
      try {
        const res = await fetch(`${serverUrl}/trees/${treeId}/generate-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, ...(model && { model }) }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string };
        if (data.title) {
          const tree = trees.find((t) => t.treeId === treeId);
          if (tree) {
            await repo.putTree({ ...tree, title: data.title });
            refresh();
          }
        }
      } catch (e) {
        console.error('[App] title generation failed', e);
      }
    },
    [repo, trees, refresh],
  );

  const handleRootNodeSubmitted = useCallback(
    (content: string) => {
      if (selectedTreeId && content.trim()) {
        generateTitle(selectedTreeId, content);
      }
    },
    [selectedTreeId, generateTitle],
  );

  const handleEdit = useCallback(
    async (nodeId: string, content: string) => {
      if (!selectedTreeId) return;
      const serverUrl =
        localStorage.getItem('lineage:serverUrl') || 'http://localhost:3000';
      try {
        const res = await fetch(
          `${serverUrl}/trees/${selectedTreeId}/nodes/${nodeId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          },
        );
        if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
        refresh();
      } catch (e) {
        console.error('[App] edit failed', e);
      }
    },
    [selectedTreeId, refresh],
  );

  const handleCreateSibling = useCallback(
    async (originalNodeId: string, content: string): Promise<string | null> => {
      if (!repo || !selectedTreeId) return null;
      const original = nodes.find((n) => n.nodeId === originalNodeId);
      if (!original || !original.parentId) return null;
      try {
        const nodeId = crypto.randomUUID();
        await repo.putNode({
          nodeId,
          treeId: selectedTreeId,
          parentId: original.parentId,
          type: 'human',
          content,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          modelName: null,
          provider: null,
          tokenCount: null,
          embeddingModel: null,
        });
        refresh();
        return nodeId;
      } catch (e) {
        console.error('[App] create sibling failed', e);
        return null;
      }
    },
    [repo, selectedTreeId, nodes, refresh],
  );

  const handleCompose = useCallback(
    async (parentNodeId: string, content: string) => {
      if (!repo || !selectedTreeId) return;
      try {
        await repo.putNode({
          nodeId: crypto.randomUUID(),
          treeId: selectedTreeId,
          parentId: parentNodeId,
          type: 'human',
          content,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          modelName: null,
          provider: null,
          tokenCount: null,
          embeddingModel: null,
        });
        refresh();
      } catch (e) {
        console.error('[App] compose failed', e);
      }
    },
    [repo, selectedTreeId, refresh],
  );

  const handleAddHumanNode = useCallback(
    async (parentNodeId: string) => {
      if (!repo || !selectedTreeId) return;
      try {
        const nodeId = crypto.randomUUID();
        await repo.putNode({
          nodeId,
          treeId: selectedTreeId,
          parentId: parentNodeId,
          type: 'human',
          content: '',
          isDeleted: false,
          createdAt: new Date().toISOString(),
          modelName: null,
          provider: null,
          tokenCount: null,
          embeddingModel: null,
        });
        refresh();
        console.log(`[App] handleAddHumanNode: setPendingEditNodeId(${nodeId})`);
        setPendingEditNodeId(nodeId);
      } catch (e) {
        console.error('[App] add human node failed', e);
      }
    },
    [repo, selectedTreeId, refresh],
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
      }
    : null;

  const renderContent = () => {
    if (repoError) {
      return (
        <div style={statusStyle}>
          <span style={{ color: '#e55' }}>Failed to initialize storage:</span>{' '}
          {repoError.message}
        </div>
      );
    }

    // Show sidebar + status message for empty/error states when repo is available
    const statusMessage = (() => {
      if (trees.length === 0 && !isLoading) return 'No conversations yet. Use ☰ in the sidebar to create one.';
      if (nodesError && trees.length > 0) return null; // tree was likely just deleted, auto-select will fix
      return null;
    })();

    if (statusMessage !== null && repo) {
      return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: COLORS.bg }}>
          <Sidebar
            nodes={[]}
            selectedNodeId={null}
            onSelect={() => {}}
            {...treeProps}
          />
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
