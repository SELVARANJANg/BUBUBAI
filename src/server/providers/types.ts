export type ProviderId = 'gemini' | 'nvidia' | 'openai';

export interface ChatMessageItem {
  role: 'system' | 'user' | 'assistant' | 'model';
  content: string;
  attachments?: Array<{
    type: string;
    name?: string;
    data: string; // Base64 data URL
  }>;
}

export interface AIRequest {
  message: string;
  history?: ChatMessageItem[];
  systemPrompt?: string;
  username?: string;
  attachments?: Array<{
    type: string;
    name?: string;
    data: string;
  }>;
  temperature?: number;
  maxTokens?: number;
}

export interface FallbackRecord {
  provider: ProviderId;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
  durationMs?: number;
}

export interface AIResponse {
  text: string;
  provider: ProviderId;
  model: string;
  fallbackCount: number;
  fallbackChain: FallbackRecord[];
}

export interface ProviderHealth {
  id: ProviderId;
  name: string;
  configured: boolean;
  enabled: boolean;
  model: string;
  status: 'healthy' | 'rate_limited' | 'error' | 'unconfigured' | 'disabled';
  lastUsed?: string;
  lastError?: string;
  cooldownUntil?: number;
}

export interface IAIProvider {
  readonly id: ProviderId;
  readonly name: string;
  isConfigured(): boolean;
  isEnabled(): boolean;
  getModel(): string;
  generateContent(request: AIRequest): Promise<{ text: string; model: string }>;
  generateStream?(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; model: string }>;
}
