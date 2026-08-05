import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { STATUS_META } from './api.js';

/* ---------- QR rendered in the browser from the EMV string ----------
   With `logo`, error correction goes up to H (30%) and the Eos mark is centered —
   the QR stays scannable because the covered area is well below the redundancy. */
export function QRImage({ emv, size = 220, logo = false, className = '' }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (emv && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, emv, {
        width: size, margin: 2, errorCorrectionLevel: logo ? 'H' : 'M',
        color: { dark: '#101312', light: '#FFFFFF' },
      });
    }
  }, [emv, size, logo]);
  if (!emv) return null;
  const canvas = <canvas ref={canvasRef} className={`rounded-xl ${className}`} aria-label="Payment QR code" />;
  if (!logo) return canvas;
  return (
    <div className="relative inline-block leading-none">
      {canvas}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg border border-line flex items-center justify-center"
        style={{ width: size * 0.24, height: size * 0.24 * 0.62, padding: size * 0.018 }}
      >
        <img src="/eos-logo.svg" alt="" className="w-full h-full object-contain" />
      </span>
    </div>
  );
}

export async function downloadQR(emv, name, fmt) {
  if (fmt === 'svg') {
    const svg = await QRCode.toString(emv, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    triggerDownload(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), `${name}.svg`);
  } else {
    const url = await QRCode.toDataURL(emv, { width: 880, margin: 3, errorCorrectionLevel: 'M' });
    triggerDownload(url, `${name}.png`);
  }
}
function triggerDownload(href, download) {
  const a = Object.assign(document.createElement('a'), { href, download });
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- badges and blocks ---------- */
export function StatusBadge({ status, size = 'sm' }) {
  const meta = STATUS_META[status] || { label: status, cls: 'bg-ink/5 text-ink/60 border-ink/10' };
  const pad = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${pad} ${meta.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {meta.label}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy' }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true); setTimeout(() => setOk(false), 1600);
      }}
      className="text-xs font-semibold text-petrol-600 hover:text-petrol-800 transition-colors"
    >
      {ok ? 'Copied ✓' : label}
    </button>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40 mb-0.5">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function ProblemBox({ problem }) {
  if (!problem) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="font-bold">{problem.title || 'Error'}</div>
      {problem.detail && <div className="mt-1">{problem.detail}</div>}
      {Array.isArray(problem.violations) && (
        <ul className="mt-2 space-y-1 font-mono text-xs">
          {problem.violations.map((v, i) => (
            <li key={i}><span className="font-bold">{v.field || v.property}:</span> {v.message || v.description}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- geometric QR-module motif (emotion graphic) ---------- */
export function QRMotif({ className = '' }) {
  const cells = [
    [0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2],  // finder pattern
    [5,0],[7,1],[6,2],[5,3],[8,3],[4,1],
  ];
  return (
    <svg viewBox="0 0 9 4" className={className} aria-hidden="true">
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="0.82" height="0.82" rx="0.16" fill="currentColor"
          opacity={i < 8 ? 0.9 : 0.28 + (i % 4) * 0.14} />
      ))}
    </svg>
  );
}
