import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Tree, NodeRepository, SearchResult } from '@lineage/core';
import { nodeColor, COLORS } from '../../styles/theme.js';
import type { GraphNode, SidebarMode, PinnedNode } from './GraphRendererTypes.js';
import { buildFlatList, findRoot, getAncestorIds } from './graphUtils.js';
import { FONTS } from '../../styles/theme.js';
import { VerticalMinimap } from './VerticalMinimap.js';
import { DrilldownSlice } from './DrilldownSlice.js';
import { SmartCollapse } from './SmartCollapse.js';
import { ConversationList } from './ConversationList.js';
import { PinnedList } from './PinnedList.js';

// ── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({
  nodes,
  selectedNodeId,
  onSelect,
  sidebarMode,
  onSidebarModeChange,
  trees,
  selectedTreeId,
  onSelectTree,
  onDeleteTree,
  repo,
  onTreeCreated,
  onRequestEdit,
  pinnedNodes,
  onUnpin,
  onClearAllPins,
  selectedPinNodeIds,
  onPinSelectionChange,
  onCreateTreeFromContext,
  onNavigateToNode,
}: {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  sidebarMode?: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
  trees?: Tree[];
  selectedTreeId?: string | null;
  onSelectTree?: (treeId: string) => void;
  onDeleteTree?: (treeId: string) => void;
  repo?: NodeRepository;
  onTreeCreated?: () => void;
  onRequestEdit?: (nodeId: string) => void;
  pinnedNodes?: PinnedNode[];
  onUnpin?: (nodeId: string) => void;
  onClearAllPins?: () => void;
  selectedPinNodeIds?: Set<string>;
  onPinSelectionChange?: (ids: Set<string>) => void;
  onCreateTreeFromContext?: () => Promise<void>;
  onNavigateToNode?: (treeId: string, nodeId: string) => void;
}) {
  const [localMode, setLocalMode] = useState<SidebarMode>('conversations');
  const mode = sidebarMode ?? localMode;
  const setMode = onSidebarModeChange ?? setLocalMode;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    trees: Tree[];
    nodes: SearchResult[];
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearchQuery(q);
      setSearchError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setSearchResults(null);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      debounceRef.current = setTimeout(async () => {
        try {
          // Prefer direct fetch to the server search endpoint (remote mode)
          const serverUrl = localStorage.getItem('lineage:serverUrl');
          if (serverUrl) {
            const url = serverUrl.replace(/\/+$/, '');
            const params = new URLSearchParams({ q: q.trim() });
            const res = await fetch(`${url}/search?${params}`);
            if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
            const data = (await res.json()) as {
              trees: Tree[];
              nodes: SearchResult[];
            };
            setSearchResults(data);
          } else if (repo) {
            // Local mode — use repo methods directly
            const [trees, nodes] = await Promise.all([
              repo.searchTrees(q.trim()),
              repo.searchNodes({ query: q.trim() }),
            ]);
            setSearchResults({ trees, nodes });
          } else {
            setSearchError('No search available');
          }
        } catch (e) {
          console.error('[search]', e);
          setSearchError(e instanceof Error ? e.message : 'Search failed');
          setSearchResults(null);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [repo],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isSearchActive = searchQuery.trim().length > 0;

  const flat = useMemo(() => buildFlatList(nodes), [nodes]);
  const rootNode = useMemo(() => {
    const root = findRoot(nodes);
    return root ? flat.find((f) => f.id === root.id) : undefined;
  }, [nodes, flat]);
  const selectedNode = flat.find((n) => n.id === selectedNodeId);
  const maxDepth = Math.max(...flat.map((n) => n.depth), 0);

  // Build the path from root to selected node for the depth bar coloring
  const pathNodes = useMemo(() => {
    if (!selectedNodeId) return [];
    const ids = getAncestorIds(flat, selectedNodeId);
    return ids.map((id) => flat.find((n) => n.id === id)!).filter(Boolean);
  }, [flat, selectedNodeId]);

  return (
    <div
      style={{
        width: '258px',
        flexShrink: 0,
        background: '#0a0b0e',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 14px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="4" r="2.5" fill="#e2c97e" />
          <circle cx="4" cy="14" r="2.5" fill="#8fb8c8" />
          <circle cx="18" cy="14" r="2.5" fill="#7ec8a0" />
          <line
            x1="11"
            y1="6.5"
            x2="4"
            y2="11.5"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.2"
          />
          <line
            x1="11"
            y1="6.5"
            x2="18"
            y2="11.5"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.2"
          />
        </svg>
        <span style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#c8c8c8' }}>LINEAGE</span>

        {/* Mode toggle */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '5px',
            overflow: 'hidden',
          }}
        >
          {(
            [
              { id: 'conversations', label: '☰' },
              { id: 'focus', label: 'Focus' },
              { id: 'power', label: '⚡' },
              { id: 'pins', label: 'Pin' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                background: mode === m.id ? 'rgba(143,184,200,0.15)' : 'transparent',
                border: 'none',
                color: mode === m.id ? '#8fb8c8' : '#333',
                padding: '4px 9px',
                fontSize: '10px',
                cursor: 'pointer',
                fontFamily: FONTS.mono,
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search input */}
      <div style={{ padding: '8px 14px 4px', flexShrink: 0 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search..."
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${isSearchActive ? 'rgba(143,184,200,0.3)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: '5px',
            padding: '5px 10px',
            fontSize: '11px',
            color: COLORS.text,
            fontFamily: FONTS.mono,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Mode label */}
      {!isSearchActive && (
        <div
          style={{
            padding: '6px 14px 4px',
            fontSize: '9px',
            color: '#252525',
            letterSpacing: '0.1em',
            fontFamily: FONTS.mono,
            flexShrink: 0,
          }}
        >
          {mode === 'focus'
            ? 'FOCUS VIEW — DRILL DOWN'
            : mode === 'power'
              ? 'POWER VIEW — MAP + TREE'
              : mode === 'pins'
                ? 'PINNED NODES'
                : 'CONVERSATIONS'}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingTop: '2px',
        }}
      >
        {isSearchActive ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
            {isSearching && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#555',
                  fontFamily: FONTS.mono,
                  padding: '8px 4px',
                }}
              >
                Searching...
              </div>
            )}
            {searchError && !isSearching && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#e55',
                  fontFamily: FONTS.mono,
                  padding: '8px 4px',
                }}
              >
                {searchError}
              </div>
            )}
            {searchResults && !isSearching && (
              <>
                {searchResults.trees.length === 0 && searchResults.nodes.length === 0 && (
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#333',
                      fontFamily: FONTS.mono,
                      padding: '8px 4px',
                    }}
                  >
                    No results
                  </div>
                )}
                {searchResults.trees.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: '9px',
                        color: '#444',
                        letterSpacing: '0.1em',
                        fontFamily: FONTS.mono,
                        padding: '4px 4px 2px',
                      }}
                    >
                      CONVERSATIONS
                    </div>
                    {searchResults.trees.map((tree) => (
                      <div
                        key={tree.treeId}
                        onClick={() => onSelectTree?.(tree.treeId)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: COLORS.text,
                          fontFamily: FONTS.serif,
                          background:
                            tree.treeId === selectedTreeId
                              ? 'rgba(143,184,200,0.1)'
                              : 'transparent',
                        }}
                      >
                        {tree.title}
                      </div>
                    ))}
                  </>
                )}
                {searchResults.nodes.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: '9px',
                        color: '#444',
                        letterSpacing: '0.1em',
                        fontFamily: FONTS.mono,
                        padding: '8px 4px 2px',
                      }}
                    >
                      NODES
                    </div>
                    {searchResults.nodes.slice(0, 50).map((result) => (
                      <div
                        key={result.node.nodeId}
                        onClick={() => {
                          if (onNavigateToNode) {
                            onNavigateToNode(result.node.treeId, result.node.nodeId);
                          } else {
                            onSelectTree?.(result.node.treeId);
                          }
                        }}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          borderLeft: `2px solid ${nodeColor(result.node.type, false)}`,
                          marginBottom: '2px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '9px',
                            color: '#444',
                            fontFamily: FONTS.mono,
                            marginBottom: '2px',
                          }}
                        >
                          <span
                            style={{
                              color: nodeColor(result.node.type, false),
                              letterSpacing: '0.06em',
                            }}
                          >
                            {result.node.type.toUpperCase()}
                          </span>
                          {' · '}
                          {result.treeTitle}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#888',
                            fontFamily: FONTS.serif,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {result.node.content.slice(0, 100)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {mode === 'focus' && (
              <DrilldownSlice flat={flat} selected={selectedNodeId} onSelect={onSelect} />
            )}
            {mode === 'power' && (
              <>
                <VerticalMinimap flat={flat} selected={selectedNodeId} onSelect={onSelect} />
                <div
                  style={{
                    height: '1px',
                    background: 'rgba(255,255,255,0.04)',
                    margin: '0 8px',
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    fontSize: '9px',
                    color: '#252525',
                    letterSpacing: '0.1em',
                    padding: '0 14px 2px',
                    fontFamily: FONTS.mono,
                    flexShrink: 0,
                  }}
                >
                  TREE
                </div>
                <SmartCollapse
                  flat={flat}
                  rootNode={rootNode}
                  selected={selectedNodeId}
                  onSelect={onSelect}
                />
              </>
            )}
            {mode === 'conversations' &&
              trees &&
              onSelectTree &&
              onDeleteTree &&
              repo &&
              onTreeCreated &&
              onRequestEdit && (
                <ConversationList
                  trees={trees}
                  selectedTreeId={selectedTreeId ?? null}
                  onSelectTree={onSelectTree}
                  onDeleteTree={onDeleteTree}
                  repo={repo}
                  onTreeCreated={onTreeCreated}
                  onRequestEdit={onRequestEdit}
                />
              )}
            {mode === 'pins' && pinnedNodes && onUnpin && onClearAllPins && (
              <PinnedList
                pinnedNodes={pinnedNodes}
                currentTreeNodes={nodes}
                currentTreeId={selectedTreeId ?? null}
                onSelect={onSelect}
                onSelectTree={onSelectTree ?? (() => {})}
                onUnpin={onUnpin}
                onClearAll={onClearAllPins}
                trees={trees ?? []}
                selectedPinNodeIds={selectedPinNodeIds ?? new Set()}
                onPinSelectionChange={onPinSelectionChange ?? (() => {})}
                onCreateTreeFromContext={onCreateTreeFromContext ?? (() => Promise.resolve())}
              />
            )}
          </>
        )}
      </div>

      {/* Depth bar */}
      {mode !== 'conversations' && mode !== 'pins' && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex',
            gap: '3px',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '9px',
              color: '#252525',
              marginRight: '5px',
              letterSpacing: '0.06em',
              fontFamily: FONTS.mono,
            }}
          >
            DEPTH
          </span>
          {Array.from({ length: Math.max(7, maxDepth + 1) }, (_, d) => {
            const pathNode = pathNodes[d];
            const c = pathNode ? nodeColor(pathNode.type, pathNode.isDeleted) : undefined;
            return (
              <div
                key={d}
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: '2px',
                  background: c ?? 'rgba(255,255,255,0.05)',
                  opacity: c ? 1 : 1,
                  transition: 'all 0.2s ease',
                }}
              />
            );
          })}
          <span
            style={{
              fontSize: '9px',
              color: '#333',
              marginLeft: '4px',
              fontFamily: FONTS.mono,
            }}
          >
            {selectedNode?.depth ?? 0}
          </span>
        </div>
      )}
    </div>
  );
}
