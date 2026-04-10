import { COLORS, FONTS } from '../styles/theme.js';

type ViewMode = 'graph' | 'linear';

interface TopBarProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  autoAiReply: boolean;
  onAutoAiReplyToggle: () => void;
  onSettingsOpen: () => void;
  onTagsOpen: () => void;
}

export function TopBar({
  mode,
  onModeChange,
  autoAiReply,
  onAutoAiReplyToggle,
  onSettingsOpen,
  onTagsOpen,
}: TopBarProps) {
  return (
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
          onClick={() => onModeChange('graph')}
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
          onClick={() => onModeChange('linear')}
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

      {/* Auto AI reply toggle */}
      <button
        onClick={onAutoAiReplyToggle}
        style={{
          background: autoAiReply ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: `1px solid ${autoAiReply ? COLORS.ai + '44' : COLORS.border}`,
          borderRadius: '6px',
          padding: '5px 10px',
          cursor: 'pointer',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          letterSpacing: '0.06em',
          color: autoAiReply ? COLORS.ai : COLORS.textSecondary,
          transition: 'all 0.15s',
        }}
        title={
          autoAiReply
            ? 'Auto AI reply is ON — click to disable'
            : 'Auto AI reply is OFF — click to enable'
        }
      >
        {autoAiReply ? 'Auto AI ✓' : 'Auto AI ✗'}
      </button>

      {/* Tags manager */}
      <button
        onClick={onTagsOpen}
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '6px',
          padding: '5px 10px',
          cursor: 'pointer',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          letterSpacing: '0.06em',
          color: COLORS.textSecondary,
        }}
        title="Manage Tags"
      >
        Tags
      </button>

      {/* Settings gear */}
      <button
        onClick={onSettingsOpen}
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
  );
}
