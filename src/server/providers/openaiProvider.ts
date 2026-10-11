import { IAIProvider, AIRequest, ProviderId } from './types';

export class OpenAIProvider implements IAIProvider {
  public readonly id: ProviderId = 'openai';
  public readonly name = 'OpenAI';
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';

  public isConfigured(): boolean {
    const key = process.env.OPENAI_API_KEY;
    return Boolean(key && key.trim().length > 0 && key !== 'MY_OPENAI_API_KEY');
  }

  /**
   * Per cost control policy: OpenAI is a paid provider and MUST NOT be silently
   * enabled even if an API key happens to exist in the environment. It is enabled
   * ONLY when OPENAI_ENABLED is explicitly set to 'true'.
   */
  public isEnabled(): boolean {
    const isExplicitlyEnabled = process.env.OPENAI_ENABLED === 'true';
    return this.isConfigured() && isExplicitlyEnabled;
  }

  public getModel(): string {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  private buildMessages(request: AIRequest): any[] {
    const messages: any[] = [];

    if (request.systemPrompt && request.systemPrompt.trim()) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    if (request.history && Array.isArray(request.history)) {
      for (const item of request.history) {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        let text = item.content || '';

        if (item.attachments && item.attachments.length > 0) {
          const names = item.attachments.map((a) => a.name || a.type).join(', ');
          text = `[User attached: ${names}]\n${text}`;
        }

        if (text.trim()) {
          messages.push({ role, content: text });
        }
      }
    }

    let currentText = request.message || '';
    if (request.attachments && request.attachments.length > 0) {
      const names = request.attachments.map((a) => a.name || a.type).join(', ');
      currentText = `[User attached: ${names}]\n${currentText}`;
    }

    messages.push({
      role: 'user',
      content: currentText.trim() || 'Hello',
    });

    return messages;
  }

  public async generateContent(request: AIRequest): Promise<{ text: string; model: string }> {
    if (!this.isEnabled()) {
      throw new Error('OpenAI provider is disabled or missing OPENAI_ENABLED=true authorization flag.');
    }

    const key = (process.env.OPENAI_API_KEY || '').trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = this.getModel();
    const messages = this.buildMessages(request);

    const timeoutMs = parseInt(process.env.PROVIDER_TIMEOUT_MS || '15000', 10);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': 'aistudio-build-bububai',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2048,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const status = response.status;
        let errorBody = '';
        try {
          const errJson = await response.json();
          errorBody = errJson?.error?.message || errJson?.message || JSON.stringify(errJson);
        } catch {
          errorBody = await response.text();
        }
        const err: any = new Error(`OpenAI returned HTTP ${status}: ${errorBody}`);
        err.status = status;
        throw err;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      return { text, model };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        const timeoutErr: any = new Error(`OpenAI request timed out after ${timeoutMs}ms`);
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    }
  }

  public async generateStream(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; model: string }> {
    if (!this.isEnabled()) {
      throw new Error('OpenAI provider is disabled or missing OPENAI_ENABLED=true authorization flag.');
    }

    const key = (process.env.OPENAI_API_KEY || '').trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model = this.getModel();
    const messages = this.buildMessages(request);

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'User-Agent': 'aistudio-build-bububai',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
        stream: true,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      const err: any = new Error(`OpenAI stream HTTP ${status}: ${text}`);
      err.status = status;
      throw err;
    }

    if (!response.body) {
      throw new Error('OpenAI response body is empty');
    }

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              onChunk(delta);
            }
          } catch {
            // ignore non-json stream lines
          }
        }
      }
    }

    return { text: fullText, model };
  }
}
