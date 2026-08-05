import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatAmount, networkLabel } from '../api.js';
import { ProblemBox } from '../components.jsx';
import { QrCode, Check, ShieldCheck } from 'lucide-react';

/* PAYER-side simulator: scans the QR (camera via BarcodeDetector, native in
   Chrome) or takes a pasted EMV, fetches the signed payload the way a banking
   app would, and sends the signed payment notification. On top of the QR's
   real X9 rails, it offers presentation-level channels — Eos Balance and the
   platform wallet (Apple Pay on iOS, Google Pay on Android, Card elsewhere);
   settlement always rides one of the QR's underlying networks. */

const WALLET =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ? { channel: 'apple-pay', label: 'Apple Pay' } :
  /Android/.test(navigator.userAgent) ? { channel: 'google-pay', label: 'Google Pay' } :
  { channel: 'card', label: 'Card' };

function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" className="w-5 h-5" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function RippleIcon() {
  // RLUSD badge: the Ripple/XRPL mark (mirrored chevrons) on the brand blue coin.
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#0A93EB" />
      <path fill="#fff" d="M7.2 6.2h2.1l2.7 2.8 2.7-2.8h2.1l-3.6 3.7c-.66.68-1.74.68-2.4 0L7.2 6.2z" />
      <path fill="#fff" d="M7.2 17.8h2.1l2.7-2.8 2.7 2.8h2.1l-3.6-3.7c-.66-.68-1.74-.68-2.4 0l-3.6 3.7z" />
    </svg>
  );
}

function WalletIcon({ channel }) {
  if (channel === 'apple-pay') {
    // U+F8FF renders as the Apple logo exactly on the platforms that show Apple Pay
    return <span className="text-base leading-none" aria-hidden="true"></span>;
  }
  if (channel === 'google-pay') return <GoogleG />;
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 text-navy" fill="currentColor" aria-hidden="true">
      <path d="M2 8a2 2 0 012-2h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8zm2 2v2h16v-2H4z" />
    </svg>
  );
}

export default function PayerView() {
  const { id: linkedId } = useParams();
  const [stage, setStage] = useState('scan');   // scan | review | done
  const [emv, setEmv] = useState('');
  const [data, setData] = useState(null);       // { locId, payload, correlationEchoed }
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tipPct, setTipPct] = useState(null);   // permille (180 = 18.0%) or null
  const [methodIdx, setMethodIdx] = useState(0);
  const [receipt, setReceipt] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camState, setCamState] = useState('off'); // off | on | unsupported | denied

  const stopCam = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamState('off');
  };
  useEffect(() => () => stopCam(), []);

  // Shared payment link (/pay/:id): fetch the QR and jump straight to review.
  useEffect(() => {
    if (!linkedId) return;
    (async () => {
      setBusy(true); setProblem(null);
      try {
        const qr = await api.get(linkedId);
        await fetchPayload(qr.qrCode);
      } catch (e) {
        setProblem(e.problem || { title: e.message });
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedId]);

  const startCam = async () => {
    // camera requires a secure context (https or localhost)
    if (!navigator.mediaDevices?.getUserMedia) { setCamState('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamState('on');

      const onHit = (raw) => { stopCam(); fetchPayload(raw); };

      if ('BarcodeDetector' in window) {
        // Chrome/Android: native detector
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!streamRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes.find((c) => c.rawValue?.includes('/loc/'));
            if (hit) return onHit(hit.rawValue);
          } catch { /* frame not ready yet */ }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        // Safari/iPhone: decodes frames on a canvas with jsQR
        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (!streamRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth) {
            const scale = Math.min(1, 640 / v.videoWidth);
            canvas.width = v.videoWidth * scale;
            canvas.height = v.videoHeight * scale;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data?.includes('/loc/')) return onHit(code.data);
          }
          setTimeout(() => requestAnimationFrame(tick), 120);
        };
        requestAnimationFrame(tick);
      }
    } catch {
      setCamState('denied');
    }
  };

  const fetchPayload = async (emvStr) => {
    setProblem(null); setBusy(true); setEmv(emvStr);
    try {
      const d = await api.payerFetch(emvStr);
      setData(d);
      setTipPct(null); setMethodIdx(0);
      setStage('review');
    } catch (e) {
      setProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  const p = data?.payload;
  const bill = p?.bill;
  const methods = p?.paymentMethods || [];

  // Settlement rail for the synthetic channels: prefer a US bank rail, else
  // the first network the QR offers.
  const bankMethod = methods.find((m) =>
    Object.keys(m.networks || {}).some((n) => /^(fednow|rtp|ach)$/i.test(n)));
  const settleMethod = bankMethod || methods[0];
  const settleNetwork = settleMethod
    ? (Object.keys(settleMethod.networks || {}).find((n) => /^(fednow|rtp|ach)$/i.test(n))
        || Object.keys(settleMethod.networks || {})[0])
    : null;

  // Payment options: Eos Balance + platform wallet on top of the real rails.
  const options = p ? [
    { kind: 'eos', channel: 'eos-balance', label: 'Eos Balance', sub: 'Instant · fee-free',
      amount: bill?.amountDue?.amount ?? settleMethod?.amount, currency: bill?.amountDue?.currency ?? settleMethod?.currency,
      network: settleNetwork },
    { kind: 'wallet', channel: WALLET.channel, label: WALLET.label, sub: 'Via your device wallet',
      amount: bill?.amountDue?.amount ?? settleMethod?.amount, currency: bill?.amountDue?.currency ?? settleMethod?.currency,
      network: settleNetwork },
    ...(['USD', 'USDC', 'USDT', 'RLUSD'].includes(bill?.amountDue?.currency ?? settleMethod?.currency) ? [
      { kind: 'rlusd', channel: 'rlusd', label: 'RLUSD', sub: 'Ripple · USD stablecoin', asRlusd: true,
        amount: bill?.amountDue?.amount ?? settleMethod?.amount, currency: bill?.amountDue?.currency ?? settleMethod?.currency,
        network: settleNetwork },
    ] : []),
    ...methods.map((m) => ({
      kind: 'network', channel: undefined,
      label: Object.keys(m.networks || {})[0], sub: m.currency,
      amount: m.amount, currency: m.currency,
      network: Object.keys(m.networks || {})[0],
    })),
  ] : [];

  const selected = options[methodIdx] || options[0];
  const baseAmount = selected?.amount ?? 0;
  const currency = selected?.currency;
  const tipAmount = tipPct ? Math.round(baseAmount * tipPct / 1000) : 0;
  const total = baseAmount + tipAmount;

  const pay = async () => {
    setProblem(null); setBusy(true);
    try {
      const r = await api.payerPay({
        qrcodeId: p.id || data.locId,
        amount: total,
        ...(tipAmount ? { tipAmount } : {}),
        currency,
        network: selected.network,
        channel: selected.channel,
        payerInfo: selected.label,
      });
      setReceipt(r);
      setStage('done');
    } catch (e) {
      setProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  const reset = () => { setStage('scan'); setData(null); setEmv(''); setProblem(null); setReceipt(null); };

  return (
    <div className="max-w-md mx-auto">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy">Pay</h1>
        <p className="mt-2 text-ink/55">
          Simulate the banking app: scan the QR, review the payment request and pay
          with Eos Balance, your device wallet or the QR&apos;s own rails. Confirming
          sends the signed notification and settles the QR as Paid.
        </p>
      </motion.div>

      {problem && <div className="mt-5"><ProblemBox problem={problem} /></div>}

      <AnimatePresence mode="wait">
        {/* ---------- 1. scan ---------- */}
        {stage === 'scan' && linkedId && !problem && (
          <motion.div key="link" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="card p-10 mt-6 text-center">
            <QrCode className="w-12 h-12 mx-auto text-navy/30 animate-pulse" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold text-ink/55">Opening the payment request…</p>
          </motion.div>
        )}
        {stage === 'scan' && !linkedId && (
          <motion.div key="scan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card p-5 mt-6">
            <div className="rounded-xl overflow-hidden bg-navy/5 aspect-square flex items-center justify-center relative">
              <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${camState === 'on' ? '' : 'hidden'}`} />
              {camState !== 'on' && (
                <div className="text-center px-6">
                  <QrCode className="w-14 h-14 mx-auto text-navy/30" aria-hidden="true" />
                  <p className="mt-2 text-sm text-ink/50">
                    {camState === 'unsupported' && 'Camera unavailable (requires HTTPS) — paste the EMV below.'}
                    {camState === 'denied' && 'Camera denied — paste the EMV below.'}
                    {camState === 'off' && 'Point the camera at an X9.150 QR'}
                  </p>
                  {camState === 'off' && (
                    <button onClick={startCam}
                      className="mt-4 px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 transition-colors">
                      Open camera
                    </button>
                  )}
                </div>
              )}
              {camState === 'on' && (
                <div className="absolute inset-8 border-2 border-white/80 rounded-2xl pointer-events-none" />
              )}
            </div>
            {camState === 'on' && (
              <button onClick={stopCam} className="mt-3 w-full text-xs font-bold text-ink/50 hover:text-ink">Close camera</button>
            )}
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-1.5">or paste the EMV string</div>
              <textarea rows={3} value={emv} onChange={(e) => setEmv(e.target.value)} spellCheck={false}
                placeholder="00020101021226…"
                className="w-full font-mono text-xs leading-relaxed rounded-xl border border-line p-3 outline-none focus:border-petrol-500 bg-[#FCFDFF] resize-y" />
              <button onClick={() => fetchPayload(emv.trim())} disabled={!emv.trim() || busy}
                className="mt-2 w-full px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-colors">
                {busy ? 'Fetching signed payload…' : 'Read payment request'}
              </button>
            </div>
          </motion.div>
        )}

        {/* ---------- 2. review and pay ---------- */}
        {stage === 'review' && p && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card overflow-hidden mt-6">
            <div className="eos-band px-6 py-5 text-white">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Pay to</div>
              <div className="font-display font-extrabold text-xl mt-0.5">{p.creditor?.name}</div>
              {bill?.description && <div className="text-white/65 text-sm">{bill.description}</div>}
              {data.correlationEchoed && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold bg-white/15 rounded-full px-2 py-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> signed payload verified (correlationId echoed)
                </div>
              )}
            </div>

            <div className="p-6 space-y-5">
              {bill?.tip?.allowed && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-2">Tip</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setTipPct(null)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${tipPct === null ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink/55'}`}>
                      No tip
                    </button>
                    {(bill.tip.presets || []).map((t) => (
                      <button key={t} onClick={() => setTipPct(t)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${tipPct === t ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink/55'}`}>
                        {(t / 10).toFixed(0)}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-2">Pay with</div>
                <div className="space-y-2">
                  {options.map((o, i) => (
                    <button key={i} onClick={() => setMethodIdx(i)}
                      className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${i === methodIdx ? 'border-petrol-500 ring-2 ring-petrol-100' : 'border-line hover:border-petrol-300'}`}>
                      <span className="flex items-center gap-3 min-w-0">
                        {o.kind === 'eos' && (
                          <span className="shrink-0 w-9 h-6 rounded-md border border-line bg-white flex items-center justify-center p-0.5">
                            <img src="/eos-logo.svg" alt="" className="w-full h-full object-contain" />
                          </span>
                        )}
                        {o.kind === 'rlusd' && (
                          <span className="shrink-0 w-9 h-6 rounded-md border border-line bg-white flex items-center justify-center">
                            <RippleIcon />
                          </span>
                        )}
                        {o.kind === 'wallet' && (
                          <span className={`shrink-0 w-9 h-6 rounded-md flex items-center justify-center ${o.channel === 'apple-pay' ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
                            <WalletIcon channel={o.channel} />
                          </span>
                        )}
                        {o.kind === 'network' && (
                          <span className="shrink-0 w-9 h-6 rounded-md bg-petrol-50 flex items-center justify-center text-[9px] font-bold uppercase tracking-wider text-petrol-700">
                            {String(o.label).slice(0, 3)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-bold truncate">{o.label}</span>
                          <span className="block text-[11px] text-mute truncate">{o.sub}</span>
                        </span>
                      </span>
                      <span className="text-sm font-semibold shrink-0 ml-3">
                        {o.asRlusd && o.currency !== 'RLUSD'
                          ? formatAmount(o.amount, o.currency).replace(/\S+$/, 'RLUSD')
                          : formatAmount(o.amount, o.currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-petrol-50 border border-line px-4 py-3 flex items-baseline justify-between">
                <span className="text-sm font-bold text-ink/60">Total{tipAmount ? ' (incl. tip)' : ''}</span>
                <span className="font-display font-extrabold text-2xl text-navy">{formatAmount(total, currency)}</span>
              </div>

              <div className="flex gap-3">
                <button onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-bold text-ink/50 hover:bg-ink/5">Cancel</button>
                <button onClick={pay} disabled={busy}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-all active:scale-[0.99]">
                  {busy ? 'Sending signed notification…' : `Pay ${formatAmount(total, currency)}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------- 3. receipt ---------- */}
        {stage === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-8 mt-6 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }}
              className="mx-auto w-16 h-16 rounded-full bg-[#EAF6DC] text-[#4C7A1F] flex items-center justify-center"><Check className="w-8 h-8" strokeWidth={3} /></motion.div>
            <h2 className="font-display font-extrabold text-2xl text-navy mt-4">
              {receipt?.status === 'PAID' ? 'Payment completed' : 'Payment notified'}
            </h2>
            {receipt?.status === 'PAID' && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full border bg-[#D6E7FA] text-navy border-[#B7D4F5] text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" /> Paid
              </span>
            )}
            <p className="text-sm text-ink/55 mt-2">
              {receipt?.status === 'PAID'
                ? 'The signed notification was accepted and the QR settled — its status is now Paid in the console.'
                : 'The signed notification was accepted and recorded on the QR. The merchant confirms the credit by marking it Paid.'}
            </p>
            <div className="mt-4 font-mono text-xs text-mute break-all">{receipt?.transactionId}</div>
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-line text-sm font-bold text-ink/60 hover:border-petrol-300">Pay another</button>
              <Link to="/" className="px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700">View in console</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
