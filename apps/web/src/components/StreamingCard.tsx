import { COLORS, FONTS } from '../styles/theme.js';
import type { StreamingStatus } from '../store/streaming.js';
import { Markdown } from './Markdown.js';
import { CollapsibleThinking } from './CollapsibleThinking.js';

export function StreamingCard({
  content,
  thinkingContent,
  status,
  error,
  onCancel,
  onRetry,
  variant = 'full',
}: {
  content: string;
  thinkingContent?: string;
  isThinking?: boolean;
  status: StreamingStatus;
  error: string | null;
  onCancel: () => void;
  onRetry?: () => void;
  /** 'full' for linear/current card, 'compact' for child card in graph view */
  variant?: 'full' | 'compact';
}) {
  const isPending = status === 'pending';
  const isStreaming = status === 'streaming';
  const isError = status === 'error';

  if (variant === 'compact') {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${COLORS.ai}33`,
          borderLeft: `3px solid ${COLORS.ai}28`,
          borderRadius: '8px',
          padding: '14px 20px',
          marginBottom: '6px',
          opacity: 0.85,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: isError ? '#e06060' : COLORS.ai,
              animation: isPending || isStreaming ? 'pulse 1.5s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '13px',
              fontFamily: FONTS.serif,
              fontWeight: 400,
              color: isError ? '#e06060' : '#707070',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {isError ? `Error: ${error}` : content || 'Generating...'}
          </span>
          <span
            style={{
              fontSize: '9px',
              color: COLORS.ai + '55',
              fontFamily: FONTS.mono,
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}
          >
            {isPending ? 'PENDING' : isStreaming ? 'STREAMING' : isError ? 'ERROR' : 'AI'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: isError ? 'rgba(224,96,96,0.04)' : 'rgba(126,200,184,0.04)',
        border: `1px solid ${isError ? 'rgba(224,96,96,0.2)' : COLORS.ai + '33'}`,
        borderLeft: `3px solid ${isError ? '#e06060' : COLORS.ai}`,
        borderRadius: '8px',
        padding: '18px 22px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div
          style={{
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isError ? (
            <span style={{ fontSize: '14px', color: '#e06060' }}>!</span>
          ) : (
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: COLORS.ai,
                animation: isPending || isStreaming ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
            />
          )}
        </div>
        <span
          style={{
            fontSize: '9px',
            color: isError ? '#e06060' : COLORS.ai,
            letterSpacing: '0.08em',
            background: (isError ? '#e06060' : COLORS.ai) + '18',
            padding: '2px 8px',
            borderRadius: '3px',
            fontFamily: FONTS.mono,
          }}
        >
          {isPending ? 'PENDING' : isStreaming ? 'STREAMING' : isError ? 'ERROR' : 'AI'}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '5px' }}>
          {isError && onRetry && (
            <button
              onClick={onRetry}
              style={{
                background: 'rgba(224,96,96,0.15)',
                border: '1px solid rgba(224,96,96,0.3)',
                borderRadius: '4px',
                color: '#e06060',
                fontSize: '9px',
                fontFamily: FONTS.mono,
                letterSpacing: '0.06em',
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              RETRY
            </button>
          )}
          {(isPending || isStreaming) && (
            <button
              onClick={onCancel}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '4px',
                color: COLORS.textSecondary,
                fontSize: '9px',
                fontFamily: FONTS.mono,
                letterSpacing: '0.06em',
                padding: '3px 10px',
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isError ? (
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: '#e06060cc',
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {error}
        </p>
      ) : (
        <div style={{ minHeight: isPending ? '24px' : undefined }}>
          {thinkingContent ? <CollapsibleThinking content={thinkingContent} /> : null}
          {content ? <Markdown content={content} /> : null}
          {(isPending || isStreaming) && <BlinkingCursor />}
        </div>
      )}
    </div>
  );
}

function BlinkingCursor() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '2px',
        height: '1em',
        background: COLORS.ai,
        marginLeft: '1px',
        verticalAlign: 'text-bottom',
        animation: 'blink 0.8s step-end infinite',
      }}
    />
  );
}
