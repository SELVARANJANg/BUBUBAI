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
import { CircuitBreaker, defaultCircuitBreaker } from '../resilience/circuitBreaker';
import { LoadBalancer, defaultLoadBalancer } from './loadBalancer';
import { ServiceRegistry, defaultServiceRegistry } from '../discovery/serviceRegistry';

export interface AIProviderManagerOptions {
  circuitBreaker?: CircuitBreaker;
  loadBalancer?: LoadBalancer;
  serviceRegistry?: ServiceRegistry;
}

export class AIProviderManager {
  private providers: Map<ProviderId, IAIProvider> = new Map();
  private defaultPriority: ProviderId[] = ['gemini', 'nvidia', 'openai'];
  private readonly circuitBreaker: CircuitBreaker;
  private readonly loadBalancer: LoadBalancer;
  private readonly serviceRegistry: ServiceRegistry;

  constructor(customProviders?: IAIProvider[], options?: AIProviderManagerOptions) {
    if (customProviders && customProviders.length > 0) {
      for (const p of customProviders) {
        this.providers.set(p.id, p);
      }
      // Isolate resilience/LB state for custom test instances unless explicitly provided
      this.circuitBreaker = options?.circuitBreaker ?? new CircuitBreaker();
      this.loadBalancer = options?.loadBalancer ?? new LoadBalancer();
      this.serviceRegistry =
        options?.serviceRegistry ?? new ServiceRegistry({ seedDefaults: false });
    } else {
      this.registerProvider(new GeminiProvider());
      this.registerProvider(new NvidiaProvider());
      this.registerProvider(new OpenAIProvider());
      this.circuitBreaker = options?.circuitBreaker ?? defaultCircuitBreaker;
      this.loadBalancer = options?.loadBalancer ?? defaultLoadBalancer;
      this.serviceRegistry = options?.serviceRegistry ?? defaultServiceRegistry;
    }
  }

  public registerProvider(provider: IAIProvider) {
    this.providers.set(provider.id, provider);
  }

  public getProvider(id: ProviderId): IAIProvider | undefined {
    return this.providers.get(id);
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  public getLoadBalancer(): LoadBalancer {
    return this.loadBalancer;
  }

  public getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
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

    return true;
  }

  public setCooldown(id: ProviderId, durationMs: number, reason: string) {
    this.circuitBreaker.recordFailure(id, reason, {
      immediateOpen: true,
      customResetTimeoutMs: durationMs,
    });
  }

  public clearCooldown(id: ProviderId) {
    this.circuitBreaker.recordSuccess(id);
  }

  private sanitizeError(err: any): string {
    if (!err) return 'Unknown error';
    let msg = err.message || String(err);
    msg = msg.replace(/[a-zA-Z0-9_\-]{25,}/g, '[REDACTED_TOKEN]');
    return msg;
  }

  private reportServiceHealth(
    providerId: ProviderId,
    status: 'UP' | 'DEGRADED' | 'DOWN',
    latencyMs?: number
  ) {
    this.serviceRegistry.heartbeat(`ai-upstream-${providerId}`, {
      status,
      latencyMs,
    });
  }

  /**
   * Main completion method with circuit breaker protection, load balancing,
   * automatic fallback, retry limits, and exponential backoff.
   */
  public async generateContent(request: AIRequest): Promise<AIResponse> {
    const basePriority = this.getPriorityOrder();
    const orderedProviders = this.loadBalancer.orderCandidates(basePriority, ['openai']);
    const fallbackChain: FallbackRecord[] = [];
    const maxRetriesPerProvider = 1;

    for (let i = 0; i < orderedProviders.length; i++) {
      const providerId = orderedProviders[i];
      const provider = this.providers.get(providerId);

      if (!provider) {
        continue;
      }

      if (!provider.isConfigured()) {
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: 'Provider API key is not configured in environment',
        });
        this.reportServiceHealth(providerId, 'DOWN');
        continue;
      }

      if (!provider.isEnabled()) {
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: 'Provider is not enabled (budget policy)',
        });
        this.reportServiceHealth(providerId, 'DOWN');
        continue;
      }

      if (!this.circuitBreaker.canExecute(providerId)) {
        const circuit = this.circuitBreaker.getState(providerId);
        fallbackChain.push({
          provider: providerId,
          status: 'skipped',
          reason: `Circuit breaker OPEN (${circuit.lastFailureReason || 'previous failure'})`,
        });
        this.reportServiceHealth(providerId, 'DEGRADED');
        continue;
      }

      let attempt = 0;
      let lastAttemptError: any = null;
      const startTime = Date.now();

      while (attempt <= maxRetriesPerProvider) {
        try {
          const result = await provider.generateContent(request);
          const durationMs = Date.now() - startTime;

          this.circuitBreaker.recordSuccess(providerId);
          this.loadBalancer.recordSuccess(providerId, durationMs);
          this.reportServiceHealth(providerId, 'UP', durationMs);

          fallbackChain.push({
            provider: providerId,
            status: 'success',
            durationMs,
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

          if (
            status === 429 ||
            sanitizedMsg.toLowerCase().includes('429') ||
            sanitizedMsg.toLowerCase().includes('quota') ||
            sanitizedMsg.toLowerCase().includes('resource_exhausted')
          ) {
            console.warn(`[AIProviderManager] ${provider.name} rate limited (429). Falling back to next provider.`);
            this.circuitBreaker.recordFailure(providerId, '429 Rate Limit', {
              immediateOpen: true,
              customResetTimeoutMs: 60000,
            });
            this.loadBalancer.recordFailure(providerId);
            this.reportServiceHealth(providerId, 'DEGRADED');
            break;
          }

          if (status === 401 || status === 403) {
            console.warn(`[AIProviderManager] ${provider.name} auth error (${status}). Falling back.`);
            this.circuitBreaker.recordFailure(providerId, `Auth error (${status})`, {
              immediateOpen: true,
              customResetTimeoutMs: 120000,
            });
            this.loadBalancer.recordFailure(providerId);
            this.reportServiceHealth(providerId, 'DOWN');
            break;
          }

          if (attempt < maxRetriesPerProvider && this.isEligibleForFallback(err)) {
            attempt++;
            const backoffMs = Math.min(500 * Math.pow(2, attempt), 2000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          this.circuitBreaker.recordFailure(providerId, sanitizedMsg);
          this.loadBalancer.recordFailure(providerId);
          this.reportServiceHealth(providerId, 'DEGRADED');
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

    const allErrors = fallbackChain
      .filter((f) => f.status === 'failed' || f.status === 'skipped')
      .map((f) => `${f.provider}: ${f.reason}`)
      .join(' | ');

    const finalError: any = new Error(`All configured AI providers were unavailable. Details: ${allErrors}`);
    finalError.fallbackChain = fallbackChain;
    throw finalError;
  }

  /**
   * Streaming completion with safe early fallback and circuit breaker enforcement.
   */
  public async generateStream(
    request: AIRequest,
    onChunk: (text: string) => void,
    abortSignal?: AbortSignal
  ): Promise<{ provider: ProviderId; model: string; fallbackChain: FallbackRecord[] }> {
    const basePriority = this.getPriorityOrder();
    const orderedProviders = this.loadBalancer.orderCandidates(basePriority, ['openai']);
    const fallbackChain: FallbackRecord[] = [];

    for (let i = 0; i < orderedProviders.length; i++) {
      const providerId = orderedProviders[i];
      const provider = this.providers.get(providerId);

      if (
        !provider ||
        !provider.isConfigured() ||
        !provider.isEnabled() ||
        !this.circuitBreaker.canExecute(providerId)
      ) {
        continue;
      }

      if (!provider.generateStream) {
        const startTime = Date.now();
        try {
          const res = await provider.generateContent(request);
          const durationMs = Date.now() - startTime;
          this.circuitBreaker.recordSuccess(providerId);
          this.loadBalancer.recordSuccess(providerId, durationMs);
          this.reportServiceHealth(providerId, 'UP', durationMs);
          onChunk(res.text);
          return {
            provider: providerId,
            model: res.model,
            fallbackChain,
          };
        } catch (err) {
          this.circuitBreaker.recordFailure(providerId, this.sanitizeError(err));
          this.loadBalancer.recordFailure(providerId);
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

        const durationMs = Date.now() - startTime;
        this.circuitBreaker.recordSuccess(providerId);
        this.loadBalancer.recordSuccess(providerId, durationMs);
        this.reportServiceHealth(providerId, 'UP', durationMs);

        fallbackChain.push({
          provider: providerId,
          status: 'success',
          durationMs,
        });

        return {
          provider: providerId,
          model: streamResult.model,
          fallbackChain,
        };
      } catch (err: any) {
        if (hasSentFirstChunk) {
          console.error(`[AIProviderManager] Error occurred mid-stream for ${provider.name}. Terminating stream cleanly.`);
          throw err;
        }

        const sanitizedMsg = this.sanitizeError(err);
        console.warn(`[AIProviderManager] Safe stream fallback: ${provider.name} failed before first token: ${sanitizedMsg}`);

        if (err.status === 429 || sanitizedMsg.toLowerCase().includes('429')) {
          this.circuitBreaker.recordFailure(providerId, '429 Rate Limit', {
            immediateOpen: true,
            customResetTimeoutMs: 60000,
          });
        } else {
          this.circuitBreaker.recordFailure(providerId, sanitizedMsg);
        }
        this.loadBalancer.recordFailure(providerId);
        this.reportServiceHealth(providerId, 'DEGRADED');

        fallbackChain.push({
          provider: providerId,
          status: 'failed',
          reason: sanitizedMsg,
          durationMs: Date.now() - startTime,
        });
      }
    }

    throw new Error('All streaming providers were unavailable.');
  }

  /**
   * Health, circuit breaker, and load-balancer summary for all providers.
   * Safe to expose publicly (never contains keys or tokens).
   */
  public getHealthStatus(): ProviderHealth[] {
    const list: ProviderHealth[] = [];
    const lbStats = this.loadBalancer.getStats().providers;

    for (const [id, provider] of this.providers.entries()) {
      const configured = provider.isConfigured();
      const enabled = provider.isEnabled();
      const circuit = this.circuitBreaker.getState(id);
      const lb = lbStats.find((s) => s.id === id);

      let status: ProviderHealth['status'] = 'healthy';
      if (!configured) {
        status = 'unconfigured';
      } else if (!enabled) {
        status = 'disabled';
      } else if (circuit.state === 'OPEN') {
        status = 'rate_limited';
      }

      list.push({
        id,
        name: provider.name,
        configured,
        enabled,
        model: provider.getModel(),
        status,
        circuitState: circuit.state,
        avgLatencyMs: lb?.avgLatencyMs ?? 0,
        requests: lb?.requests ?? 0,
        lastError: circuit.lastFailureReason,
        cooldownUntil: circuit.nextAttemptAt,
      });
    }

    return list;
  }
}

export const defaultProviderManager = new AIProviderManager();
