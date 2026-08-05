import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatAmount } from '../api.js';
import { ProblemBox } from '../components.jsx';

// Scenario presentation: display name + one-line pitch, keyed by preset file name.
const SCENARIOS = {
  burger:        { name: 'Restaurant',     desc: 'Dine-in bill with tip presets',     icon: '🍽️', order: 1 },
  parking:       { name: 'Parking',        desc: 'Small ticket, USDC on Polygon',     icon: '🅿️', order: 2 },
  waterbill:     { name: 'Utility bill',   desc: 'Discount + late fee, 3 bank rails', icon: '💧', order: 3 },
  lab:           { name: 'Medical lab',    desc: 'Invoice + USDC on Ethereum',        icon: '🧪', order: 4 },
  cloudprovider: { name: 'Cloud provider', desc: 'B2B invoice',                       icon: '☁️', order: 5 },
  donation:      { name: 'Donation',       desc: 'Open amount, Bitcoin only',         icon: '💛', order: 6 },
};

// Currency decimals for the amount input (minor units ↔ display).
const DECIMALS = { USD: 2, JPY: 0, USDC: 6, BTC: 8 };

export default function CreateView() {
  const nav = useNavigate();
  const [presets, setPresets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [body, setBody] = useState(null);        // the create request being edited
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState(''); // advanced editor buffer
  const [jsonErr, setJsonErr] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.presets().then((ps) => {
      const sorted = [...ps].sort((a, b) => (SCENARIOS[a.name]?.order ?? 99) - (SCENARIOS[b.name]?.order ?? 99));
      setPresets(sorted);
      if (sorted.length) pick(sorted[0]);        // opens pre-filled right away
    }, () => setPresets([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (p) => {
    setSelected(p.name);
    const b = JSON.parse(JSON.stringify(p.body)); // deep copy so edits don't touch the preset
    setBody(b);
    setJsonDraft(JSON.stringify(b, null, 2));
    setJsonErr(null); setProblem(null);
  };

  // --- form <-> body bindings -----------------------------------------------
  const update = (fn) => setBody((prev) => {
    const b = JSON.parse(JSON.stringify(prev));
    fn(b);
    setJsonDraft(JSON.stringify(b, null, 2));
    return b;
  });

  const currency = body?.bill?.amountDue?.currency || body?.paymentMethods?.[0]?.currency || 'USD';
  const dec = DECIMALS[currency] ?? 2;
  const openAmount = body ? !body.bill?.amountDue : false;
  const displayAmount = body?.bill?.amountDue ? (body.bill.amountDue.amount / 10 ** dec) : '';

  const setAmount = (v) => update((b) => {
    const minor = Math.round(parseFloat(v || '0') * 10 ** dec);
    const old = b.bill.amountDue.amount || 1;
    b.bill.amountDue.amount = minor;
    // keep every payment method in sync: same currency copies the value,
    // other currencies scale proportionally (e.g. USDC's 6 decimals).
    (b.paymentMethods || []).forEach((m) => {
      m.amount = m.currency === b.bill.amountDue.currency
        ? minor
        : Math.max(1, Math.round(m.amount * (minor / old)));
    });
  });

  const applyJson = (v) => {
    setJsonDraft(v);
    try {
      const b = JSON.parse(v);
      setBody(b); setJsonErr(null);
    } catch (e) { setJsonErr(e.message); }
  };

  const submit = async () => {
    setProblem(null); setBusy(true);
    try {
      const res = await api.create(body);
      nav(`/qr/${res.id}`, { state: { justCreated: true } });
    } catch (e) {
      setProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  const methods = body?.paymentMethods || [];
  const tip = body?.bill?.tip;

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-line bg-white text-sm outline-none focus:border-petrol-500 transition-colors';
  const labelCls = 'block text-[11px] font-bold uppercase tracking-[0.12em] text-mute mb-1';

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy">Create QR code</h1>
        <p className="mt-2 text-ink/55 max-w-2xl">
          Pick a scenario, tweak the details and generate — the payment request comes pre-filled.
        </p>
      </motion.div>

      {/* scenario picker */}
      <div className="mt-7 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {presets.map((p) => {
          const s = SCENARIOS[p.name] || { name: p.name, desc: 'Playground scenario', icon: '📄' };
          return (
            <button key={p.name} onClick={() => pick(p)}
              className={`card text-left p-3.5 transition-all ${selected === p.name ? 'border-petrol-500 ring-2 ring-petrol-100' : 'card-hover'}`}>
              <div className="text-xl leading-none" aria-hidden="true">{s.icon}</div>
              <div className="font-bold text-sm mt-2">{s.name}</div>
              <div className="text-[11px] text-mute leading-snug mt-0.5">{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* pre-filled form */}
      {body && (
        <motion.div key={selected} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="mt-6 grid lg:grid-cols-[1fr_340px] gap-6 items-start">

          <div className="space-y-5">
            {/* merchant */}
            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-navy mb-4">Merchant</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Business name</label>
                  <input className={inputCls} value={body.creditor?.name || ''}
                    onChange={(e) => update((b) => { b.creditor.name = e.target.value; })} />
                </div>
                <div>
                  <label className={labelCls}>City</label>
                  <input className={inputCls} value={body.creditor?.address?.city || ''}
                    onChange={(e) => update((b) => { b.creditor.address.city = e.target.value; })} />
                </div>
                <div>
                  <label className={labelCls}>State</label>
                  <input className={inputCls} maxLength={2} value={body.creditor?.address?.state || ''}
                    onChange={(e) => update((b) => { b.creditor.address.state = e.target.value.toUpperCase(); })} />
                </div>
              </div>
            </div>

            {/* bill */}
            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-navy mb-4">Payment request</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <input className={inputCls} value={body.bill?.description || ''}
                    onChange={(e) => update((b) => { b.bill.description = e.target.value; })} />
                </div>
                <div>
                  <label className={labelCls}>Amount ({currency})</label>
                  {openAmount ? (
                    <div className={`${inputCls} bg-petrol-50 text-mute cursor-not-allowed`}>Open — payer chooses</div>
                  ) : (
                    <input className={`${inputCls} font-display font-extrabold text-xl text-navy`}
                      type="number" min="0" step={1 / 10 ** Math.min(dec, 2)}
                      value={displayAmount}
                      onChange={(e) => setAmount(e.target.value)} />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Tip</label>
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    {tip?.presets?.length
                      ? tip.presets.map((t) => (
                          <span key={t} className="px-2.5 py-1 rounded-full bg-petrol-50 text-petrol-700 text-xs font-bold">{(t / 10).toFixed(0)}%</span>
                        ))
                      : <span className="text-sm text-mute pt-1">No tip on this scenario</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* methods (read-only summary) */}
            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-navy mb-3">Payment rails</h2>
              <div className="flex flex-wrap gap-2">
                {methods.map((m, i) => {
                  const net = Object.keys(m.networks || {})[0];
                  return (
                    <span key={i} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-line bg-white text-xs font-bold">
                      <span className="text-petrol-700 uppercase tracking-wide">{net}</span>
                      <span className="text-mute font-semibold">{formatAmount(m.amount, m.currency)}</span>
                    </span>
                  );
                })}
              </div>
              <p className="text-[11px] text-mute mt-3">Rails come from the scenario — switch scenarios to change them, or use the advanced editor below.</p>
            </div>

            {/* advanced JSON, tucked away */}
            <div className="card overflow-hidden">
              <button onClick={() => setJsonOpen((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
                  Advanced · raw request (POST /api/v1/payment-request)
                </span>
                <span className={`text-mute transition-transform ${jsonOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              <AnimatePresence>
                {jsonOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="px-5 pb-5">
                      {jsonErr && <div className="mb-2 text-xs text-red-600 font-semibold">Invalid JSON — the form reflects the last valid version.</div>}
                      <textarea value={jsonDraft} onChange={(e) => applyJson(e.target.value)}
                        spellCheck={false} rows={18}
                        className={`w-full font-mono text-xs leading-relaxed rounded-xl border p-4 outline-none transition-colors resize-y bg-[#FCFDFF] ${jsonErr ? 'border-red-300' : 'border-line focus:border-petrol-500'}`} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* summary + generate */}
          <div className="card p-5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-bold text-navy">Summary</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-mute">Merchant</span><span className="font-bold text-right truncate">{body.creditor?.name}</span></div>
              <div className="flex justify-between gap-3"><span className="text-mute">Description</span><span className="font-semibold text-right truncate">{body.bill?.description}</span></div>
              <div className="flex justify-between gap-3"><span className="text-mute">Rails</span><span className="font-semibold">{methods.length}</span></div>
            </div>
            <div className="mt-4 rounded-xl bg-petrol-50 border border-line px-4 py-3 text-center">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Amount</div>
              <div className="font-display font-extrabold text-3xl text-navy mt-0.5">
                {openAmount ? 'Open' : formatAmount(body.bill.amountDue.amount, currency)}
              </div>
            </div>
            {problem && <div className="mt-4"><ProblemBox problem={problem} /></div>}
            <button onClick={submit} disabled={busy || !!jsonErr}
              className="mt-4 w-full px-6 py-3 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-all active:scale-[0.99]">
              {busy ? 'Generating…' : 'Generate QR code'}
            </button>
            <p className="text-[11px] text-mute mt-2 text-center">The server validates every field (RFC-7807).</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
