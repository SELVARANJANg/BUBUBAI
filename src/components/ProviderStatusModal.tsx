import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Server,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Layers,
  Activity,
  Cloud,
} from 'lucide-react';
import {
  getPuterUser,
  signInPuter,
  PuterUserInfo,
  isPuterAIFallbackEnabled,
} from '../utils/puter';

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  model: string;
  status: 'healthy' | 'rate_limited' | 'error' | 'unconfigured' | 'disabled';
  circuitState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  avgLatencyMs?: number;
  requests?: number;
  lastError?: string;
  cooldownUntil?: number;
}

interface ProviderStatusData {
  priority: string[];
  strategy?: string;
  providers: ProviderInfo[];
}

interface InfraStatusData {
  timestamp: string;
  pillars: {
    rateLimiting: {
      status: string;
      algorithm: string;
      activeBuckets: number;
      totalAllowed: number;
      totalBlocked: number;
      maxRequestsPerWindow: number;
    };
    caching: {
      status: string;
      algorithm: string;
      size: number;
      maxSize: number;
      hits: number;
      misses: number;
      hitRate: number;
    };
    loadBalancing: {
      status: string;
      strategy: string;
    };
    reverseProxy: {
      status: string;
      trustProxy: boolean;
      nginxConfig: string;
    };
    apiGateway: {
      status: string;
      gatewayVersion: string;
      totalRequests: number;
      avgLatencyMs: number;
    };
    cicd: {
      status: string;
      pipeline: string;
    };
    docker: {
      status: string;
      dockerfile: string;
      compose: string;
    };
    kubernetes: {
      status: string;
      manifests: string;
    };
    serviceDiscovery: {
      status: string;
      totalServices: number;
      up: number;
      degraded: number;
      down: number;
    };
    circuitBreaker: {
      status: string;
      providers: Array<{
        id: string;
        name: string;
        circuitState: string;
        status: string;
      }>;
    };
  };
}

interface ProviderStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderStatusModal({ isOpen, onClose }: ProviderStatusModalProps) {
  const [activeTab, setActiveTab] = useState<'providers' | 'infra'>('providers');
  const [data, setData] = useState<ProviderStatusData | null>(null);
  const [infra, setInfra] = useState<InfraStatusData | null>(null);
  const [puterUser, setPuterUser] = useState<PuterUserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const [provRes, infraRes] = await Promise.all([
        fetch('/api/providers/status'),
        fetch('/api/infra/status'),
      ]);
      if (!provRes.ok) throw new Error(`HTTP ${provRes.status}`);
      const provJson = await provRes.json();
      setData(provJson);

      if (infraRes.ok) {
        const infraJson = await infraRes.json();
        setInfra(infraJson);
      }

      const pUser = await getPuterUser();
      setPuterUser(pUser);
    } catch {
      setError('Unable to load provider status right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-xl w-full overflow-hidden z-10"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-sans font-bold text-sm text-[#111110]">
                  Multi-Provider & Infrastructure Console
                </h3>
                <p className="font-sans text-[11px] text-neutral-500">
                  Automatic failover, circuit breakers & 10-pillar production stack
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 pt-3 pb-0 border-b border-neutral-100 flex items-center gap-4 bg-white">
            <button
              onClick={() => setActiveTab('providers')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'providers'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              AI Providers & Circuit Breakers
            </button>
            <button
              onClick={() => setActiveTab('infra')}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'infra'
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              10-Pillar Infrastructure
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {loading && !data ? (
              <div className="flex items-center justify-center py-12 text-neutral-400 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Checking system health...
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 text-red-600 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : activeTab === 'providers' && data ? (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 uppercase tracking-wider px-1">
                    <span>
                      Priority Chain ({data.strategy || 'priority'})
                    </span>
                    <span>Circuit & Status</span>
                  </div>

                  {data.providers.map((p, idx) => {
                    const isPrimary = idx === 0;
                    const circuitState = p.circuitState || 'CLOSED';
                    return (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl border border-neutral-200/80 bg-neutral-50/40 hover:bg-neutral-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-neutral-200/80 text-neutral-700 font-mono text-[11px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-sans font-semibold text-xs text-[#111110]">
                                {p.name}
                              </span>
                              {isPrimary && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                                  Primary
                                </span>
                              )}
                              {!isPrimary && p.id === 'nvidia' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                                  Fallback 1
                                </span>
                              )}
                              {!isPrimary && p.id === 'openai' && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase tracking-wider">
                                  Fallback 2
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10.5px] text-neutral-500 mt-0.5">
                              Model: {p.model}
                              {typeof p.avgLatencyMs === 'number' && p.avgLatencyMs > 0
                                ? ` · ${p.avgLatencyMs}ms`
                                : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                              circuitState === 'CLOSED'
                                ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                : circuitState === 'HALF_OPEN'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                            title="Circuit Breaker State"
                          >
                            {circuitState}
                          </span>

                          {p.status === 'healthy' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Active
                            </span>
                          )}
                          {p.status === 'rate_limited' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              Cooldown
                            </span>
                          )}
                          {p.status === 'disabled' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
                              Disabled
                            </span>
                          )}
                          {p.status === 'unconfigured' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
                              Unconfigured
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Puter Cloud AI Client Reserve */}
                  <div className="p-3.5 rounded-xl border border-blue-200/70 bg-blue-50/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-mono text-[10px] flex items-center justify-center font-bold">
                        <Cloud className="w-3 h-3" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-sans font-semibold text-xs text-[#111110]">
                            Puter Cloud AI
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                            Client Cloud
                          </span>
                        </div>
                        <div className="font-mono text-[10.5px] text-neutral-500 mt-0.5">
                          {puterUser
                            ? `Connected as @${puterUser.username} (${isPuterAIFallbackEnabled() ? 'Fallback On' : 'Manual'})`
                            : 'Zero-key user-authenticated Puter.js AI & Drive'}
                        </div>
                      </div>
                    </div>

                    {puterUser ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Connected
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const u = await signInPuter();
                            setPuterUser(u);
                          } catch {
                            // user dismissed popup
                          }
                        }}
                        className="px-2.5 py-1 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-semibold transition cursor-pointer"
                      >
                        Connect Puter
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 text-[11.5px] text-neutral-600 space-y-1.5 leading-relaxed">
                  <div className="font-semibold text-neutral-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    How Automatic Fallback & Circuit Breaking Works:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-500">
                    <li>Requests first attempt Google Gemini (Primary).</li>
                    <li>If Gemini hits a 429 rate limit or error, its circuit opens and traffic seamlessly routes to NVIDIA NIM.</li>
                    <li>OpenAI acts as an optional tertiary reserve when explicitly enabled.</li>
                    <li>All credentials stay strictly isolated on the server backend.</li>
                  </ul>
                </div>
              </>
            ) : activeTab === 'infra' && infra ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    num: '01',
                    title: 'Rate Limiting',
                    status: infra.pillars.rateLimiting.status,
                    detail: `${infra.pillars.rateLimiting.maxRequestsPerWindow} req/min · ${infra.pillars.rateLimiting.totalAllowed} ok / ${infra.pillars.rateLimiting.totalBlocked} blocked`,
                  },
                  {
                    num: '02',
                    title: 'Caching (LRU + TTL)',
                    status: infra.pillars.caching.status,
                    detail: `${infra.pillars.caching.size}/${infra.pillars.caching.maxSize} entries · ${infra.pillars.caching.hitRate}% hit rate`,
                  },
                  {
                    num: '03',
                    title: 'Load Balancing',
                    status: infra.pillars.loadBalancing.status,
                    detail: `Strategy: ${infra.pillars.loadBalancing.strategy}`,
                  },
                  {
                    num: '04',
                    title: 'Reverse Proxy',
                    status: infra.pillars.reverseProxy.status,
                    detail: `NGINX + Trust Proxy (${infra.pillars.reverseProxy.nginxConfig})`,
                  },
                  {
                    num: '05',
                    title: 'API Gateway',
                    status: infra.pillars.apiGateway.status,
                    detail: `${infra.pillars.apiGateway.totalRequests} reqs · ${infra.pillars.apiGateway.avgLatencyMs}ms avg`,
                  },
                  {
                    num: '06',
                    title: 'CI/CD Pipeline',
                    status: infra.pillars.cicd.status,
                    detail: infra.pillars.cicd.pipeline,
                  },
                  {
                    num: '07',
                    title: 'Docker Container',
                    status: infra.pillars.docker.status,
                    detail: `${infra.pillars.docker.dockerfile} & ${infra.pillars.docker.compose}`,
                  },
                  {
                    num: '08',
                    title: 'Kubernetes (K8s)',
                    status: infra.pillars.kubernetes.status,
                    detail: '3-replica Deployment, Service, HPA & Ingress',
                  },
                  {
                    num: '09',
                    title: 'Service Discovery',
                    status: infra.pillars.serviceDiscovery.status,
                    detail: `${infra.pillars.serviceDiscovery.up}/${infra.pillars.serviceDiscovery.totalServices} services UP`,
                  },
                  {
                    num: '10',
                    title: 'Circuit Breaker',
                    status: infra.pillars.circuitBreaker.status,
                    detail: '3-state CLOSED / OPEN / HALF_OPEN guard',
                  },
                ].map((item) => (
                  <div
                    key={item.num}
                    className="p-3 rounded-xl border border-neutral-200/80 bg-neutral-50/50 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-sans font-semibold text-xs text-neutral-900">
                        <span className="font-mono text-[10px] text-neutral-400 mr-1.5">
                          {item.num}.
                        </span>
                        {item.title}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {item.status}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-neutral-500 leading-snug">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
