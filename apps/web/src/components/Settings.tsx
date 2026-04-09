import { useState, useCallback, useEffect } from 'react';
import { COLORS, FONTS } from '../styles/theme.js';
import {
  useSettings,
  saveSettings,
  type LLMProvider,
  type EmbeddingProvider,
} from '../hooks/useSettings.js';

/* ── Helpers ───────────────────────────────────────────────────────── */

const LLM_PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'bedrock', label: 'Bedrock' },
  { value: 'ollama', label: 'Ollama' },
];

const EMBEDDING_PROVIDERS: { value: EmbeddingProvider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' },
];

/* ── Styles ────────────────────────────────────────────────────────── */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const panel: React.CSSProperties = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '8px',
  width: '460px',
  maxHeight: '80vh',
  overflowY: 'auto',
  padding: '28px 32px',
  fontFamily: FONTS.mono,
  fontSize: '12px',
  color: COLORS.text,
};

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  fontFamily: FONTS.mono,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
  paddingBottom: '8px',
  marginBottom: '16px',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: COLORS.textSecondary,
  marginBottom: '4px',
};

const inputBase: React.CSSProperties = {
  width: '100%',
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '4px',
  padding: '8px 10px',
  fontFamily: FONTS.mono,
  fontSize: '12px',
  color: COLORS.text,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputBase,
  appearance: 'none' as const,
  cursor: 'pointer',
};

const fieldGroup: React.CSSProperties = {
  marginBottom: '16px',
};

const section: React.CSSProperties = {
  marginBottom: '24px',
};

const btnBase: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: '11px',
  letterSpacing: '0.06em',
  border: 'none',
  borderRadius: '4px',
  padding: '8px 18px',
  cursor: 'pointer',
};

/* ── Component ─────────────────────────────────────────────────────── */

export function Settings({ onClose }: { onClose: () => void }) {
  const { state, update: rawUpdate } = useSettings();
  const [saved, setSaved] = useState(false);

  const update = useCallback(
    <K extends keyof typeof state>(key: K, value: (typeof state)[K]) => {
      rawUpdate(key, value);
      setSaved(false);
    },
    [rawUpdate],
  );

  const handleSave = useCallback(() => {
    saveSettings(state);
    setSaved(true);
  }, [state]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Title */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontFamily: FONTS.serif,
              color: COLORS.text,
            }}
          >
            Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.textSecondary,
              cursor: 'pointer',
              fontFamily: FONTS.mono,
              fontSize: '14px',
              padding: '2px 6px',
            }}
          >
            x
          </button>
        </div>

        {/* ── Storage ───────────────────────────────────────────── */}
        <div style={section}>
          <h3 style={heading}>Storage</h3>

          <div style={fieldGroup}>
            <span style={label}>Server URL</span>
            <input
              type="url"
              value={state.serverUrl}
              onChange={(e) => update('serverUrl', e.target.value)}
              placeholder="http://localhost:3000"
              style={inputBase}
            />
          </div>
        </div>

        {/* ── LLM Provider ──────────────────────────────────────── */}
        <div style={section}>
          <h3 style={heading}>LLM Provider</h3>

          <div style={fieldGroup}>
            <span style={label}>Provider</span>
            <select
              value={state.llmProvider}
              onChange={(e) => update('llmProvider', e.target.value as LLMProvider)}
              style={selectStyle}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldGroup}>
            <span style={label}>Model</span>
            <input
              type="text"
              value={state.llmModel}
              onChange={(e) => update('llmModel', e.target.value)}
              placeholder="e.g. llama3.2, claude-sonnet-4-20250514, gpt-4o"
              style={inputBase}
            />
          </div>

          {state.llmProvider === 'ollama' && (
            <div style={fieldGroup}>
              <span style={label}>Ollama Base URL</span>
              <input
                type="url"
                value={state.ollamaBaseUrl}
                onChange={(e) => update('ollamaBaseUrl', e.target.value)}
                placeholder="http://localhost:11434"
                style={inputBase}
              />
            </div>
          )}

          <div style={fieldGroup}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              <input
                type="checkbox"
                checked={state.thinkingEnabled}
                onChange={(e) => update('thinkingEnabled', e.target.checked)}
                style={{ accentColor: COLORS.ai }}
              />
              Enable thinking
            </label>
          </div>
        </div>

        {/* ── Embedding ─────────────────────────────────────────── */}
        <div style={section}>
          <h3 style={heading}>Embedding</h3>

          <div style={fieldGroup}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              <input
                type="checkbox"
                checked={state.embeddingEnabled}
                onChange={(e) => update('embeddingEnabled', e.target.checked)}
                style={{ accentColor: COLORS.ai }}
              />
              Enable embedding
            </label>
          </div>

          {state.embeddingEnabled && (
            <>
              <div style={fieldGroup}>
                <span style={label}>Provider</span>
                <select
                  value={state.embeddingProvider}
                  onChange={(e) => update('embeddingProvider', e.target.value as EmbeddingProvider)}
                  style={selectStyle}
                >
                  {EMBEDDING_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldGroup}>
                <span style={label}>Model</span>
                <input
                  type="text"
                  value={state.embeddingModel}
                  onChange={(e) => update('embeddingModel', e.target.value)}
                  placeholder="text-embedding-3-small"
                  style={inputBase}
                />
              </div>
            </>
          )}
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              ...btnBase,
              background: 'transparent',
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              ...btnBase,
              background: saved ? 'rgba(126,200,184,0.15)' : 'rgba(255,255,255,0.08)',
              color: saved ? COLORS.ai : COLORS.text,
            }}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
