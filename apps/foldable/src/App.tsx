import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRepository } from './hooks/useRepository.js';
import { useTreeData, useTreeList } from './hooks/useTreeData.js';
import { useAuthoring } from './hooks/useAuthoring.js';
import { useSession } from './lib/session.js';
import { useFoldStore, useFoldState } from './fold/store.js';
import { startSizeInferredSource } from './fold/sizeInferredSource.js';
import type { FoldMode } from './fold/types.js';
import { buildChildrenMap, buildNodeMap, deepestNewestLeaf } from './lib/tree.js';
import { CoverView } from './views/CoverView.js';
import { ComposeBar } from './components/ComposeBar.js';
import { TreeBrowser } from './components/TreeBrowser.js';
import { exportBackup } from './lib/backup.js';
import { COLORS, FONTS } from './styles/theme.js';

/** Posture-driven layout envelope: width + an informational banner per mode. */
const SHELL: Record<FoldMode, { maxWidth: number; banner: string | null }> = {
  closed: { maxWidth: 680, banner: null },
  book: {
    maxWidth: 900,
    banner: 'Book posture — two-page spread (left spine · right divergences) lands next phase.',
  },
  flat: {
    maxWidth: 1100,
    banner: 'Flat canvas — graph/restructure view lands next phase.',
  },
};

function deriveTitle(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine || 'Untitled monologue';
}

export function App() {
  const repo = useRepository();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const [session, setSession] = useSession();
  // Explicit "the author is starting a new monologue" intent. Kept separate
  // from `selectedTreeId` so the auto-select effect below can't fight the +
  // button — nulling the selection alone would just get re-selected.
  const [creatingNew, setCreatingNew] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const trees = useTreeList(repo, refreshKey);
  const { nodes, loading } = useTreeData(repo, session.selectedTreeId, refreshKey);
  const authoring = useAuthoring(repo, refresh);

  const fold = useFoldState();
  const setFold = useFoldStore((s) => s.setFold);

  // Size-inferred posture source (B4): the only source in this slice.
  useEffect(() => startSizeInferredSource(setFold), [setFold]);

  // Auto-select a tree on first load when none is chosen — but never while the
  // author is intentionally composing a new one.
  useEffect(() => {
    if (!creatingNew && !session.selectedTreeId && trees.length > 0) {
      setSession({ selectedTreeId: trees[0].treeId, focusedNodeId: null });
    }
  }, [creatingNew, session.selectedTreeId, trees, setSession]);

  // Resolve a default focus (deepest tip of the newest line) once nodes load.
  useEffect(() => {
    if (loading || nodes.length === 0) return;
    const present = session.focusedNodeId && nodes.some((n) => n.nodeId === session.focusedNodeId);
    if (present) return;
    const rootId = nodes.find((n) => n.parentId === null)?.nodeId;
    if (!rootId) return;
    const nodeMap = buildNodeMap(nodes);
    const childrenMap = buildChildrenMap(nodes);
    setSession({ focusedNodeId: deepestNewestLeaf(rootId, nodeMap, childrenMap) });
  }, [loading, nodes, session.focusedNodeId, setSession]);

  const onFocus = useCallback((nodeId: string) => setSession({ focusedNodeId: nodeId }), [setSession]);

  const selectTree = useCallback(
    (id: string) => {
      setCreatingNew(false);
      setSession({ selectedTreeId: id, focusedNodeId: null });
    },
    [setSession],
  );

  const deleteTree = useCallback(
    async (treeId: string) => {
      if (!repo) return;
      await repo.deleteTree(treeId);
      // If the open tree was deleted, drop the selection — the auto-select
      // effect will pick another (or fall through to the empty state).
      if (treeId === session.selectedTreeId) {
        setSession({ selectedTreeId: null, focusedNodeId: null });
      }
      refresh();
    },
    [repo, session.selectedTreeId, setSession, refresh],
  );

  const backup = useCallback(async () => {
    if (!repo) return;
    await exportBackup(repo, new Date());
  }, [repo]);

  const startMonologue = useCallback(
    async (content: string) => {
      const { treeId, rootNodeId } = await authoring.createTree(deriveTitle(content), content);
      setCreatingNew(false);
      setSession({ selectedTreeId: treeId, focusedNodeId: rootNodeId });
    },
    [authoring, setSession],
  );

  const shell = SHELL[fold.mode];
  const selectedTree = useMemo(
    () => trees.find((t) => t.treeId === session.selectedTreeId) ?? null,
    [trees, session.selectedTreeId],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: COLORS.bg }}>
      <Header
        title={creatingNew ? null : (selectedTree?.title ?? null)}
        onOpenBrowser={() => setBrowserOpen(true)}
        onNew={() => setCreatingNew(true)}
        mode={fold.mode}
        source={fold.source}
      />

      {shell.banner && (
        <div
          style={{
            padding: '6px 14px',
            background: COLORS.elevated,
            borderBottom: `1px solid ${COLORS.border}`,
            color: COLORS.textSecondary,
            fontSize: 12,
            fontFamily: FONTS.mono,
            textAlign: 'center',
          }}
        >
          {shell.banner}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {!repo ? (
          <Centered>Opening on-device store…</Centered>
        ) : !creatingNew && session.selectedTreeId && selectedTree ? (
          session.focusedNodeId ? (
            <CoverView
              treeId={session.selectedTreeId}
              nodes={nodes}
              focusedNodeId={session.focusedNodeId}
              onFocus={onFocus}
              authoring={authoring}
              maxWidth={shell.maxWidth}
            />
          ) : (
            <Centered>{loading ? 'Loading…' : 'Empty tree.'}</Centered>
          )
        ) : (
          <EmptyState onStart={startMonologue} />
        )}
      </div>

      {browserOpen && (
        <TreeBrowser
          trees={trees}
          selectedTreeId={session.selectedTreeId}
          onSelect={selectTree}
          onDelete={deleteTree}
          onBackup={backup}
          onClose={() => setBrowserOpen(false)}
          mode={fold.mode}
        />
      )}
    </div>
  );
}

interface HeaderProps {
  title: string | null;
  onOpenBrowser: () => void;
  onNew: () => void;
  mode: FoldMode;
  source: string;
}

function Header({ title, onOpenBrowser, onNew, mode, source }: HeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        paddingTop: 'calc(8px + env(safe-area-inset-top))',
        background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <button
        onClick={onOpenBrowser}
        title="Browse monologues"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          background: COLORS.bg,
          color: title ? COLORS.text : COLORS.textSecondary,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          fontSize: 14,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>☰</span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title ?? 'Select a monologue'}
        </span>
      </button>

      <span
        title={`posture source: ${source}`}
        style={{
          fontSize: 11,
          fontFamily: FONTS.mono,
          color: COLORS.textSecondary,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 999,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}
      >
        {mode}
      </span>

      <button
        onClick={onNew}
        style={{
          padding: '6px 12px',
          background: COLORS.branch,
          color: COLORS.bg,
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 700,
          fontFamily: FONTS.mono,
        }}
      >
        ＋
      </button>
    </header>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.textSecondary,
        fontFamily: FONTS.mono,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({ onStart }: { onStart: (content: string) => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ fontFamily: FONTS.serif, fontSize: 22, color: COLORS.text }}>
          A tree of one mind
        </div>
        <div style={{ color: COLORS.textSecondary, fontSize: 14, maxWidth: 360 }}>
          Capture a thought to start a monologue. Continue the line, or diverge into an
          alternative, elaboration, or objection.
        </div>
      </div>
      <ComposeBar placeholder="Start a monologue…" submitLabel="Start" onSubmit={onStart} />
    </div>
  );
}
