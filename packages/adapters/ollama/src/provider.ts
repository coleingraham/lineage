import type { GenerationConfig, LLMProvider, Message, StreamToken } from '@lineage/core';

export interface OllamaProviderOptions {
  model: string;
  baseURL?: string;
}

const ROLE_MAP: Record<Message['role'], 'user' | 'assistant' | 'system'> = {
  human: 'user',
  ai: 'assistant',
  system: 'system',
};

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function toOllamaMessages(messages: Message[]): OllamaMessage[] {
  return messages.map((msg) => ({
    role: ROLE_MAP[msg.role],
    content: msg.content,
  }));
}

export class OllamaProvider implements LLMProvider {
  private readonly baseURL: string;
  private readonly model: string;

  constructor(options: OllamaProviderOptions) {
    this.baseURL = (options.baseURL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model;
  }

  async complete(messages: Message[], config: GenerationConfig): Promise<string> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model ?? this.model,
        messages: toOllamaMessages(messages),
        stream: false,
        think: config.thinking ?? false,
        options: {
          num_predict: config.maxTokens,
          ...(config.temperature !== undefined && { temperature: config.temperature }),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string; thinking?: string };
    };
    return data.message?.content || data.message?.thinking || '';
  }

  async *stream(messages: Message[], config: GenerationConfig): AsyncIterable<StreamToken> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model ?? this.model,
        messages: toOllamaMessages(messages),
        stream: true,
        think: config.thinking ?? false,
        options: {
          num_predict: config.maxTokens,
          ...(config.temperature !== undefined && { temperature: config.temperature }),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Some models (e.g. qwen3) ignore think:false and put all output in the
    // `thinking` field with empty `content`.  We detect this from the first
    // chunk and switch to streaming thinking content directly, stripping the
    // <think>...</think> wrapper tags.
    let mode: 'unknown' | 'content' | 'thinking' = 'unknown';
    // When in thinking mode, track whether we're still inside the <think> preamble
    let thinkingStarted = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as {
            message?: { content?: string; thinking?: string };
            done?: boolean;
          };
          const content = chunk.message?.content;
          const thinking = chunk.message?.thinking;

          // Determine mode from first chunk with data
          if (mode === 'unknown') {
            if (content) {
              mode = 'content';
            } else if (thinking) {
              mode = 'thinking';
            }
          }

          if (mode === 'content') {
            if (content) yield content;
          } else if (mode === 'thinking') {
            if (thinking) {
              // Strip the opening <think> tag from the first thinking chunk
              let text = thinking;
              if (!thinkingStarted) {
                text = text.replace(/^<think>\n?/, '');
                if (text || thinking !== '<think>') thinkingStarted = true;
              }
              // Strip the closing </think> tag — it appears in the last thinking chunk
              text = text.replace(/<\/think>\n?$/, '');
              if (text) yield { content: text, thinking: true };
            }
            // After thinking ends, the model may produce real content
            if (content) yield content;
          }
        }
      }

      if (buffer.trim()) {
        const chunk = JSON.parse(buffer) as {
          message?: { content?: string; thinking?: string };
          done?: boolean;
        };
        const content = chunk.message?.content;
        const thinking = chunk.message?.thinking;
        if (mode === 'content' || mode === 'unknown') {
          if (content) yield content;
        } else if (mode === 'thinking') {
          if (thinking) {
            const text = thinking.replace(/<\/think>\n?$/, '');
            if (text) yield { content: text, thinking: true };
          }
          if (content) yield content;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
