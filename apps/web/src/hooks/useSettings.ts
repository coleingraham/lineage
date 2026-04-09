import { useState, useCallback } from 'react';

export const SETTINGS_KEYS = {
  storageMode: 'lineage:storageMode',
  serverUrl: 'lineage:serverUrl',
  llmProvider: 'lineage:llmProvider',
  llmApiKey: 'lineage:llmApiKey',
  llmModel: 'lineage:llmModel',
  thinkingEnabled: 'lineage:thinkingEnabled',
  ollamaBaseUrl: 'lineage:ollamaBaseUrl',
  embeddingEnabled: 'lineage:embeddingEnabled',
  embeddingProvider: 'lineage:embeddingProvider',
  embeddingModel: 'lineage:embeddingModel',
  autoAiReply: 'lineage:autoAiReply',
} as const;

export type StorageMode = 'local' | 'remote';
export type LLMProvider = 'anthropic' | 'openai' | 'bedrock' | 'ollama';
export type EmbeddingProvider = 'anthropic' | 'openai' | 'ollama';

export interface SettingsState {
  storageMode: StorageMode;
  serverUrl: string;
  llmProvider: LLMProvider;
  llmModel: string;
  llmApiKey: string;
  thinkingEnabled: boolean;
  ollamaBaseUrl: string;
  embeddingEnabled: boolean;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
  autoAiReply: boolean;
}

export function loadSettings(): SettingsState {
  return {
    storageMode: (localStorage.getItem(SETTINGS_KEYS.storageMode) as StorageMode) ?? 'remote',
    serverUrl: localStorage.getItem(SETTINGS_KEYS.serverUrl) ?? 'http://localhost:3000',
    llmProvider: (localStorage.getItem(SETTINGS_KEYS.llmProvider) as LLMProvider) ?? 'anthropic',
    llmModel: localStorage.getItem(SETTINGS_KEYS.llmModel) ?? '',
    llmApiKey: localStorage.getItem(SETTINGS_KEYS.llmApiKey) ?? '',
    thinkingEnabled: localStorage.getItem(SETTINGS_KEYS.thinkingEnabled) === 'true',
    ollamaBaseUrl: localStorage.getItem(SETTINGS_KEYS.ollamaBaseUrl) ?? 'http://localhost:11434',
    embeddingEnabled: localStorage.getItem(SETTINGS_KEYS.embeddingEnabled) === 'true',
    embeddingProvider:
      (localStorage.getItem(SETTINGS_KEYS.embeddingProvider) as EmbeddingProvider) ?? 'openai',
    embeddingModel: localStorage.getItem(SETTINGS_KEYS.embeddingModel) ?? '',
    autoAiReply: localStorage.getItem(SETTINGS_KEYS.autoAiReply) !== 'false',
  };
}

export function saveSettings(state: SettingsState): void {
  localStorage.setItem(SETTINGS_KEYS.storageMode, state.storageMode);

  if (state.storageMode === 'remote' && state.serverUrl) {
    localStorage.setItem(SETTINGS_KEYS.serverUrl, state.serverUrl);
  } else {
    localStorage.removeItem(SETTINGS_KEYS.serverUrl);
  }

  localStorage.setItem(SETTINGS_KEYS.llmProvider, state.llmProvider);

  if (state.llmModel) {
    localStorage.setItem(SETTINGS_KEYS.llmModel, state.llmModel);
  } else {
    localStorage.removeItem(SETTINGS_KEYS.llmModel);
  }

  if (state.storageMode === 'local' && state.llmApiKey) {
    localStorage.setItem(SETTINGS_KEYS.llmApiKey, state.llmApiKey);
  } else {
    localStorage.removeItem(SETTINGS_KEYS.llmApiKey);
  }

  localStorage.setItem(SETTINGS_KEYS.thinkingEnabled, String(state.thinkingEnabled));

  if (state.llmProvider === 'ollama' && state.ollamaBaseUrl) {
    localStorage.setItem(SETTINGS_KEYS.ollamaBaseUrl, state.ollamaBaseUrl);
  } else {
    localStorage.removeItem(SETTINGS_KEYS.ollamaBaseUrl);
  }

  localStorage.setItem(SETTINGS_KEYS.embeddingEnabled, String(state.embeddingEnabled));
  localStorage.setItem(SETTINGS_KEYS.embeddingProvider, state.embeddingProvider);
  if (state.embeddingModel) {
    localStorage.setItem(SETTINGS_KEYS.embeddingModel, state.embeddingModel);
  } else {
    localStorage.removeItem(SETTINGS_KEYS.embeddingModel);
  }

  localStorage.setItem(SETTINGS_KEYS.autoAiReply, String(state.autoAiReply));
}

export function useSettings() {
  const [state, setState] = useState<SettingsState>(loadSettings);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(() => {
    saveSettings(state);
  }, [state]);

  const reload = useCallback(() => {
    setState(loadSettings());
  }, []);

  return { state, update, save, reload };
}
