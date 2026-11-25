import { GoogleGenAI } from '@google/genai';
import { IAIProvider, AIRequest, ProviderId } from './types';

const DEPRECATED_GEMINI_MODELS = new Set([
  'gemini-pro',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
  'gemini-2.5-flash',
]);

const DEFAULT_ACTIVE_MODEL = 'gemini-4-hydrogen';
const FALLBACK_ACTIVE_MODEL = 'gemini-3.8-flash';

export class GeminiProvider implements IAIProvider {
  public readonly id: ProviderId = 'gemini';
  public readonly name = 'Google Gemini';
  private client: GoogleGenAI | null = null;
  private clientKey: string | null = null;

  public isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return Boolean(key && key.trim().length > 0 && key !== 'MY_GEMINI_API_KEY');
  }

  public isEnabled(): boolean {
    if (process.env.GEMINI_ENABLED !== undefined) {
      return process.env.GEMINI_ENABLED === 'true';
    }
    return this.isConfigured();
  }

  public getModel(): string {
    const raw = (process.env.GEMINI_MODEL || '').trim();
    if (!raw || DEPRECATED_GEMINI_MODELS.has(raw)) {
      return DEFAULT_ACTIVE_MODEL;
    }
    return raw;
  }

  private getClient(): GoogleGenAI {
    const key = (process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    if (!this.client || this.clientKey !== key) {
      this.client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      this.clientKey = key;
    }
    return this.client;
  }

  private buildConfig(model: string, request: AIRequest): Record<string, any> {
    const isGemini4 = model.startsWith('gemini-4-');
    const config: Record<string, any> = {};

    if (request.systemPrompt) {
      config.systemInstruction = request.systemPrompt;
    }

    // Do not pass deprecated sampling parameters (temperature, topP, topK) or
    // restrictive maxOutputTokens (which includes thinking tokens) to gemini-4-* models
    if (!isGemini4) {
      config.temperature = request.temperature ?? 0.7;
      config.maxOutputTokens = request.maxTokens ?? 2048;
    }

    return config;
  }

  private isModelNotFoundError(err: any): boolean {
    const status = err?.status || err?.statusCode;
    const msg = (err?.message || '').toLowerCase();
    return (
      status === 404 ||
      msg.includes('404') ||
      msg.includes('not_found') ||
      msg.includes('is not found') ||
      msg.includes('no longer available')
    );
  }

  private buildContents(request: AIRequest, includeAttachments: boolean): any[] {
    const contents: any[] = [];

    if (request.history && Array.isArray(request.history)) {
      for (const item of request.history) {
        const parts: any[] = [];

        if (includeAttachments && item.attachments && Array.isArray(item.attachments)) {
          for (const att of item.attachments) {
            if (att && att.data && att.type) {
              const base64Data = att.data.includes('base64,')
                ? att.data.split('base64,')[1]
                : att.data;
              parts.push({
                inlineData: {
                  data: base64Data,
                  mimeType: att.type,
                },
              });
            }
          }
        }

        if (item.content && item.content.trim()) {
          parts.push({ text: item.content });
        }

        if (parts.length > 0) {
          contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts,
          });
        }
      }
    }

    const currentParts: any[] = [];
    if (includeAttachments && request.attachments && Array.isArray(request.attachments)) {
      for (const att of request.attachments) {
        if (att && att.data && att.type) {
          const base64Data = att.data.includes('base64,')
            ? att.data.split('base64,')[1]
            : att.data;
          currentParts.push({
            inlineData: {
              data: base64Data,
              mimeType: att.type,
            },
          });
        }
      }
    }

    if (request.message && request.message.trim()) {
      currentParts.push({ text: request.message });
    }

    if (currentParts.length === 0) {
      currentParts.push({ text: ' ' });
    }

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    return contents;
  }

  public async generateContent(request: AIRequest): Promise<{ text: string; model: string }> {
    const client = this.getClient();
    const primaryModel = this.getModel();
    const contents = this.buildContents(request, true);
    const timeoutMs = parseInt(process.env.PROVIDER_TIMEOUT_MS || '15000', 10);

    const candidateModels =
      primaryModel === FALLBACK_ACTIVE_MODEL
        ? [primaryModel, DEFAULT_ACTIVE_MODEL]
        : [primaryModel, FALLBACK_ACTIVE_MODEL];

    let lastError: any;

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const responsePromise = client.models.generateContent({
          model,
          contents,
          config: this.buildConfig(model, request),
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error(`Gemini request timed out after ${timeoutMs}ms`));
          });
        });

        const response = await Promise.race([responsePromise, timeoutPromise]);
        clearTimeout(timer);

        const text = response.text || '';
        return { text, model };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        // If 404 model not found, try the alternate active Gemini model before failing over
        if (i < candidateModels.length - 1 && this.isModelNotFoundError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }

  public async generateStream(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; model: string }> {
    const client = this.getClient();
    const primaryModel = this.getModel();
    const contents = this.buildContents(request, false);

    const candidateModels =
      primaryModel === FALLBACK_ACTIVE_MODEL
        ? [primaryModel, DEFAULT_ACTIVE_MODEL]
        : [primaryModel, FALLBACK_ACTIVE_MODEL];

    let lastError: any;

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      let hasYielded = false;

      try {
        const streamResponse = await client.models.generateContentStream({
          model,
          contents,
          config: this.buildConfig(model, request),
        });

        let fullText = '';
        for await (const chunk of streamResponse) {
          if (abortSignal?.aborted) {
            throw new Error('Streaming aborted by client');
          }
          const chunkText = chunk.text || '';
          if (chunkText) {
            hasYielded = true;
            fullText += chunkText;
            onChunk(chunkText);
          }
        }

        return { text: fullText, model };
      } catch (err) {
        lastError = err;
        if (!hasYielded && i < candidateModels.length - 1 && this.isModelNotFoundError(err)) {
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }
}
