export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold: number;
}

export interface CircuitStatus {
  id: string;
  state: CircuitState;
  failures: number;
  consecutiveSuccesses: number;
  lastFailureReason?: string;
  lastFailureAt?: number;
  nextAttemptAt?: number;
}

interface CircuitEntry {
  state: CircuitState;
  failures: number;
  consecutiveSuccesses: number;
  lastFailureReason?: string;
  lastFailureAt?: number;
  openedAt?: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private circuits = new Map<string, CircuitEntry>();
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold:
        config?.failureThreshold ??
        parseInt(process.env.CIRCUIT_FAILURE_THRESHOLD || '3', 10),
      resetTimeoutMs:
        config?.resetTimeoutMs ??
        parseInt(process.env.CIRCUIT_RESET_TIMEOUT_MS || '60000', 10),
      halfOpenSuccessThreshold:
        config?.halfOpenSuccessThreshold ??
        parseInt(process.env.CIRCUIT_HALF_OPEN_SUCCESSES || '1', 10),
    };
  }

  private getOrCreate(id: string): CircuitEntry {
    let entry = this.circuits.get(id);
    if (!entry) {
      entry = {
        state: 'CLOSED',
        failures: 0,
        consecutiveSuccesses: 0,
        resetTimeoutMs: this.config.resetTimeoutMs,
      };
      this.circuits.set(id, entry);
    }
    return entry;
  }

  /**
   * Determines whether a request can proceed for the given service/provider.
   * Automatically transitions OPEN -> HALF_OPEN once resetTimeoutMs has elapsed.
   */
  public canExecute(id: string): boolean {
    const entry = this.getOrCreate(id);
    if (entry.state === 'CLOSED') {
      return true;
    }

    if (entry.state === 'OPEN') {
      const elapsed = Date.now() - (entry.openedAt || 0);
      if (elapsed >= entry.resetTimeoutMs) {
        entry.state = 'HALF_OPEN';
        entry.consecutiveSuccesses = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN allows probe requests
    return true;
  }

  /**
   * Records a successful execution and closes the circuit if threshold met.
   */
  public recordSuccess(id: string): void {
    const entry = this.getOrCreate(id);
    if (entry.state === 'HALF_OPEN') {
      entry.consecutiveSuccesses += 1;
      if (entry.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
        entry.state = 'CLOSED';
        entry.failures = 0;
        entry.consecutiveSuccesses = 0;
        entry.openedAt = undefined;
        entry.lastFailureReason = undefined;
      }
    } else {
      entry.state = 'CLOSED';
      entry.failures = 0;
      entry.consecutiveSuccesses = 0;
      entry.openedAt = undefined;
      entry.lastFailureReason = undefined;
    }
  }

  /**
   * Records a failure. Can immediately trip the circuit (e.g. HTTP 429 rate limit)
   * or trip once failureThreshold consecutive failures occur.
   */
  public recordFailure(
    id: string,
    reason: string,
    options?: { immediateOpen?: boolean; customResetTimeoutMs?: number }
  ): void {
    const entry = this.getOrCreate(id);
    entry.failures += 1;
    entry.consecutiveSuccesses = 0;
    entry.lastFailureReason = reason;
    entry.lastFailureAt = Date.now();

    const shouldTrip =
      options?.immediateOpen ||
      entry.state === 'HALF_OPEN' ||
      entry.failures >= this.config.failureThreshold;

    if (shouldTrip) {
      entry.state = 'OPEN';
      entry.openedAt = Date.now();
      entry.resetTimeoutMs =
        options?.customResetTimeoutMs ?? this.config.resetTimeoutMs;
    }
  }

  public reset(id: string): void {
    this.circuits.delete(id);
  }

  public getState(id: string): CircuitStatus {
    // Trigger automatic OPEN -> HALF_OPEN transition check
    this.canExecute(id);
    const entry = this.getOrCreate(id);
    return {
      id,
      state: entry.state,
      failures: entry.failures,
      consecutiveSuccesses: entry.consecutiveSuccesses,
      lastFailureReason: entry.lastFailureReason,
      lastFailureAt: entry.lastFailureAt,
      nextAttemptAt:
        entry.state === 'OPEN' && entry.openedAt
          ? entry.openedAt + entry.resetTimeoutMs
          : undefined,
    };
  }

  public getAllStates(): CircuitStatus[] {
    const results: CircuitStatus[] = [];
    for (const id of this.circuits.keys()) {
      results.push(this.getState(id));
    }
    return results;
  }
}

export const defaultCircuitBreaker = new CircuitBreaker();
