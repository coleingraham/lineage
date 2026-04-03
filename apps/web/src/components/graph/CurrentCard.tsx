import { useState } from 'react';
import { COLORS, FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphCallbacks, GraphNode } from './GraphRendererTypes.js';
import { ActionBtn, RoleIcon } from './NodeCardShared.js';

export function CurrentCard({
  node,
  isLeaf,
  callbacks,
}: {
  node: GraphNode;
  isLeaf: boolean;
  callbacks: GraphCallbacks;
}) {
  const c = nodeColor(node.type, node.isDeleted);
  const [hover, setHover] = useState(false);

  if (node.isDeleted) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${COLORS.muted}44`,
          borderRadius: '8px',
          padding: '22px 26px',
          opacity: 0.35,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span
            style={{
              fontSize: '9px',
              color: COLORS.muted,
              letterSpacing: '0.08em',
              background: COLORS.muted + '18',
              padding: '2px 8px',
              borderRadius: '3px',
              fontFamily: FONTS.mono,
            }}
          >
            DELETED
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
        </div>
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: '#383838',
            lineHeight: 1.75,
            margin: 0,
            textDecoration: 'line-through',
          }}
        >
          {node.content || '(empty)'}
        </p>
      </div>
    );
  }

  if (node.type === 'summary') {
    return (
      <div
        title="Summary nodes condense the conversation above into a single message. When generating new replies below a summary, only the summary is used as context — not the full original thread."
        style={{
          background: 'rgba(184,160,216,0.06)',
          border: `1px solid ${COLORS.summary}33`,
          borderLeft: `3px solid ${COLORS.summary}`,
          borderRadius: '8px',
          padding: '22px 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '2px',
              background: COLORS.summary,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              color: COLORS.summary + 'cc',
              fontFamily: FONTS.mono,
              letterSpacing: '0.08em',
            }}
          >
            SUMMARY · IMMUTABLE
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
        </div>
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: COLORS.textSecondary,
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {node.content || '(empty)'}
        </p>
        <div
          style={{
            marginTop: '12px',
            fontSize: '10px',
            color: COLORS.summary + '88',
            fontFamily: FONTS.mono,
            fontStyle: 'italic',
          }}
        >
          This summary replaces the conversation above for context in future LLM calls.
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.1)`,
        borderLeft: `3px solid ${c}`,
        borderRadius: '8px',
        padding: '22px 26px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <RoleIcon role={node.type} size={18} />
        <span
          style={{
            fontSize: '9px',
            color: c,
            letterSpacing: '0.08em',
            background: c + '18',
            padding: '2px 8px',
            borderRadius: '3px',
            fontFamily: FONTS.mono,
          }}
        >
          {node.type.toUpperCase()}
        </span>
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          depth {node.depth}
        </span>
        <div style={{ flex: 1 }} />
        {(hover || isLeaf) && (
          <div style={{ display: 'flex', gap: '5px' }}>
            {node.type === 'human' && (
              <ActionBtn
                label="Edit"
                color={COLORS.human}
                onClick={() => callbacks.onNodeEdit(node.id)}
              />
            )}
            {node.type === 'ai' && (
              <ActionBtn
                label="↺ Regenerate"
                color={COLORS.ai}
                onClick={() => callbacks.onNodeRegenerate(node.id)}
              />
            )}
            <ActionBtn
              label={node.type === 'human' ? 'Generate reply ↓' : 'Add reply ↓'}
              color={c}
              onClick={() => callbacks.onNodeReply(node.id)}
              primary
            />
            <ActionBtn
              label="∑ Summarize"
              color={COLORS.summary}
              onClick={() => callbacks.onNodeSummarize(node.id)}
            />
          </div>
        )}
      </div>
      <h2
        style={{
          fontFamily: FONTS.serif,
          fontWeight: 400,
          fontSize: '18px',
          color: '#ececec',
          lineHeight: 1.45,
          margin: '0 0 14px',
        }}
      >
        {node.content || '(empty)'}
      </h2>
      <p
        style={{
          fontSize: '12px',
          color: '#383838',
          fontFamily: FONTS.mono,
          lineHeight: 1.75,
          margin: 0,
        }}
      >
        Navigate the tree by clicking the parent card above to go up, or any child card below to go
        deeper. Use the sidebar to jump anywhere directly.
      </p>
    </div>
  );
}
