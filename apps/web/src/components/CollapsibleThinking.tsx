import { useState } from 'react';
import { FONTS } from '../styles/theme.js';
import { Markdown } from './Markdown.js';

export function CollapsibleThinking({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        marginBottom: '8px',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: 'rgba(255,255,255,0.02)',
          border: 'none',
          padding: '6px 12px',
          cursor: 'pointer',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          color: '#555',
          letterSpacing: '0.06em',
        }}
      >
        <span style={{ fontSize: '8px' }}>{open ? '▾' : '▸'}</span>
        Thinking
      </button>
      {open && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            color: '#555',
            fontStyle: 'italic',
          }}
        >
          <Markdown content={content} fontSize="13px" color="#555" />
        </div>
      )}
    </div>
  );
}
