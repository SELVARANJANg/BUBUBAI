import {
  IAIProvider,
  AIRequest,
  AIResponse,
  ProviderId,
  ProviderHealth,
  FallbackRecord,
} from './types';
import { GeminiProvider } from './geminiProvider';
import { NvidiaProvider } from './nvidiaProvider';
import { OpenAIProvider } from './openaiProvider';

interface CooldownEntry {
  until: number;
  reason: string;
}

export class AIProviderManager {
  private providers: Map<ProviderId, IAIProvider> = new Map();
  private cooldowns: Map<ProviderId, CooldownEntry> = new Map();
  private defaultPriority: ProviderId[] = ['gemini', 'nvidia', 'openai'];

  constructor(customProviders?: IAIProvider[]) {
    if (customProviders && customProviders.length > 0) {
      for (const p of customProviders) {
        this.providers.set(p.id, p);
      }
    } else {
      this.registerProvider(new GeminiProvider());
      this.registerProvider(new NvidiaProvider());
      this.registerProvider(new OpenAIProvider());
    }
  }

  public registerProvider(provider: IAIProvider) {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: ProviderId): IAIProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Returns configured priority order, reading from PROVIDER_PRIORITY environment variable
   * with fallback to ['gemini', 'nvidia', 'openai'].
   */
  public getPriorityOrder(): ProviderId[] {
    const rawPriority = process.env.PROVIDER_PRIORITY;
    if (rawPriority && rawPriority.trim()) {
      const parsed = rawPriority
        .split(',')
        .map((p) => p.trim().toLowerCase() as ProviderId)
        .filter((p): p is ProviderId => ['gemini', 'nvidia', 'openai'].includes(p));

      if (parsed.length > 0) {
        // Append any omitted valid providers at the end
        const set = new Set(parsed);
        for (const def of this.defaultPriority) {
          if (!set.has(def)) parsed.push(def);
        }
        return parsed;
      }
    }
    return [...this.defaultPriority];
  }

  /**
   * Determine if an error is eligible for automatic fallback to the next provider.
   */
  public isEligibleForFallback(error: any): boolean {
    if (!error) return false;

    const message = (error.message || '').toLowerCase();
    const status = error.status || error.statusCode || error.response?.status;

    // Rate limits (429 / Quota / Resource Exhausted)
    if (
      status === 429 ||
      message.includes('429') ||
      message.includes('quota') ||
      message.includes('resource_exhausted') ||
      message.includes('rate limit') ||
      message.includes('rate_limit')
    ) {
      return true;
    }

    // Temporary server errors & gateways (500, 502, 503, 504)
    if (
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('service unavailable') ||
      message.includes('bad gateway') ||
      message.includes('gateway timeout')
    ) {
      return true;
    }

    // Network timeouts and socket resets
    if (
      error.name === 'AbortError' ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('fetch failed') ||
      message.includes('network')
    ) {
      return true;
    }

    // Missing credentials or invalid keys (fallback to next configured provider)
    if (
      status === 401 ||
      status === 403 ||
      message.includes('not configured') ||
      message.includes('unauthorized') ||
      message.includes('invalid api key') ||
      message.includes('disabled')
    ) {
      return true;
    }

    return true; // Default fallback to preserve user experience
  }

  private isUnderCooldown(id: ProviderId): boolean {
    const entry = this.cooldowns.get(id);
    if (!entry) return false;
    if (Date.now() < entry.until) return true;
    this.cooldowns.delete(id);
    return false;
  }

  public setCooldown(id: ProviderId, durationMs: number, reason: string) {
    this.cooldowns.set(id, {
      until: Date.now() + durationMs,
      reason,
    });
  }

  public clearCooldown(id: ProviderId) {
    this.cooldowns.delete(id);
  }

  /**
   * Sanitizes error message for external logging / status reporting without exposing keys.
   */
  private sanitizeError(err: any): string {
    if (!err) return 'Unknown error';
    let msg = err.message || String(err);
    // Redact potential API keys or tokens in strings
    msg = msg.replace(/[a-zA-Z0-9_\-]{25,}/g, '[REDACTED_TOKEN]');
    return msg;
  }

  /**
   * Main completion method with automatic fallback, retry limits, and exponential backoff.
   */
  public async generateContent(request: AIRequest): Promise<AIResponse> {
    const priority = this.getPriorityOrder();
    const fallbackChain: FallbackRecord[] = [];
    const maxRetriesPerProvider = 1;

    for (let i = 0; i < priority.length; i++) {
      const providerId = priority[i];
      const provider = this.providers.get(providerId);

      if (!provider) {
        continue;
      }

      // Check if provider is configured and enabled
      if (!provider.isConfigured()) {
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: 'Provider API key is not configured in environment',
        });
        continue;
      }

      if (!provider.isEnabled()) {
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: 'Provider is not enabled (budget policy)',
        });
        continue;
      }

      // Check temporary cooldown (unless it is the only remaining option)
      if (this.isUnderCooldown(providerId)) {
        const cooldown = this.cooldowns.get(providerId);
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: `Temporarily cooling down due to previous ${cooldown?.reason || 'rate limit'}`,
        });
        continue;
      }

      // Attempt provider with backoff retry for transient network issues
      let attempt = 0;
      let lastAttemptError: any = null;
      const startTime = Date.now();

      while (attempt <= maxRetriesPerProvider) {
        try {
          const result = await provider.generateContent(request);

          // Clear any cooldown on success
          this.clearCooldown(providerId);

          fallbackChain.push({
            provider: providerId,
            status: 'success',
            durationMs: Date.now() - startTime,
          });

          return {
            text: result.text,
            provider: providerId,
            model: result.model,
            fallbackCount: fallbackChain.filter((f) => f.status === 'failed').length,
            fallbackChain,
          };
        } catch (err: any) {
          lastAttemptError = err;
          const sanitizedMsg = this.sanitizeError(err);
          const status = err.status || err.statusCode;

          // Rate limit check: apply cooldown and do not retry the same provider immediately
          if (
            status === 429 ||
            sanitizedMsg.toLowerCase().includes('429') ||
            sanitizedMsg.toLowerCase().includes('quota') ||
            sanitizedMsg.toLowerCase().includes('resource_exhausted')
          ) {
            console.warn(`[AIProviderManager] ${provider.name} rate limited (429). Falling back to next provider.`);
            this.setCooldown(providerId, 60000, '429 Rate Limit');
            break; // Stop retrying this provider; fall back immediately
          }

          // Invalid key or forbidden: do not retry this provider
          if (status === 401 || status === 403) {
            console.warn(`[AIProviderManager] ${provider.name} auth error (${status}). Falling back.`);
            break;
          }

          // Retry transient error if attempts remain
          if (attempt < maxRetriesPerProvider && this.isEligibleForFallback(err)) {
            attempt++;
            const backoffMs = Math.min(500 * Math.pow(2, attempt), 2000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          break;
        }
      }

      const durationMs = Date.now() - startTime;
      const sanitizedReason = this.sanitizeError(lastAttemptError);

      fallbackChain.push({
        provider: providerId,
        status: 'failed',
        reason: sanitizedReason,
        durationMs,
      });

      console.warn(
        `[AIProviderManager] Fallback from ${provider.name} to next provider. Reason: ${sanitizedReason}`
      );
    }

    // All providers failed or unconfigured
    const allErrors = fallbackChain
      .filter((f) => f.status === 'failed' || f.status === 'skipped')
      .map((f) => `${f.provider}: ${f.reason}`)
      .join(' | ');

    const finalError: any = new Error(`All configured AI providers were unavailable. Details: ${allErrors}`);
    finalError.fallbackChain = fallbackChain;
    throw finalError;
  }

  /**
   * Streaming completion with safe early fallback.
   * If an error occurs BEFORE the first chunk is sent, we safely fall back to the next provider!
   * Once streaming starts, we do NOT switch midway to prevent corrupted multi-response output.
   */
  public async generateStream(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ provider: ProviderId; model: string; fallbackChain: FallbackRecord[] }> {
    const priority = this.getPriorityOrder();
    const fallbackChain: FallbackRecord[] = [];

    for (let i = 0; i < priority.length; i++) {
      const providerId = priority[i];
      const provider = this.providers.get(providerId);

      if (!provider || !provider.isConfigured() || !provider.isEnabled() || this.isUnderCooldown(providerId)) {
        continue;
      }

      if (!provider.generateStream) {
        // Provider doesn't implement streaming, use regular generation and emit full text
        try {
          const res = await provider.generateContent(request);
          onChunk(res.text);
          return {
            provider: providerId,
            model: res.model,
            fallbackChain,
          };
        } catch (err) {
          fallbackChain.push({
            provider: providerId,
            status: 'failed',
            reason: this.sanitizeError(err),
          });
          continue;
        }
      }

      let hasSentFirstChunk = false;
      const startTime = Date.now();

      try {
        const streamResult = await provider.generateStream(
          request,
          (chunk) => {
            hasSentFirstChunk = true;
            onChunk(chunk);
          },
          abortSignal
        );

        this.clearCooldown(providerId);
        fallbackChain.push({
          provider: providerId,
          status: 'success',
          durationMs: Date.now() - startTime,
        });

        return {
          provider: providerId,
          model: streamResult.model,
          fallbackChain,
        };
      } catch (err: any) {
        // If we already sent chunks to the client, we cannot safely switch to another provider midway!
        if (hasSentFirstChunk) {
          console.error(`[AIProviderManager] Error occurred mid-stream for ${provider.name}. Terminating stream cleanly.`);
          throw err;
        }

        // Error happened before any response chunk was sent: safe to fall back!
        console.warn(`[AIProviderManager] Safe stream fallback: ${provider.name} failed before first token: ${this.sanitizeError(err)}`);
        if (err.status === 429) {
          this.setCooldown(providerId, 60000, '429 Rate Limit');
        }

        fallbackChain.push({
          provider: providerId,
          status: 'failed',
          reason: this.sanitizeError(err),
          durationMs: Date.now() - startTime,
        });
      }
    }

    throw new Error('All streaming providers were unavailable.');
  }

  /**
   * Health and diagnostic summary for all providers.
   * Safe to expose publicly (never contains keys or tokens).
   */
  public getHealthStatus(): ProviderHealth[] {
    const list: ProviderHealth[] = [];

    for (const [id, provider] of this.providers.entries()) {
      const configured = provider.isConfigured();
      const enabled = provider.isEnabled();
      const underCooldown = this.isUnderCooldown(id);
      const cooldownEntry = this.cooldowns.get(id);

      let status: ProviderHealth['status'] = 'healthy';
      if (!configured) {
        status = 'unconfigured';
      } else if (!enabled) {
        status = 'disabled';
      } else if (underCooldown) {
        status = 'rate_limited';
      }

      list.push({
        id,
        name: provider.name,
        configured,
        enabled,
        model: provider.getModel(),
        status,
        lastError: cooldownEntry?.reason,
        cooldownUntil: cooldownEntry?.until,
      });
    }

    return list;
  }
}

// Export singleton instance for production server
export const defaultProviderManager = new AIProviderManager();
