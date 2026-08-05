import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatAmount } from '../api.js';
import { ProblemBox } from '../components.jsx';

/* Simulador do lado do PAGADOR: escaneia o QR (câmera via BarcodeDetector,
   nativo do Chrome) ou recebe o EMV colado, busca o payload assinado como um
   app de banco faria e envia a notificação de pagamento assinada. */

export default function PayerView() {
  const [stage, setStage] = useState('scan');   // scan | review | done
  const [emv, setEmv] = useState('');
  const [data, setData] = useState(null);       // { locId, payload, correlationEchoed }
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tipPct, setTipPct] = useState(null);   // permille (180 = 18.0%) ou null
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

  const startCam = async () => {
    if (!('BarcodeDetector' in window)) { setCamState('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamState('on');
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const hit = codes.find((c) => c.rawValue?.includes('/loc/'));
          if (hit) { stopCam(); fetchPayload(hit.rawValue); return; }
        } catch { /* frame ainda não pronto */ }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
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
  const method = methods[methodIdx];
  const baseAmount = method?.amount ?? bill?.amountDue?.amount ?? 0;
  const currency = method?.currency ?? bill?.amountDue?.currency;
  const tipAmount = tipPct ? Math.round(baseAmount * tipPct / 1000) : 0;
  const total = baseAmount + tipAmount;
  const network = method ? Object.keys(method.networks || {})[0] : null;

  const pay = async () => {
    setProblem(null); setBusy(true);
    try {
      const r = await api.payerPay({
        qrcodeId: p.id || data.locId,
        amount: total,
        ...(tipAmount ? { tipAmount } : {}),
        currency,
        network,
        payerInfo: 'simulador do console',
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
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy">Pagar</h1>
        <p className="mt-2 text-ink/55">
          Simule o app do banco: escaneie o QR, revise a cobrança e pague. A confirmação
          envia a notificação de pagamento assinada, que fica registrada no QR.
        </p>
      </motion.div>

      {problem && <div className="mt-5"><ProblemBox problem={problem} /></div>}

      <AnimatePresence mode="wait">
        {/* ---------- 1. escanear ---------- */}
        {stage === 'scan' && (
          <motion.div key="scan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card p-5 mt-6">
            <div className="rounded-xl overflow-hidden bg-navy/5 aspect-square flex items-center justify-center relative">
              <video ref={videoRef} muted playsInline className={`w-full h-full object-cover ${camState === 'on' ? '' : 'hidden'}`} />
              {camState !== 'on' && (
                <div className="text-center px-6">
                  <div className="text-5xl" aria-hidden="true">▣</div>
                  <p className="mt-2 text-sm text-ink/50">
                    {camState === 'unsupported' && 'Este navegador não tem leitor de QR nativo — cole o EMV abaixo.'}
                    {camState === 'denied' && 'Câmera negada — cole o EMV abaixo.'}
                    {camState === 'off' && 'Aponte a câmera para um QR X9.150'}
                  </p>
                  {camState === 'off' && (
                    <button onClick={startCam}
                      className="mt-4 px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 transition-colors">
                      Abrir câmera
                    </button>
                  )}
                </div>
              )}
              {camState === 'on' && (
                <div className="absolute inset-8 border-2 border-white/80 rounded-2xl pointer-events-none" />
              )}
            </div>
            {camState === 'on' && (
              <button onClick={stopCam} className="mt-3 w-full text-xs font-bold text-ink/50 hover:text-ink">Fechar câmera</button>
            )}
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-1.5">ou cole a string EMV</div>
              <textarea rows={3} value={emv} onChange={(e) => setEmv(e.target.value)} spellCheck={false}
                placeholder="00020101021226…"
                className="w-full font-mono text-xs leading-relaxed rounded-xl border border-line p-3 outline-none focus:border-petrol-500 bg-[#FCFDFF] resize-y" />
              <button onClick={() => fetchPayload(emv.trim())} disabled={!emv.trim() || busy}
                className="mt-2 w-full px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-colors">
                {busy ? 'Buscando payload assinado…' : 'Ler cobrança'}
              </button>
            </div>
          </motion.div>
        )}

        {/* ---------- 2. revisar e pagar ---------- */}
        {stage === 'review' && p && (
          <motion.div key="review" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="card overflow-hidden mt-6">
            <div className="eos-band px-6 py-5 text-white">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">Pagar para</div>
              <div className="font-display font-extrabold text-xl mt-0.5">{p.creditor?.name}</div>
              {bill?.description && <div className="text-white/65 text-sm">{bill.description}</div>}
              {data.correlationEchoed && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold bg-white/15 rounded-full px-2 py-0.5">
                  ✓ payload assinado verificado (correlationId ecoado)
                </div>
              )}
            </div>

            <div className="p-6 space-y-5">
              {bill?.tip?.allowed && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-2">Gorjeta</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setTipPct(null)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${tipPct === null ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink/55'}`}>
                      Sem gorjeta
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
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-2">Pagar com</div>
                <div className="space-y-2">
                  {methods.map((m, i) => {
                    const net = Object.keys(m.networks || {})[0];
                    return (
                      <button key={i} onClick={() => setMethodIdx(i)}
                        className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${i === methodIdx ? 'border-petrol-500 ring-2 ring-petrol-100' : 'border-line hover:border-petrol-300'}`}>
                        <span className="text-sm font-bold">{net} <span className="text-mute font-semibold">· {m.currency}</span></span>
                        <span className="text-sm font-semibold">{formatAmount(m.amount, m.currency)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-petrol-50 border border-line px-4 py-3 flex items-baseline justify-between">
                <span className="text-sm font-bold text-ink/60">Total{tipAmount ? ' (com gorjeta)' : ''}</span>
                <span className="font-display font-extrabold text-2xl text-navy">{formatAmount(total, currency)}</span>
              </div>

              <div className="flex gap-3">
                <button onClick={reset} className="px-4 py-2.5 rounded-xl text-sm font-bold text-ink/50 hover:bg-ink/5">Cancelar</button>
                <button onClick={pay} disabled={busy}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-all active:scale-[0.99]">
                  {busy ? 'Enviando notificação assinada…' : `Pagar ${formatAmount(total, currency)}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------- 3. recibo ---------- */}
        {stage === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="card p-8 mt-6 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.1 }}
              className="mx-auto w-16 h-16 rounded-full bg-[#EAF6DC] text-[#4C7A1F] flex items-center justify-center text-3xl">✓</motion.div>
            <h2 className="font-display font-extrabold text-2xl text-navy mt-4">Pagamento notificado</h2>
            <p className="text-sm text-ink/55 mt-1">
              A notificação assinada foi aceita e registrada no QR (a revisão sobe).
              O lojista vê o pagamento no console e confirma o crédito marcando <b>Pago</b>.
            </p>
            <div className="mt-4 font-mono text-xs text-mute break-all">{receipt?.transactionId}</div>
            <div className="mt-6 flex gap-3 justify-center">
              <button onClick={reset} className="px-5 py-2.5 rounded-xl border border-line text-sm font-bold text-ink/60 hover:border-petrol-300">Pagar outro</button>
              <Link to="/" className="px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700">Ver no console</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
