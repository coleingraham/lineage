import { useState } from 'react';
import { COLORS, FONTS } from '../styles/theme.js';
import { aiGenerate, downloadAiModel, getAiStatus } from '../ai/native.js';
import { buildSegmentPrompt, parseSegments } from '../lib/segment.js';

interface ProsePanelProps {
  /** Create a monologue from the (author-edited) ordered thoughts. */
  onCreate: (segments: string[]) => Promise<void>;
  onClose: () => void;
}

type Stage = 'input' | 'unavailable' | 'needDownload' | 'downloading' | 'generating' | 'review' | 'error';

/**
 * D3 (suggestion-only, fully author-editable): paste prose, let on-device
 * Gemini Nano segment it into an ordered list of thoughts, then edit and turn
 * it into a monologue spine. Gated by AICore availability with a download step.
 */
export function ProsePanel({ onCreate, onClose }: ProsePanelProps) {
  const [stage, setStage] = useState<Stage>('input');
  const [prose, setProse] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState('');
  const [downloadState, setDownloadState] = useState('');
  const [creating, setCreating] = useState(false);

  const generate = async (text: string) => {
    setStage('generating');
    try {
      const out = await aiGenerate(buildSegmentPrompt(text));
      const segments = parseSegments(out);
      if (segments.length === 0) {
        setError('The model returned nothing to work with. Try rephrasing the text.');
        setStage('error');
        return;
      }
      setReviewText(segments.join('\n'));
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
      setStage('error');
    }
  };

  const suggest = async () => {
    if (!prose.trim()) return;
    const status = await getAiStatus();
    if (status === 'available') return generate(prose);
    if (status === 'downloadable') return setStage('needDownload');
    if (status === 'downloading') {
      setError('The on-device model is still downloading. Try again in a moment.');
      return setStage('error');
    }
    return setStage('unavailable');
  };

  const runDownload = async () => {
    setStage('downloading');
    try {
      await downloadAiModel(setDownloadState);
      await generate(prose);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Model download failed.');
      setStage('error');
    }
  };

  const create = async () => {
    const segments = parseSegments(reviewText);
    if (segments.length === 0) return;
    setCreating(true);
    try {
      await onCreate(segments);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '88%',
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.borderHi}`,
          borderRadius: '14px 14px 0 0',
          padding: 16,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text }}>
            ✨ From prose
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {(stage === 'input' || stage === 'generating') && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
              Paste a passage; on-device AI will suggest an ordered set of thoughts you can edit
              into a monologue. Nothing leaves the device.
            </p>
            <textarea
              value={prose}
              onChange={(e) => setProse(e.target.value)}
              placeholder="Paste your writing here…"
              disabled={stage === 'generating'}
              style={textareaStyle(220)}
            />
            <Actions>
              <Primary onClick={suggest} disabled={!prose.trim() || stage === 'generating'}>
                {stage === 'generating' ? 'Thinking…' : 'Suggest'}
              </Primary>
            </Actions>
          </>
        )}

        {stage === 'review' && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
              One thought per line — edit, reorder, or delete freely. Each becomes a node on the
              line.
            </p>
            <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} style={textareaStyle(280)} />
            <Actions>
              <button onClick={() => setStage('input')} style={ghostStyle}>
                ← back
              </button>
              <Primary onClick={create} disabled={creating || !reviewText.trim()}>
                {creating ? 'Creating…' : 'Create monologue'}
              </Primary>
            </Actions>
          </>
        )}

        {stage === 'needDownload' && (
          <Message>
            <p style={messageText}>
              The on-device AI model needs to download once (a few hundred MB). It then runs fully
              offline.
            </p>
            <Actions>
              <button onClick={() => setStage('input')} style={ghostStyle}>
                cancel
              </button>
              <Primary onClick={runDownload}>Download model</Primary>
            </Actions>
          </Message>
        )}

        {stage === 'downloading' && (
          <Message>
            <p style={messageText}>Downloading the model… {downloadState && `(${downloadState})`}</p>
            <p style={{ ...messageText, color: COLORS.textSecondary, fontSize: 12 }}>
              This can take a while on first use. You can keep the app open.
            </p>
          </Message>
        )}

        {stage === 'unavailable' && (
          <Message>
            <p style={messageText}>
              On-device AI (Gemini Nano via AICore) isn’t available on this device. The rest of the
              app works without it.
            </p>
            <Actions>
              <Primary onClick={onClose}>Close</Primary>
            </Actions>
          </Message>
        )}

        {stage === 'error' && (
          <Message>
            <p style={{ ...messageText, color: '#d88a8a' }}>{error}</p>
            <Actions>
              <Primary onClick={() => setStage('input')}>Try again</Primary>
            </Actions>
          </Message>
        )}
      </div>
    </div>
  );
}

function textareaStyle(maxHeight: number) {
  return {
    width: '100%',
    flex: '0 1 auto',
    maxHeight,
    minHeight: 120,
    resize: 'vertical' as const,
    padding: 12,
    background: COLORS.bg,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 1.5,
    outline: 'none',
  };
}

const messageText = { margin: 0, fontSize: 14, color: COLORS.text, lineHeight: 1.55 } as const;
const ghostStyle = {
  padding: '9px 12px',
  background: 'transparent',
  color: COLORS.textSecondary,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: FONTS.mono,
} as const;

function Actions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>{children}</div>;
}

function Message({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>{children}</div>;
}

function Primary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 16px',
        background: disabled ? COLORS.dim : COLORS.branch,
        color: disabled ? COLORS.textSecondary : COLORS.bg,
        border: 'none',
        borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: FONTS.mono,
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
