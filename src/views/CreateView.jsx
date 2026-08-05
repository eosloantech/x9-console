import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { ProblemBox } from '../components.jsx';

const PRESET_LABELS = {
  burger: 'Hamburgueria — gorjeta com presets',
  waterbill: 'Conta de água — desconto + multa, 3 trilhos',
  lab: 'Laboratório — invoice + USDC/Ethereum',
  parking: 'Estacionamento — valor pequeno, USDC/Polygon',
  donation: 'Doação — valor livre, só Bitcoin',
};

export default function CreateView() {
  const nav = useNavigate();
  const [presets, setPresets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [json, setJson] = useState('');
  const [jsonErr, setJsonErr] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.presets().then(setPresets, () => setPresets([])); }, []);

  const pick = (p) => {
    setSelected(p.name);
    setJson(JSON.stringify(p.body, null, 2));
    setJsonErr(null); setProblem(null);
  };

  const onChange = (v) => {
    setJson(v);
    try { JSON.parse(v); setJsonErr(null); } catch (e) { setJsonErr(e.message); }
  };

  const submit = async () => {
    setProblem(null); setBusy(true);
    try {
      const body = JSON.parse(json);
      const res = await api.create(body);
      nav(`/qr/${res.id}`, { state: { justCreated: true } });
    } catch (e) {
      setProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-4xl font-medium tracking-tight">Criar QR code</h1>
        <p className="mt-2 text-ink/55 max-w-2xl">
          Escolha um cenário e ajuste o corpo da requisição — valores em <em>minor units</em>
          (2450 = US$ 24,50). O servidor valida e responde com erros campo a campo (RFC-7807).
        </p>
      </motion.div>

      <div className="mt-8 grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* cenários */}
        <div className="space-y-2.5">
          {presets.map((p) => (
            <button key={p.name} onClick={() => pick(p)}
              className={`card w-full text-left p-4 transition-all ${selected === p.name ? 'border-petrol-500 ring-2 ring-petrol-100' : 'card-hover'}`}>
              <div className="font-bold capitalize">{p.name}</div>
              <div className="text-xs text-ink/50 mt-0.5">{PRESET_LABELS[p.name] || 'Cenário do playground'}</div>
            </button>
          ))}
          {presets.length === 0 && <div className="text-sm text-ink/40">Sem presets — escreva o JSON ao lado.</div>}
        </div>

        {/* editor */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">
              POST /api/v1/payment-request
            </span>
            {jsonErr && <span className="text-xs text-red-600 font-semibold">JSON inválido</span>}
          </div>
          <textarea
            value={json} onChange={(e) => onChange(e.target.value)}
            spellCheck={false} rows={22}
            placeholder="Escolha um cenário ao lado, ou cole aqui o corpo da requisição…"
            className={`w-full font-mono text-xs leading-relaxed rounded-xl border p-4 outline-none transition-colors resize-y bg-[#FCFCFA] ${
              jsonErr ? 'border-red-300 focus:border-red-500' : 'border-ink/15 focus:border-petrol-500'
            }`}
          />
          {problem && <div className="mt-4"><ProblemBox problem={problem} /></div>}
          <div className="mt-4 flex justify-end">
            <button onClick={submit} disabled={!json || !!jsonErr || busy}
              className="px-6 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
              {busy ? 'Criando…' : 'Criar QR code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
