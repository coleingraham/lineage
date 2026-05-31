import { Capacitor, registerPlugin } from '@capacitor/core';

export type AiStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface AiPlugin {
  getStatus(): Promise<{ status: AiStatus }>;
  download(): Promise<{ status: string }>;
  generate(options: { prompt: string }): Promise<{ text: string }>;
  addListener(
    eventName: 'aiDownloadProgress',
    listener: (event: { state: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const Ai = registerPlugin<AiPlugin>('Ai');

/** On-device generative AI is Android-only (Gemini Nano via AICore / ML Kit). */
export function isAiSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function getAiStatus(): Promise<AiStatus> {
  try {
    return (await Ai.getStatus()).status;
  } catch {
    return 'unavailable';
  }
}

/** Download the model, reporting coarse progress states until it completes. */
export async function downloadAiModel(onState?: (state: string) => void): Promise<void> {
  const handle = onState
    ? await Ai.addListener('aiDownloadProgress', (e) => onState(e.state))
    : undefined;
  try {
    await Ai.download();
  } finally {
    await handle?.remove();
  }
}

export async function aiGenerate(prompt: string): Promise<string> {
  return (await Ai.generate({ prompt })).text;
}
