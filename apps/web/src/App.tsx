import { useState, useEffect } from 'react';
import { GraphView } from './views/GraphView.js';
import { LinearView } from './views/LinearView.js';
import { Settings } from './components/Settings.js';
import { COLORS, FONTS } from './styles/theme.js';
import './styles/graph.css';

type ViewMode = 'graph' | 'linear';

const STORAGE_KEY = 'lineage:viewMode';

function readSavedMode(): ViewMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'linear' ? 'linear' : 'graph';
}

export function App() {
  const [mode, setMode] = useState<ViewMode>(readSavedMode);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text }}>
      {/* View toggle + settings */}
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
            onClick={() => setMode('graph')}
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
            onClick={() => setMode('linear')}
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

        <button
          onClick={() => setShowSettings(true)}
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

      {mode === 'graph' ? <GraphView /> : <LinearView />}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
