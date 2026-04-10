import type { Tag } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';

interface TagPillProps {
  tag: Tag;
  size?: 'small' | 'normal';
  onClick?: () => void;
  active?: boolean;
}

export function TagPill({ tag, size = 'normal', onClick, active }: TagPillProps) {
  const isSmall = size === 'small';
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-block',
        fontFamily: FONTS.mono,
        fontSize: isSmall ? '8px' : '9px',
        letterSpacing: '0.04em',
        padding: isSmall ? '1px 5px' : '2px 7px',
        borderRadius: '3px',
        background: active ? 'rgba(126,200,184,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${active ? 'rgba(126,200,184,0.3)' : COLORS.border}`,
        color: active ? COLORS.ai : COLORS.textSecondary,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
      title={tag.description || tag.name}
    >
      {tag.name}
    </span>
  );
}
