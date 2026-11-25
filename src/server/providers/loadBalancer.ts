import { ProviderId } from './types';

export type LoadBalanceStrategy =
  | 'priority'
  | 'round-robin'
  | 'weighted'
  | 'least-latency';

export interface ProviderLoadStats {
  id: ProviderId;
  requests: number;
  failures: number;
  avgLatencyMs: number;
  weight: number;
}

export class LoadBalancer {
  private rrCounter = 0;
  private stats = new Map<ProviderId, ProviderLoadStats>();
  private readonly strategyOverride?: LoadBalanceStrategy;

  constructor(options?: { strategy?: LoadBalanceStrategy; weights?: Partial<Record<ProviderId, number>> }) {
    this.strategyOverride = options?.strategy;
    const defaultWeights: Record<ProviderId, number> = {
      gemini: options?.weights?.gemini ?? parseInt(process.env.LB_WEIGHT_GEMINI || '70', 10),
      nvidia: options?.weights?.nvidia ?? parseInt(process.env.LB_WEIGHT_NVIDIA || '30', 10),
      openai: options?.weights?.openai ?? parseInt(process.env.LB_WEIGHT_OPENAI || '10', 10),
    };

    (['gemini', 'nvidia', 'openai'] as ProviderId[]).forEach((id) => {
      this.stats.set(id, {
        id,
        requests: 0,
        failures: 0,
        avgLatencyMs: 0,
        weight: defaultWeights[id],
      });
    });
  }

  public getStrategy(): LoadBalanceStrategy {
    const raw = (
      this.strategyOverride ||
      process.env.LB_STRATEGY ||
      'priority'
    )
      .trim()
      .toLowerCase();

    if (
      raw === 'round-robin' ||
      raw === 'weighted' ||
      raw === 'least-latency' ||
      raw === 'priority'
    ) {
      return raw;
    }
    return 'priority';
  }

  /**
   * Orders an eligible list of providers according to the active load balancing strategy.
   * Note: Paid providers (like OpenAI) are kept at the tail unless explicitly prioritized,
   * preserving cost protection while balancing free-tier / configured nodes.
   */
  public orderCandidates(
    candidates: ProviderId[],
    paidProviders: ProviderId[] = ['openai']
  ): ProviderId[] {
    if (candidates.length <= 1) return [...candidates];

    const strategy = this.getStrategy();
    if (strategy === 'priority') {
      return [...candidates];
    }

    const paidSet = new Set(paidProviders);
    const primaryPool = candidates.filter((id) => !paidSet.has(id));
    const reservePool = candidates.filter((id) => paidSet.has(id));

    let orderedPrimary: ProviderId[] = [...primaryPool];

    if (strategy === 'round-robin' && primaryPool.length > 1) {
      const offset = this.rrCounter % primaryPool.length;
      this.rrCounter = (this.rrCounter + 1) % 1000000;
      orderedPrimary = [
        ...primaryPool.slice(offset),
        ...primaryPool.slice(0, offset),
      ];
    } else if (strategy === 'weighted' && primaryPool.length > 1) {
      // Deterministic weighted smooth selection based on weight vs requests served
      orderedPrimary = [...primaryPool].sort((a, b) => {
        const sa = this.stats.get(a)!;
        const sb = this.stats.get(b)!;
        const ratioA = sa.requests / Math.max(1, sa.weight);
        const ratioB = sb.requests / Math.max(1, sb.weight);
        return ratioA - ratioB;
      });
    } else if (strategy === 'least-latency' && primaryPool.length > 1) {
      orderedPrimary = [...primaryPool].sort((a, b) => {
        const la = this.stats.get(a)?.avgLatencyMs ?? 0;
        const lb = this.stats.get(b)?.avgLatencyMs ?? 0;
        // Untried providers (0ms) get probed first, then fastest latency
        return la - lb;
      });
    }

    return [...orderedPrimary, ...reservePool];
  }

  public recordSuccess(id: ProviderId, latencyMs: number): void {
    const stat = this.stats.get(id);
    if (!stat) return;
    stat.requests += 1;
    stat.avgLatencyMs =
      stat.avgLatencyMs === 0
        ? Math.round(latencyMs)
        : Math.round(stat.avgLatencyMs * 0.7 + latencyMs * 0.3);
  }

  public recordFailure(id: ProviderId): void {
    const stat = this.stats.get(id);
    if (!stat) return;
    stat.requests += 1;
    stat.failures += 1;
  }

  public getStats(): {
    strategy: LoadBalanceStrategy;
    providers: ProviderLoadStats[];
  } {
    return {
      strategy: this.getStrategy(),
      providers: Array.from(this.stats.values()).map((s) => ({ ...s })),
    };
  }
}

export const defaultLoadBalancer = new LoadBalancer();
