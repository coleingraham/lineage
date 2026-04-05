import { useMemo } from 'react';
import { COLORS, FONTS } from '../../styles/theme.js';
import type { GraphRendererProps } from './GraphRendererTypes.js';
import { ParentCard } from './ParentCard.js';
import { CurrentCard } from './CurrentCard.js';
import { ChildCard } from './ChildCard.js';
import { Connector } from './NodeCardShared.js';
import { getAncestorIds } from './graphUtils.js';
import { StreamingCard } from '../StreamingCard.js';

export function CardStackRenderer({
  nodes,
  selectedNodeId,
  callbacks,
  streaming,
  editingNodeId,
  editText,
  onEditChange,
  onEditSave,
  onEditCancel,
}: GraphRendererProps) {
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const parentNode = selectedNode?.parentId
    ? nodes.find((n) => n.id === selectedNode.parentId)
    : null;
  const children = useMemo(
    () => nodes.filter((n) => n.parentId === selectedNodeId),
    [nodes, selectedNodeId],
  );

  const ancestors = useMemo(
    () => (selectedNodeId ? getAncestorIds(nodes, selectedNodeId) : []),
    [nodes, selectedNodeId],
  );
  const breadcrumb = ancestors.map((id) => nodes.find((n) => n.id === id)!).filter(Boolean);

  const isStreamingActive = streaming && streaming.status !== 'idle';
  const showStreamingChild =
    isStreamingActive && streaming.parentNodeId === selectedNodeId;
  // Regen case: streaming parent is the selected node's parent (replacing current node)
  const isRegen =
    isStreamingActive && selectedNode?.parentId != null && streaming.parentNodeId === selectedNode.parentId;

  // When the selected node is a summary, its ancestors are "superseded"
  const isSelectedSummary = selectedNode?.type === 'summary';

  if (!selectedNode) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.muted,
          fontFamily: FONTS.mono,
          fontSize: '12px',
        }}
      >
        Select a node to view details
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar with breadcrumbs */}
      <div
        style={{
          height: '48px',
          padding: '0 24px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ color: '#222', margin: '0 7px', fontSize: '13px' }}>›</span>}
            <span
              onClick={() => callbacks.onNodeSelect(crumb.id)}
              style={{
                fontSize: '11px',
                color: i === breadcrumb.length - 1 ? '#8fb8c8' : '#2e2e2e',
                cursor: 'pointer',
                fontFamily: FONTS.mono,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                maxWidth: i === breadcrumb.length - 1 ? '200px' : '120px',
                textOverflow: 'ellipsis',
                opacity: isSelectedSummary ? 0.35 : 1,
              }}
            >
              {crumb.content.slice(0, 40) || '(root)'}
            </span>
          </span>
        ))}
        {isSelectedSummary && (
          <span
            style={{
              fontSize: '9px',
              color: COLORS.summary + 'aa',
              fontFamily: FONTS.mono,
              letterSpacing: '0.06em',
              marginLeft: '8px',
            }}
          >
            SUPERSEDED
          </span>
        )}
      </div>

      {/* Card stack */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          {parentNode && (
            <>
              <div style={{ opacity: isSelectedSummary ? 0.35 : 1, transition: 'opacity 0.15s' }}>
                <ParentCard node={parentNode} onSelect={callbacks.onNodeSelect} />
              </div>
              <Connector label="CURRENT" />
            </>
          )}

          {isRegen ? (
            <StreamingCard
              content={streaming!.content}
              thinkingContent={streaming!.thinkingContent}
              isThinking={streaming!.isThinking}
              status={streaming!.status}
              error={streaming!.error}
              onCancel={streaming!.cancel}
              onRetry={() => callbacks.onNodeRegenerate(selectedNode.id)}
              variant="full"
            />
          ) : (
            <CurrentCard
              node={selectedNode}
              isLeaf={children.length === 0}
              callbacks={callbacks}
              isEditing={editingNodeId === selectedNode.id}
              editText={editText ?? ''}
              onEditChange={onEditChange}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
            />
          )}

          {children.length > 0 && (
            <>
              <Connector label="CHILDREN" count={children.length} />
              <div>
                {children.map((ch) => (
                  <ChildCard key={ch.id} node={ch} onSelect={callbacks.onNodeSelect} />
                ))}
                {showStreamingChild && (
                  <StreamingCard
                    content={streaming!.content}
                    thinkingContent={streaming!.thinkingContent}
                    isThinking={streaming!.isThinking}
                    status={streaming!.status}
                    error={streaming!.error}
                    onCancel={streaming!.cancel}
                    onRetry={() => callbacks.onNodeReply(selectedNodeId!)}
                    variant="compact"
                  />
                )}
              </div>
            </>
          )}

          {children.length === 0 && !showStreamingChild && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 4px',
              }}
            >
              <div
                style={{
                  width: '1px',
                  height: '20px',
                  background: 'rgba(255,255,255,0.04)',
                  marginLeft: '14px',
                }}
              />
              <span
                style={{
                  fontSize: '9px',
                  color: '#222',
                  letterSpacing: '0.1em',
                  fontFamily: FONTS.mono,
                }}
              >
                LEAF NODE
              </span>
            </div>
          )}

          {children.length === 0 && showStreamingChild && (
            <>
              <Connector label="STREAMING" />
              <StreamingCard
                content={streaming!.content}
                thinkingContent={streaming!.thinkingContent}
                isThinking={streaming!.isThinking}
                status={streaming!.status}
                error={streaming!.error}
                onCancel={streaming!.cancel}
                onRetry={() => callbacks.onNodeReply(selectedNodeId!)}
                variant="full"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
