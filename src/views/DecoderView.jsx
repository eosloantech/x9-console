import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { QRImage, ProblemBox } from '../components.jsx';

export default function DecoderView() {
  const [emv, setEmv] = useState('');
  const [result, setResult] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  const decode = async () => {
    setProblem(null); setResult(null); setBusy(true);
    try {
      setResult(await api.decode(emv.trim()));
    } catch (e) {
      setProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy">Decoder EMV</h1>
        <p className="mt-2 text-ink/55 max-w-2xl">
          Cole uma string EMV e o backend a decodifica — se o QR existir nesta base,
          volta a cobrança completa.
        </p>
      </motion.div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6 items-start">
        <div className="card p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40 mb-2">
            POST /api/v1/qrcode-emv-decoder
          </div>
          <textarea
            value={emv} onChange={(e) => setEmv(e.target.value)} rows={6} spellCheck={false}
            placeholder="00020101021226…"
            className="w-full font-mono text-xs leading-relaxed rounded-xl border border-ink/15 p-4 outline-none focus:border-petrol-500 bg-[#FCFCFA] resize-y"
          />
          <div className="mt-3 flex items-center justify-between">
            {emv.trim() && <QRImage emv={emv.trim()} size={96} className="border border-ink/10" />}
            <button onClick={decode} disabled={!emv.trim() || busy}
              className="ml-auto px-6 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-all active:scale-[0.98]">
              {busy ? 'Decodificando…' : 'Decodificar'}
            </button>
          </div>
          {problem && <div className="mt-4"><ProblemBox problem={problem} /></div>}
        </div>

        {result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40 mb-2">Resultado</div>
            <pre className="font-mono text-xs leading-relaxed overflow-x-auto bg-[#FCFCFA] border border-ink/10 rounded-xl p-4 max-h-[560px] overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </motion.div>
        )}
      </div>
    </div>
  );
}
