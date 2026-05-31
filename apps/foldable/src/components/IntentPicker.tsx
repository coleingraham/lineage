import { BRANCH_INTENTS, type BranchIntent } from '@lineage/core';
import { COLORS, FONTS, intentColor } from '../styles/theme.js';

/** The divergence intents the author can fork with (sequence is implicit). */
const DIVERGENCE_INTENTS: { intent: BranchIntent; label: string; hint: string }[] = [
  { intent: BRANCH_INTENTS.ALTERNATIVE, label: 'Alternative', hint: 'a different path' },
  { intent: BRANCH_INTENTS.ELABORATION, label: 'Elaboration', hint: 'go deeper' },
  { intent: BRANCH_INTENTS.OBJECTION, label: 'Objection', hint: 'push back' },
];

interface IntentPickerProps {
  onPick: (intent: BranchIntent) => void;
  onCancel: () => void;
}

/** Choose how a new branch diverges from the focused node. */
export function IntentPicker({ onPick, onCancel }: IntentPickerProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        padding: '10px 12px',
        background: COLORS.elevated,
        borderTop: `1px solid ${COLORS.border}`,
      }}
    >
      <span style={{ color: COLORS.textSecondary, fontSize: 13, fontFamily: FONTS.mono }}>
        diverge as
      </span>
      {DIVERGENCE_INTENTS.map(({ intent, label, hint }) => (
        <button
          key={intent}
          onClick={() => onPick(intent)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
            padding: '6px 12px',
            background: 'transparent',
            color: COLORS.text,
            border: `1px solid ${intentColor(intent)}`,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14, color: intentColor(intent) }}>{label}</span>
          <span style={{ fontSize: 11, color: COLORS.textSecondary }}>{hint}</span>
        </button>
      ))}
      <button
        onClick={onCancel}
        style={{
          marginLeft: 'auto',
          padding: '6px 10px',
          background: 'transparent',
          color: COLORS.textSecondary,
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        cancel
      </button>
    </div>
  );
}
