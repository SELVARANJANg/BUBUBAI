import { GoogleGenAI } from '@google/genai';
import { IAIProvider, AIRequest, ProviderId } from './types';

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
    return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
            'User-Agent': 'aistudio-build-bububai',
          },
        },
      });
      this.clientKey = key;
    }
    return this.client;
  }

  public async generateContent(request: AIRequest): Promise<{ text: string; model: string }> {
    const client = this.getClient();
    const model = this.getModel();

    const contents: any[] = [];

    // Map conversation history
    if (request.history && Array.isArray(request.history)) {
      for (const item of request.history) {
        const parts: any[] = [];

        if (item.attachments && Array.isArray(item.attachments)) {
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

    // Current message
    const currentParts: any[] = [];
    if (request.attachments && Array.isArray(request.attachments)) {
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

    const timeoutMs = parseInt(process.env.PROVIDER_TIMEOUT_MS || '15000', 10);
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const responsePromise = client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: request.systemPrompt || undefined,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? 2048,
        },
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
      throw err;
    }
  }

  public async generateStream(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ text: string; model: string }> {
    const client = this.getClient();
    const model = this.getModel();

    const contents: any[] = [];
    if (request.history && Array.isArray(request.history)) {
      for (const item of request.history) {
        const parts: any[] = [];
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
    if (request.message && request.message.trim()) {
      currentParts.push({ text: request.message });
    } else {
      currentParts.push({ text: ' ' });
    }

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    const streamResponse = await client.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: request.systemPrompt || undefined,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 2048,
      },
    });

    let fullText = '';
    for await (const chunk of streamResponse) {
      if (abortSignal?.aborted) {
        throw new Error('Streaming aborted by client');
      }
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        onChunk(chunkText);
      }
    }

    return { text: fullText, model };
  }
}
