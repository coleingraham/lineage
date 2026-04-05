import { useMemo } from 'react';
import { COLORS, FONTS } from '../../styles/theme.js';
import type { GraphRendererProps } from './GraphRendererTypes.js';
import { ParentCard } from './ParentCard.js';
import { CurrentCard } from './CurrentCard.js';
import { ChildCard } from './ChildCard.js';
import { Connector } from './NodeCardShared.js';
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
