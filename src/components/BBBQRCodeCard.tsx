import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, Download, ShieldCheck, Cloud } from 'lucide-react';

interface BBBQRCodeCardProps {
  uid?: string;
  username?: string;
  name?: string;
  variant?: 'light' | 'dark';
  puterConnected?: boolean;
  onSyncToPuter?: () => Promise<void>;
}

export function formatBBBIdentifier(uid?: string): string {
  const clean = (uid || 'GUEST0').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const code = (clean.slice(0, 6) || 'GUEST0').padEnd(6, '0');
  return `BBB-${code}`;
}

export function buildBBBAuthPayload(params: {
  bbbId: string;
  uid?: string;
  username?: string;
}): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://bububai.vercel.app';
  const query = new URLSearchParams({
    bbb: params.bbbId,
    u: params.username || 'user',
  });
  return `${origin}/?${query.toString()}`;
}

export function BBBQRCodeCard({
  uid,
  username,
  variant = 'light',
  puterConnected = false,
  onSyncToPuter,
}: BBBQRCodeCardProps) {
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [copiedBBB, setCopiedBBB] = useState(false);
  const [syncingPuter, setSyncingPuter] = useState(false);
  const [puterSynced, setPuterSynced] = useState(false);

  const bbbId = formatBBBIdentifier(uid);
  const qrPayload = buildBBBAuthPayload({ bbbId, uid, username });

  const handleCopyBBB = () => {
    navigator.clipboard.writeText(bbbId);
    setCopiedBBB(true);
    setTimeout(() => setCopiedBBB(false), 2000);
  };

  const handleDownloadQR = () => {
    const svgEl = qrContainerRef.current?.querySelector('svg');
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${bbbId}-auth-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSyncPuter = async () => {
    if (!onSyncToPuter || syncingPuter) return;
    setSyncingPuter(true);
    try {
      await onSyncToPuter();
      setPuterSynced(true);
      setTimeout(() => setPuterSynced(false), 3000);
    } finally {
      setSyncingPuter(false);
    }
  };

  const isDark = variant === 'dark';

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 transition-all ${
        isDark
          ? 'bg-neutral-900/90 border-neutral-700/60 text-neutral-100'
          : 'bg-[#fcfcfb] border-[#e2e2de] text-[#111110]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isDark
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-sans font-bold text-xs tracking-tight leading-none">
              BBB Authentication QR
            </h4>
            <p
              className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${
                isDark ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            >
              Physical-to-Digital Pass
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
            isDark
              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          <ShieldCheck className="w-3 h-3" />
          Verified
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Crisp White Scannable QR Frame */}
        <div
          ref={qrContainerRef}
          className="bg-white p-2.5 rounded-xl border border-neutral-200 shadow-sm shrink-0 flex items-center justify-center"
          aria-label={`QR Code for ${bbbId}`}
        >
          <QRCodeSVG
            value={qrPayload}
            size={112}
            level="M"
            bgColor="#FFFFFF"
            fgColor="#111110"
            includeMargin={false}
          />
        </div>

        {/* Identifier & Quick Actions */}
        <div className="flex-1 min-w-0 w-full space-y-2.5 text-center sm:text-left">
          <div>
            <span
              className={`text-[9px] font-mono uppercase tracking-widest block ${
                isDark ? 'text-neutral-400' : 'text-neutral-500'
              }`}
            >
              Unique BBB Identifier
            </span>
            <div className="mt-1 flex items-center justify-center sm:justify-start gap-2">
              <span
                className={`font-mono text-sm font-black tracking-widest select-all ${
                  isDark ? 'text-emerald-400' : 'text-[#111110]'
                }`}
              >
                {bbbId}
              </span>
              <button
                type="button"
                onClick={handleCopyBBB}
                className={`p-1 rounded-md transition cursor-pointer ${
                  isDark
                    ? 'hover:bg-white/10 text-neutral-400 hover:text-white'
                    : 'hover:bg-neutral-200/70 text-neutral-500 hover:text-neutral-900'
                }`}
                title="Copy BBB Identifier"
              >
                {copiedBBB ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <p
            className={`text-[10px] leading-relaxed ${
              isDark ? 'text-neutral-400' : 'text-neutral-500'
            }`}
          >
            Scan this QR code on any trusted terminal or mobile camera to
            present your <span className="font-mono font-semibold">{bbbId}</span>{' '}
            identity pass.
          </p>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleDownloadQR}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider transition cursor-pointer ${
                isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700'
                  : 'bg-[#111110] hover:bg-neutral-800 text-white'
              }`}
            >
              <Download className="w-3 h-3" />
              Save QR
            </button>

            {onSyncToPuter && (
              <button
                type="button"
                onClick={handleSyncPuter}
                disabled={syncingPuter}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition cursor-pointer disabled:opacity-50 ${
                  puterSynced
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isDark
                    ? 'bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 border-neutral-700'
                    : 'bg-white hover:bg-neutral-100 text-neutral-700 border-neutral-200'
                }`}
              >
                <Cloud className="w-3 h-3 text-blue-500" />
                {syncingPuter
                  ? 'Syncing...'
                  : puterSynced
                  ? 'Synced to Puter'
                  : puterConnected
                  ? 'Sync to Puter'
                  : 'Save via Puter'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
