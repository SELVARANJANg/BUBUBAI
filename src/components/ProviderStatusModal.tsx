import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Server, ShieldCheck, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  enabled: boolean;
  model: string;
  status: 'healthy' | 'rate_limited' | 'error' | 'unconfigured' | 'disabled';
  lastError?: string;
  cooldownUntil?: number;
}

interface ProviderStatusData {
  priority: string[];
  providers: ProviderInfo[];
}

interface ProviderStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderStatusModal({ isOpen, onClose }: ProviderStatusModalProps) {
  const [data, setData] = useState<ProviderStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/providers/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
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
          className="relative bg-white rounded-2xl shadow-2xl border border-neutral-200 max-w-lg w-full overflow-hidden z-10"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-sans font-bold text-sm text-[#111110]">
                  Multi-Provider Fallback Status
                </h3>
                <p className="font-sans text-[11px] text-neutral-500">
                  Automatic failover for 429 rate limits & provider outages
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {loading && !data ? (
              <div className="flex items-center justify-center py-12 text-neutral-400 text-xs">
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Checking provider health...
              </div>
            ) : error ? (
              <div className="p-4 rounded-xl bg-red-50 text-red-600 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : data ? (
              <>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 uppercase tracking-wider px-1">
                    <span>Configured Priority Chain</span>
                    <span>Status</span>
                  </div>

                  {data.providers.map((p, idx) => {
                    const isPrimary = idx === 0;
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
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {p.status === 'healthy' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Active
                            </span>
                          )}
                          {p.status === 'rate_limited' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              Rate Limited
                            </span>
                          )}
                          {p.status === 'disabled' && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">
                              Disabled (Budget)
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
                </div>

                <div className="p-3.5 rounded-xl bg-neutral-100/70 border border-neutral-200/60 text-[11.5px] text-neutral-600 space-y-1.5 leading-relaxed">
                  <div className="font-semibold text-neutral-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    How Automatic Fallback Works:
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-neutral-500">
                    <li>Requests first attempt Google Gemini (Primary).</li>
                    <li>If Gemini hits a 429 rate limit or temporary error, it seamlessly routes to NVIDIA NIM.</li>
                    <li>OpenAI serves as an optional tertiary reserve when explicitly enabled in environment variables.</li>
                    <li>All credentials remain safely isolated on the secure server backend.</li>
                  </ul>
                </div>
              </>
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
