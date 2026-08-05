import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, formatAmount, networkLabel, STATUS_META } from '../api.js';
import { QRImage, StatusBadge, ProblemBox } from '../components.jsx';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } },
};

export default function ListView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');

  useEffect(() => {
    api.list().then(setData, (e) => setError(e.problem || { title: e.message }));
  }, []);

  const items = data?.items || [];
  const counts = useMemo(() => {
    const c = { ALL: items.length };
    for (const it of items) c[it.status] = (c[it.status] || 0) + 1;
    return c;
  }, [items]);

  const visible = items.filter((it) =>
    (filter === 'ALL' || it.status === filter) &&
    (!q || `${it.creditorName} ${it.description} ${it.id}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight text-navy">
          Your QR codes<span className="text-gold">.</span>
        </h1>
        <p className="hidden md:block mt-2 text-ink/55 max-w-xl">
          Each QR references a live payment request in the backend — the amount and the payment
          methods live in the signed payload, never in the image.
        </p>
      </motion.div>

      {/* status filters */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {['ALL', 'ACTIVE', 'PAYMENT_INITIATED', 'PAID', 'CANCELLED'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide border transition-all ${
              filter === s ? 'bg-ink text-paper border-ink' : 'bg-white border-ink/15 text-ink/55 hover:border-ink/40'
            }`}>
            {s === 'ALL' ? 'All' : STATUS_META[s].label}
            <span className="ml-1.5 opacity-60">{counts[s] || 0}</span>
          </button>
        ))}
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, description or id…"
          className="ml-auto w-64 px-4 py-2 rounded-xl border border-ink/15 bg-white text-sm outline-none focus:border-petrol-500 transition-colors"
        />
      </div>

      {error && <div className="mt-6"><ProblemBox problem={error} /></div>}

      {data && visible.length === 0 && (
        <div className="mt-16 text-center">
          <p className="font-display text-2xl text-ink/40">No QR codes here yet.</p>
          <Link to="/new" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 transition-colors">
            Create your first QR
          </Link>
        </div>
      )}

      <motion.div variants={container} initial="hidden" animate="show"
        className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((it) => (
          <motion.div key={it.id} variants={item}>
            <Link to={`/qr/${it.id}`} className="card card-hover block p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold truncate">{it.creditorName}</div>
                  <div className="text-sm text-ink/50 truncate">{it.description || '—'}</div>
                </div>
                <StatusBadge status={it.status} />
              </div>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <div className="font-display text-2xl">
                    {it.editableAmount ? <span className="text-ink/40 text-lg">open amount</span> : formatAmount(it.amount, it.currency)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {it.methods.flatMap((m) => m.networks.map((n) => (
                      <span key={m.currency + n} className="px-2 py-0.5 rounded-md bg-ink/5 text-[10px] font-bold uppercase tracking-wider text-ink/50">
                        {networkLabel(n)} · {m.currency}
                      </span>
                    )))}
                  </div>
                </div>
                <QRImage emv={it.emv} size={72} className="shrink-0 border border-ink/10" />
              </div>
              <div className="mt-3 font-mono text-[10px] text-ink/35 truncate">{it.id} · rev {it.revision}</div>
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <p className="md:hidden mt-8 text-center text-[12px] leading-relaxed text-mute px-4">
        Each QR references a live payment request in the backend — the amount and the payment methods live in the signed payload, never in the image.
      </p>
    </div>
  );
}
