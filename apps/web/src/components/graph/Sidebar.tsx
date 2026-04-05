import { useState, useMemo, useCallback, useRef } from 'react';
import type { Tree, NodeRepository } from '@lineage/core';
import { FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode } from './GraphRendererTypes.js';
import { Dot, previewContent } from './NodeCardShared.js';
import { buildFlatList, findRoot, getAncestorIds } from './graphUtils.js';
import type { FlatNode } from './graphUtils.js';

/**
 * Build the ancestor path from root (or lowest summary ancestor) to the given node.
 */
function getHoverPath(nodes: GraphNode[], nodeId: string): string[] {
  const ancestors = getAncestorIds(nodes, nodeId);
  // Find the lowest summary node in the path and start from there
  let startIdx = 0;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = nodes.find((n) => n.id === ancestors[i]);
    if (node?.type === 'summary') {
      startIdx = i;
      break;
    }
  }
  return ancestors.slice(startIdx);
}

// ── Vertical Minimap ─────────────────────────────────────────────────────────
function VerticalMinimap({
  flat,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const activePath = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );

  // Index of the lowest summary node on the active path — nodes before
  // this are "superseded" and rendered dimmer.
  const summaryBreakIdx = useMemo(() => {
    for (let i = activePath.length - 1; i >= 0; i--) {
      const node = flat.find((n) => n.id === activePath[i]);
      if (node?.type === 'summary') return i;
    }
    return -1;
  }, [activePath, flat]);

  const hoverPath = useMemo(
    () => (hoveredNodeId ? getHoverPath(flat, hoveredNodeId) : []),
    [flat, hoveredNodeId],
  );

  const W = 226;
  const PAD = 14;
  const maxDepth = Math.max(...flat.map((n) => n.depth), 0);

  const byDepth = useMemo(() => {
    const map: Record<number, FlatNode[]> = {};
    for (const n of flat) {
      (map[n.depth] ??= []).push(n);
    }
    return map;
  }, [flat]);

  const rowH = 22;
  const H = Math.max(80, (maxDepth + 1) * rowH + PAD * 2);

  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const n of flat) {
      const siblings = byDepth[n.depth];
      const idx = siblings.indexOf(n);
      const total = siblings.length;
      pos[n.id] = {
        x: PAD + ((idx + 0.5) / total) * (W - PAD * 2),
        y: PAD + (n.depth / Math.max(1, maxDepth)) * (H - PAD * 2),
      };
    }
    return pos;
  }, [flat, byDepth, maxDepth, H]);

  return (
    <div
      style={{
        margin: '0 8px 0',
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '6px',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '6px 10px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            color: '#2e2e2e',
            letterSpacing: '0.1em',
            fontFamily: FONTS.mono,
          }}
        >
          STRUCTURE MAP
        </span>
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          {flat.length} nodes
        </span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        {/* Depth row guides */}
        {Object.keys(byDepth).map((depth) => {
          const d = parseInt(depth);
          const y = PAD + (d / Math.max(1, maxDepth)) * (H - PAD * 2);
          return (
            <line
              key={`guide-${d}`}
              x1={PAD}
              y1={y}
              x2={W - PAD}
              y2={y}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          );
        })}

        {/* Edges */}
        {flat.map((n) => {
          if (!n.parentId) return null;
          const from = positions[n.parentId];
          const to = positions[n.id];
          if (!from || !to) return null;
          const childIdx = activePath.indexOf(n.id);
          const isActive = childIdx !== -1 && activePath.includes(n.parentId);
          const isSuperseded = isActive && summaryBreakIdx !== -1 && childIdx <= summaryBreakIdx;
          const isHover =
            !isActive && hoverPath.includes(n.id) && hoverPath.includes(n.parentId);
          return (
            <line
              key={n.id + '-e'}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={
                isActive
                  ? `${nodeColor(n.type, n.isDeleted)}${isSuperseded ? '25' : '66'}`
                  : isHover
                    ? `${nodeColor(n.type, n.isDeleted)}44`
                    : 'rgba(255,255,255,0.05)'
              }
              strokeWidth={isActive ? (isSuperseded ? 1 : 1.5) : isHover ? 1.2 : 0.8}
            />
          );
        })}

        {/* Nodes */}
        {flat.map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const isSel = n.id === selected;
          const pathIdx = activePath.indexOf(n.id);
          const isPath = pathIdx !== -1;
          const isSuperseded = isPath && summaryBreakIdx !== -1 && pathIdx < summaryBreakIdx;
          const isHover = !isPath && hoverPath.includes(n.id);
          const c = nodeColor(n.type, n.isDeleted);
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => setHoveredNodeId(n.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible hit area */}
              <circle cx={pos.x} cy={pos.y} r={8} fill="transparent" />
              {isSel && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={6}
                  fill={c + '18'}
                  stroke={c + '44'}
                  strokeWidth={1}
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSel ? 3.5 : isPath || isHover ? 2.5 : 2}
                fill={
                  isSel
                    ? c
                    : isPath
                      ? c + (isSuperseded ? '44' : 'aa')
                      : isHover
                        ? c + '77'
                        : 'rgba(255,255,255,0.1)'
                }
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Drill-down focus slice ───────────────────────────────────────────────────
function DrilldownSlice({
  flat,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const ancestors = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );
  const selectedNode = flat.find((n) => n.id === selected);
  const siblings = flat.filter((n) => n.parentId === selectedNode?.parentId);
  const children = flat.filter((n) => n.parentId === selected);
  const ancestorNodes = ancestors.slice(0, -1).map((id) => flat.find((n) => n.id === id)!);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Ancestor pills */}
      {ancestorNodes.length > 0 && (
        <div
          style={{
            padding: '6px 8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            flexShrink: 0,
          }}
        >
          {ancestorNodes.map((anc, i) => (
            <div
              key={anc.id}
              onClick={() => onSelect(anc.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                paddingLeft: `${8 + i * 8}px`,
                cursor: 'pointer',
                borderRadius: '3px',
                transition: 'background 0.1s',
              }}
            >
              <svg
                width="7"
                height="7"
                viewBox="0 0 8 8"
                fill="none"
                style={{ opacity: 0.25, flexShrink: 0 }}
              >
                <path d="M2 0 L2 4 L8 4" stroke="#8fb8c8" strokeWidth="1.2" />
              </svg>
              <Dot type={anc.type} isDeleted={anc.isDeleted} size={4} />
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: FONTS.mono,
                  color: '#383838',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(previewContent(anc.content) || '(root)').slice(0, 24)}
                {(previewContent(anc.content) || '').length > 24 ? '…' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scrollable slice */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        <div
          style={{
            fontSize: '9px',
            color: '#252525',
            letterSpacing: '0.1em',
            padding: '4px 8px 4px',
            fontFamily: FONTS.mono,
          }}
        >
          {selectedNode?.parentId ? 'SIBLINGS' : 'ROOT'}
        </div>
        {siblings.map((sib) => {
          const isSelected = sib.id === selected;
          const c = nodeColor(sib.type, sib.isDeleted);
          return (
            <div
              key={sib.id}
              onClick={() => onSelect(sib.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '5px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
                borderLeft: `2px solid ${isSelected ? c : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              <Dot type={sib.type} isDeleted={sib.isDeleted} size={6} glow={isSelected} />
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: FONTS.mono,
                  color: isSelected ? '#d0d0d0' : '#666',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {previewContent(sib.content) || '(empty)'}
              </span>
              {sib._children.length > 0 && !isSelected && (
                <span style={{ fontSize: '9px', color: '#2a2a2a', flexShrink: 0 }}>
                  ↓{sib._children.length}
                </span>
              )}
            </div>
          );
        })}

        {children.length > 0 && (
          <>
            <div
              style={{
                fontSize: '9px',
                color: '#252525',
                letterSpacing: '0.1em',
                padding: '8px 8px 4px',
                fontFamily: FONTS.mono,
                borderTop: '1px solid rgba(255,255,255,0.04)',
                marginTop: '4px',
              }}
            >
              CHILDREN
            </div>
            {children.map((ch) => (
              <div
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  paddingLeft: '20px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  background: 'transparent',
                  borderLeft: '2px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <svg
                  width="7"
                  height="7"
                  viewBox="0 0 8 8"
                  fill="none"
                  style={{ opacity: 0.2, flexShrink: 0 }}
                >
                  <path d="M2 0 L2 4 L8 4" stroke="#8fb8c8" strokeWidth="1.2" />
                </svg>
                <Dot type={ch.type} isDeleted={ch.isDeleted} size={6} />
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: FONTS.mono,
                    color: '#4e4e4e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {previewContent(ch.content) || '(empty)'}
                </span>
                {ch._children.length > 0 && (
                  <span style={{ fontSize: '9px', color: '#2a2a2a', flexShrink: 0 }}>
                    ↓{ch._children.length}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Smart collapse ───────────────────────────────────────────────────────────
function SmartCollapse({
  flat,
  rootNode,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  rootNode: FlatNode | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const activePath = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );
  const [manualExpanded, setManualExpanded] = useState(new Set<string>());

  function toggle(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setManualExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function renderNode(node: FlatNode, depth: number): React.ReactNode {
    const isOnPath = activePath.includes(node.id);
    const isSelected = node.id === selected;
    const hasChildren = node._children.length > 0;
    const isExpanded = isOnPath || manualExpanded.has(node.id);
    const c = nodeColor(node.type, node.isDeleted);

    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '7px 6px',
            paddingLeft: `${6 + depth * 13}px`,
            borderRadius: '4px',
            cursor: 'pointer',
            background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
            borderLeft: `2px solid ${isSelected ? c : 'transparent'}`,
          }}
        >
          <span
            onClick={(e) => (hasChildren ? toggle(e, node.id) : null)}
            style={{
              fontSize: '10px',
              color: isOnPath ? '#454545' : '#252525',
              width: 14,
              textAlign: 'center',
              flexShrink: 0,
              lineHeight: 1,
              visibility: hasChildren ? 'visible' : 'hidden',
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </span>
          <div
            onClick={() => onSelect(node.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <Dot type={node.type} isDeleted={node.isDeleted} size={6} glow={isSelected} />
            <span
              style={{
                fontSize: '12px',
                fontFamily: FONTS.mono,
                color: isSelected ? '#d0d0d0' : isOnPath ? '#5a5a5a' : '#2e2e2e',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
            >
              {previewContent(node.content) || '(root)'}
            </span>
          </div>
        </div>
        {isExpanded &&
          hasChildren &&
          node._children.map((child) => {
            const childFlat = flat.find((f) => f.id === child.id);
            return childFlat ? renderNode(childFlat, depth + 1) : null;
          })}
      </div>
    );
  }

  if (!rootNode) return null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>{renderNode(rootNode, 0)}</div>
  );
}

// ── Conversation list ────────────────────────────────────────────────────────
function ConversationList({
  trees,
  selectedTreeId,
  onSelectTree,
  onDeleteTree,
  repo,
  onTreeCreated,
  onRequestEdit,
}: {
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (treeId: string) => void;
  onDeleteTree: (treeId: string) => void;
  repo: NodeRepository;
  onTreeCreated: () => void;
  onRequestEdit: (nodeId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleRenameStart = useCallback((treeId: string, currentTitle: string) => {
    setEditingTitleId(treeId);
    setEditingTitle(currentTitle);
  }, []);

  const handleRenameSave = useCallback(async () => {
    if (!editingTitleId) return;
    const tree = trees.find((t) => t.treeId === editingTitleId);
    if (tree) {
      try {
        await repo.putTree({ ...tree, title: editingTitle });
        onTreeCreated(); // refresh tree list
      } catch (e) {
        console.error('[ConversationList] rename failed', e);
      }
    }
    setEditingTitleId(null);
    setEditingTitle('');
  }, [editingTitleId, editingTitle, trees, repo, onTreeCreated]);

  const handleRenameCancel = useCallback(() => {
    setEditingTitleId(null);
    setEditingTitle('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const title = `Conversation ${trees.length + 1}`;
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await repo.putTree({ treeId, title, createdAt, rootNodeId });
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
      });

      onSelectTree(treeId);
      onRequestEdit(rootNodeId);
      onTreeCreated();
    } catch (e) {
      console.error('[ConversationList] create failed', e);
    } finally {
      setCreating(false);
    }
  }, [creating, trees.length, repo, onTreeCreated, onSelectTree, onRequestEdit]);

  const confirmDelete = useCallback(
    (treeId: string) => {
      onDeleteTree(treeId);
      setConfirmingDeleteId(null);
    },
    [onDeleteTree],
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px', flexShrink: 0 }}>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            width: '100%',
            background: 'rgba(143,184,200,0.08)',
            border: '1px solid rgba(143,184,200,0.15)',
            borderRadius: '5px',
            padding: '8px',
            cursor: creating ? 'default' : 'pointer',
            fontFamily: FONTS.mono,
            fontSize: '11px',
            color: '#8fb8c8',
            letterSpacing: '0.06em',
            opacity: creating ? 0.5 : 1,
          }}
        >
          + New Conversation
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {trees.map((tree) => {
          const isSelected = tree.treeId === selectedTreeId;
          return (
            <div
              key={tree.treeId}
              onClick={() => onSelectTree(tree.treeId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 10px',
                borderRadius: '5px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
                borderLeft: `2px solid ${isSelected ? '#8fb8c8' : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              {editingTitleId === tree.treeId ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSave();
                    if (e.key === 'Escape') handleRenameCancel();
                  }}
                  onBlur={handleRenameCancel}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontFamily: FONTS.mono,
                    color: '#d0d0d0',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(143,184,200,0.3)',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    fontFamily: FONTS.mono,
                    color: isSelected ? '#d0d0d0' : '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tree.title || tree.treeId.slice(0, 8)}
                </span>
              )}
              {confirmingDeleteId === tree.treeId ? (
                <div
                  style={{ display: 'flex', gap: '4px', flexShrink: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => confirmDelete(tree.treeId)}
                    style={{
                      background: 'rgba(238,85,85,0.15)',
                      border: '1px solid rgba(238,85,85,0.3)',
                      borderRadius: '3px',
                      color: '#e55',
                      cursor: 'pointer',
                      fontSize: '9px',
                      padding: '2px 6px',
                      fontFamily: FONTS.mono,
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(null)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '3px',
                      color: '#666',
                      cursor: 'pointer',
                      fontSize: '9px',
                      padding: '2px 6px',
                      fontFamily: FONTS.mono,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : editingTitleId !== tree.treeId && (
                <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameStart(tree.treeId, tree.title || '');
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#444',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px 4px',
                      fontFamily: FONTS.mono,
                      opacity: 0.6,
                    }}
                    title="Rename conversation"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingDeleteId(tree.treeId);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#444',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px 4px',
                      fontFamily: FONTS.mono,
                      opacity: 0.6,
                    }}
                    title="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
}: {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
  sidebarMode?: 'focus' | 'power' | 'conversations';
  onSidebarModeChange?: (mode: 'focus' | 'power' | 'conversations') => void;
  trees?: Tree[];
  selectedTreeId?: string | null;
  onSelectTree?: (treeId: string) => void;
  onDeleteTree?: (treeId: string) => void;
  repo?: NodeRepository;
  onTreeCreated?: () => void;
  onRequestEdit?: (nodeId: string) => void;
}) {
  const [localMode, setLocalMode] = useState<'focus' | 'power' | 'conversations'>('conversations');
  const mode = sidebarMode ?? localMode;
  const setMode = onSidebarModeChange ?? setLocalMode;
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

      {/* Mode label */}
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
            : 'CONVERSATIONS'}
      </div>

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
      </div>

      {/* Depth bar */}
      {mode !== 'conversations' && (
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
