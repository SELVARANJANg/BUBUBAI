import crypto from 'crypto';

interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStats {
  enabled: boolean;
  size: number;
  maxSize: number;
  ttlMs: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export class ResponseCache<T = any> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options?: { maxSize?: number; ttlMs?: number; enabled?: boolean }) {
    this.maxSize =
      options?.maxSize ??
      parseInt(process.env.CACHE_MAX_ENTRIES || '250', 10);
    this.ttlMs =
      options?.ttlMs ??
      parseInt(process.env.CACHE_TTL_MS || '300000', 10); // 5 minutes default
    this.enabled =
      options?.enabled ?? process.env.CACHE_ENABLED !== 'false';
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public buildKey(payload: unknown): string {
    const serialized = JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  public get(key: string): T | null {
    if (!this.enabled) {
      this.misses++;
      return null;
    }

    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return null;
    }

    // Refresh LRU order (delete + re-insert moves key to most-recently-used)
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value;
  }

  public set(key: string, value: T, customTtlMs?: number): void {
    if (!this.enabled) return;

    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict oldest (least recently used) entry
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.evictions++;
      }
    }

    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      expiresAt: now + (customTtlMs ?? this.ttlMs),
    });
  }

  public clear(): void {
    this.store.clear();
  }

  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      enabled: this.enabled,
      size: this.store.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? Math.round((this.hits / total) * 10000) / 100 : 0,
    };
  }
}

export const defaultResponseCache = new ResponseCache<{
  text: string;
  provider: string;
  model: string;
}>();
