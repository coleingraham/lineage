import { useState } from 'react';
import { COLORS, FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode } from './GraphRendererTypes.js';

export function RoleIcon({ role, size = 16 }: { role: string; size?: number }) {
  if (role === 'human') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: COLORS.human + '22',
          border: `1px solid ${COLORS.human}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: '50%',
            background: COLORS.human + '99',
          }}
        />
      </div>
    );
  }
  if (role === 'summary') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '2px',
          background: COLORS.summary + '22',
          border: `1px solid ${COLORS.summary}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: size * 0.4,
            height: size * 0.4,
            borderRadius: '1px',
            background: COLORS.summary + '99',
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '3px',
        background: COLORS.ai + '22',
        border: `1px solid ${COLORS.ai}44`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 10 10" fill="none">
        <path
          d="M2 8 L5 2 L8 8"
          stroke={COLORS.ai + 'cc'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ActionBtn({
  label,
  color,
  onClick,
  primary,
}: {
  label: string;
  color: string;
  onClick: () => void;
  primary?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? color + (primary ? '28' : '18') : color + (primary ? '18' : '0d'),
        border: `1px solid ${color + (primary ? '55' : '33')}`,
        color: color + (primary ? 'ff' : 'cc'),
        borderRadius: '5px',
        padding: '4px 10px',
        fontSize: '10px',
        cursor: 'pointer',
        fontFamily: FONTS.mono,
        letterSpacing: '0.04em',
        transition: 'all 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export function Connector({ label, count }: { label?: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px' }}>
      <div
        style={{
          width: '1px',
          height: '24px',
          background: 'rgba(255,255,255,0.06)',
          marginLeft: '14px',
        }}
      />
      {label && (
        <span
          style={{
            fontSize: '9px',
            color: '#252525',
            letterSpacing: '0.1em',
            fontFamily: FONTS.mono,
          }}
        >
          {label}
          {count != null ? ` · ${count}` : ''}
        </span>
      )}
    </div>
  );
}

export function Dot({
  type,
  isDeleted,
  size = 6,
  glow,
}: {
  type: string;
  isDeleted?: boolean;
  size?: number;
  glow?: boolean;
}) {
  const c = nodeColor(type, isDeleted ?? false);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: type === 'summary' ? '2px' : '50%',
        background: c,
        flexShrink: 0,
        boxShadow: glow ? `0 0 6px ${c}88` : 'none',
        transition: 'box-shadow 0.2s',
      }}
    />
  );
}

export function nodeLabel(node: GraphNode): string {
  if (node.isDeleted) return 'DELETED';
  return node.type.toUpperCase();
}
