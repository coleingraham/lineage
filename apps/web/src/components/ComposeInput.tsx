import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { COLORS, FONTS } from '../styles/theme.js';

export interface ComposeInputHandle {
  focus: () => void;
}

interface ComposeInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ComposeInput = forwardRef<ComposeInputHandle, ComposeInputProps>(function ComposeInput(
  { onSend, disabled = false, placeholder = 'Type a message...' },
  ref,
) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${COLORS.border}`,
        borderRadius: '8px',
        padding: '10px 14px',
        marginTop: '12px',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: FONTS.serif,
          fontSize: '15px',
          color: COLORS.text,
          resize: 'none',
          lineHeight: 1.65,
          padding: 0,
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        style={{
          background: value.trim() ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: `1px solid ${value.trim() ? 'rgba(255,255,255,0.15)' : COLORS.border}`,
          borderRadius: '6px',
          padding: '6px 14px',
          cursor: value.trim() && !disabled ? 'pointer' : 'default',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          letterSpacing: '0.06em',
          color: value.trim() ? COLORS.text : COLORS.muted,
          flexShrink: 0,
        }}
      >
        Send
      </button>
    </div>
  );
});
