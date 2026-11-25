export type ServiceStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface ServiceInstance {
  id: string;
  serviceName: string;
  endpoint: string;
  version: string;
  weight: number;
  region: string;
  status: ServiceStatus;
  latencyMs: number;
  registeredAt: number;
  lastHeartbeatAt: number;
  ttlMs: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface RegisterServiceInput {
  id: string;
  serviceName: string;
  endpoint: string;
  version?: string;
  weight?: number;
  region?: string;
  status?: ServiceStatus;
  ttlMs?: number;
  metadata?: Record<string, string | number | boolean>;
}

export class ServiceRegistry {
  private services = new Map<string, ServiceInstance>();
  private readonly defaultTtlMs: number;

  constructor(options?: { defaultTtlMs?: number; seedDefaults?: boolean }) {
    this.defaultTtlMs =
      options?.defaultTtlMs ??
      parseInt(process.env.SERVICE_DISCOVERY_TTL_MS || '120000', 10);

    if (options?.seedDefaults !== false) {
      this.bootstrapDefaultServices();
    }
  }

  private bootstrapDefaultServices() {
    const now = Date.now();
    const envRegion = process.env.VERCEL_REGION || process.env.POD_REGION || 'global-edge';

    // Register local API gateway instance
    this.register({
      id: `bububai-api-${process.env.HOSTNAME || 'local'}`,
      serviceName: 'bububai-api',
      endpoint: process.env.APP_URL || 'http://localhost:3000',
      version: '1.0.0',
      weight: 100,
      region: envRegion,
      status: 'UP',
      ttlMs: Number.MAX_SAFE_INTEGER,
      metadata: {
        runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
        pid: process.pid,
      },
    });

    // Register AI provider upstream endpoints
    this.register({
      id: 'ai-upstream-gemini',
      serviceName: 'ai-provider',
      endpoint: 'https://generativelanguage.googleapis.com',
      version: 'v1beta',
      weight: 60,
      region: 'google-cloud',
      status: 'UP',
      ttlMs: Number.MAX_SAFE_INTEGER,
      metadata: { providerId: 'gemini', tier: 'primary' },
    });

    this.register({
      id: 'ai-upstream-nvidia',
      serviceName: 'ai-provider',
      endpoint: 'https://integrate.api.nvidia.com/v1',
      version: 'v1',
      weight: 30,
      region: 'nvidia-nim',
      status: 'UP',
      ttlMs: Number.MAX_SAFE_INTEGER,
      metadata: { providerId: 'nvidia', tier: 'fallback-1' },
    });

    this.register({
      id: 'ai-upstream-openai',
      serviceName: 'ai-provider',
      endpoint: 'https://api.openai.com/v1',
      version: 'v1',
      weight: 10,
      region: 'openai-cloud',
      status: process.env.OPENAI_ENABLED === 'true' ? 'UP' : 'DOWN',
      ttlMs: Number.MAX_SAFE_INTEGER,
      metadata: {
        providerId: 'openai',
        tier: 'fallback-2',
        budgetProtected: true,
      },
    });

    // Optional external replica nodes configured via SERVICE_NODES (comma-separated URLs)
    const rawNodes = process.env.SERVICE_NODES;
    if (rawNodes && rawNodes.trim()) {
      rawNodes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((url, index) => {
          this.register({
            id: `bububai-replica-${index + 1}`,
            serviceName: 'bububai-api',
            endpoint: url,
            version: '1.0.0',
            weight: 100,
            region: envRegion,
            status: 'UP',
            ttlMs: this.defaultTtlMs,
            metadata: { discoveredAt: now },
          });
        });
    }
  }

  public register(input: RegisterServiceInput): ServiceInstance {
    const now = Date.now();
    const existing = this.services.get(input.id);

    const instance: ServiceInstance = {
      id: input.id,
      serviceName: input.serviceName,
      endpoint: input.endpoint,
      version: input.version || '1.0.0',
      weight: input.weight ?? 100,
      region: input.region || 'default',
      status: input.status || 'UP',
      latencyMs: existing?.latencyMs ?? 0,
      registeredAt: existing?.registeredAt ?? now,
      lastHeartbeatAt: now,
      ttlMs: input.ttlMs ?? this.defaultTtlMs,
      metadata: input.metadata,
    };

    this.services.set(input.id, instance);
    return instance;
  }

  public deregister(id: string): boolean {
    return this.services.delete(id);
  }

  public heartbeat(
    id: string,
    updates?: { status?: ServiceStatus; latencyMs?: number; metadata?: Record<string, any> }
  ): ServiceInstance | null {
    const instance = this.services.get(id);
    if (!instance) return null;

    instance.lastHeartbeatAt = Date.now();
    if (updates?.status) {
      instance.status = updates.status;
    }
    if (typeof updates?.latencyMs === 'number') {
      // Exponential moving average for smooth latency tracking
      instance.latencyMs =
        instance.latencyMs === 0
          ? Math.round(updates.latencyMs)
          : Math.round(instance.latencyMs * 0.7 + updates.latencyMs * 0.3);
    }
    if (updates?.metadata) {
      instance.metadata = { ...instance.metadata, ...updates.metadata };
    }

    return instance;
  }

  public pruneStale(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, instance] of this.services.entries()) {
      if (
        instance.ttlMs !== Number.MAX_SAFE_INTEGER &&
        now - instance.lastHeartbeatAt > instance.ttlMs
      ) {
        this.services.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  public discover(serviceName?: string, onlyHealthy = true): ServiceInstance[] {
    this.pruneStale();
    const list: ServiceInstance[] = [];
    for (const instance of this.services.values()) {
      if (serviceName && instance.serviceName !== serviceName) continue;
      if (onlyHealthy && instance.status === 'DOWN') continue;
      list.push({ ...instance });
    }
    return list;
  }

  public getSummary() {
    const all = this.discover(undefined, false);
    const up = all.filter((s) => s.status === 'UP').length;
    const degraded = all.filter((s) => s.status === 'DEGRADED').length;
    const down = all.filter((s) => s.status === 'DOWN').length;
    return {
      totalServices: all.length,
      up,
      degraded,
      down,
      services: all,
    };
  }
}

export const defaultServiceRegistry = new ServiceRegistry();
