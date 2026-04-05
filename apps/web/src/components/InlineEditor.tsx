import { COLORS, FONTS } from '../styles/theme.js';

interface InlineEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function InlineEditor({ value, onChange, onSave, onCancel }: InlineEditorProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSave();
          }
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        style={{
          width: '100%',
          minHeight: '80px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '4px',
          fontFamily: FONTS.serif,
          fontSize: '16px',
          color: '#ececec',
          lineHeight: 1.65,
          padding: '8px 10px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.border}`,
            borderRadius: '4px',
            padding: '4px 12px',
            fontFamily: FONTS.mono,
            fontSize: '10px',
            color: COLORS.textSecondary,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '4px',
            padding: '4px 12px',
            fontFamily: FONTS.mono,
            fontSize: '10px',
            color: COLORS.text,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
