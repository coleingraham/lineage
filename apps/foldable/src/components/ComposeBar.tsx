import { useEffect, useRef, useState } from 'react';
import { COLORS, FONTS } from '../styles/theme.js';

interface ComposeBarProps {
  placeholder: string;
  /** Submit the typed text. Cleared on success. */
  onSubmit: (text: string) => void | Promise<void>;
  /** Accent colour (e.g. an intent colour when composing a divergence). */
  accent?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

/**
 * Bottom-pinned capture input. Thumb-reachable on the cover display: type a
 * thought, send it into the active line. Enter submits; Shift+Enter newlines.
 */
export function ComposeBar({
  placeholder,
  onSubmit,
  accent = COLORS.branch,
  submitLabel = 'Add',
  autoFocus = false,
}: ComposeBarProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void onSubmit(trimmed);
    setText('');
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        padding: '10px 12px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: COLORS.surface,
        borderTop: `1px solid ${COLORS.border}`,
      }}
    >
      <textarea
        ref={ref}
        value={text}
        placeholder={placeholder}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          flex: 1,
          resize: 'none',
          maxHeight: 160,
          padding: '10px 12px',
          background: COLORS.bg,
          color: COLORS.text,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 10,
          fontSize: 15,
          lineHeight: 1.5,
          outline: 'none',
        }}
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        style={{
          padding: '10px 16px',
          background: text.trim() ? accent : COLORS.dim,
          color: text.trim() ? COLORS.bg : COLORS.textSecondary,
          border: 'none',
          borderRadius: 10,
          cursor: text.trim() ? 'pointer' : 'default',
          fontFamily: FONTS.mono,
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}
