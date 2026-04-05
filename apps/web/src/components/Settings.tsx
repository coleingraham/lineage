import { useState, useEffect, useCallback } from 'react';
import { COLORS, FONTS } from '../styles/theme.js';

/* ── localStorage keys ─────────────────────────────────────────────── */

const KEYS = {
  storageMode: 'lineage:storageMode',
  serverUrl: 'lineage:serverUrl',
  llmProvider: 'lineage:llmProvider',
  llmApiKey: 'lineage:llmApiKey',
  ollamaBaseUrl: 'lineage:ollamaBaseUrl',
  embeddingEnabled: 'lineage:embeddingEnabled',
  embeddingProvider: 'lineage:embeddingProvider',
  embeddingModel: 'lineage:embeddingModel',
} as const;

/* ── Types ─────────────────────────────────────────────────────────── */

type StorageMode = 'local' | 'remote';
type LLMProvider = 'anthropic' | 'openai' | 'bedrock' | 'ollama';
type EmbeddingProvider = 'anthropic' | 'openai' | 'ollama';

interface SettingsState {
  storageMode: StorageMode;
  serverUrl: string;
  llmProvider: LLMProvider;
  llmApiKey: string;
  ollamaBaseUrl: string;
  embeddingEnabled: boolean;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
}

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

function loadSettings(): SettingsState {
  return {
    storageMode: (localStorage.getItem(KEYS.storageMode) as StorageMode) ?? 'remote',
    serverUrl: localStorage.getItem(KEYS.serverUrl) ?? 'http://localhost:3000',
    llmProvider: (localStorage.getItem(KEYS.llmProvider) as LLMProvider) ?? 'anthropic',
    llmApiKey: localStorage.getItem(KEYS.llmApiKey) ?? '',
    ollamaBaseUrl: localStorage.getItem(KEYS.ollamaBaseUrl) ?? 'http://localhost:11434',
    embeddingEnabled: localStorage.getItem(KEYS.embeddingEnabled) === 'true',
    embeddingProvider:
      (localStorage.getItem(KEYS.embeddingProvider) as EmbeddingProvider) ?? 'openai',
    embeddingModel: localStorage.getItem(KEYS.embeddingModel) ?? '',
  };
}

function saveSettings(state: SettingsState) {
  localStorage.setItem(KEYS.storageMode, state.storageMode);

  if (state.storageMode === 'remote' && state.serverUrl) {
    localStorage.setItem(KEYS.serverUrl, state.serverUrl);
  } else {
    localStorage.removeItem(KEYS.serverUrl);
  }

  localStorage.setItem(KEYS.llmProvider, state.llmProvider);

  // Only persist API key in local-first mode
  if (state.storageMode === 'local' && state.llmApiKey) {
    localStorage.setItem(KEYS.llmApiKey, state.llmApiKey);
  } else {
    localStorage.removeItem(KEYS.llmApiKey);
  }

  if (state.llmProvider === 'ollama' && state.ollamaBaseUrl) {
    localStorage.setItem(KEYS.ollamaBaseUrl, state.ollamaBaseUrl);
  } else {
    localStorage.removeItem(KEYS.ollamaBaseUrl);
  }

  localStorage.setItem(KEYS.embeddingEnabled, String(state.embeddingEnabled));
  localStorage.setItem(KEYS.embeddingProvider, state.embeddingProvider);
  if (state.embeddingModel) {
    localStorage.setItem(KEYS.embeddingModel, state.embeddingModel);
  } else {
    localStorage.removeItem(KEYS.embeddingModel);
  }
}

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
  const [state, setState] = useState<SettingsState>(loadSettings);
  const [saved, setSaved] = useState(false);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

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
            <span style={label}>Mode</span>
            <select
              value={state.storageMode}
              onChange={(e) => update('storageMode', e.target.value as StorageMode)}
              style={selectStyle}
            >
              <option value="local">In-browser SQLite (default)</option>
              <option value="remote">Remote server</option>
            </select>
          </div>

          {state.storageMode === 'remote' && (
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
          )}
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

          {state.storageMode === 'local' && (
            <div style={fieldGroup}>
              <span style={label}>API Key</span>
              <input
                type="password"
                value={state.llmApiKey}
                onChange={(e) => update('llmApiKey', e.target.value)}
                placeholder="sk-..."
                style={inputBase}
              />
              <span
                style={{
                  display: 'block',
                  fontSize: '9px',
                  color: COLORS.textSecondary,
                  marginTop: '4px',
                }}
              >
                Stored locally only — never sent to the app server.
              </span>
            </div>
          )}

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
