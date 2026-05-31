import { useCallback, useMemo, useState } from 'react';
import { aiGenerate, downloadAiModel, getAiStatus, isAiSupported } from '../ai/native.js';

export interface Ai {
  supported: boolean;
  /** Current status text while working (e.g. "Thinking…"), else null. */
  busy: string | null;
  error: string | null;
  /** Run a prompt, downloading the model first if needed. Null on failure. */
  generate: (prompt: string) => Promise<string | null>;
  clearError: () => void;
}

/**
 * Shared on-device AI runner. Resolves model availability (downloading it on
 * demand — the user already consented once via "From prose"), surfaces a status
 * line, and returns generated text. Android-only; `supported` is false elsewhere.
 */
export function useAi(): Ai {
  const supported = useMemo(() => isAiSupported(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string): Promise<string | null> => {
    setError(null);
    try {
      const status = await getAiStatus();
      if (status === 'unavailable') {
        setError('On-device AI isn’t available on this device.');
        return null;
      }
      if (status === 'downloading') {
        setError('The model is still downloading. Try again shortly.');
        return null;
      }
      if (status === 'downloadable') {
        setBusy('Downloading model…');
        await downloadAiModel((s) => setBusy(`Downloading model… ${s}`));
      }
      setBusy('Thinking…');
      return await aiGenerate(prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.');
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  return { supported, busy, error, generate, clearError: () => setError(null) };
}
