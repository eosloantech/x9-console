import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api, formatAmount, allowedActions, STATUS_META } from '../api.js';
import { QRImage, downloadQR, StatusBadge, CopyButton, Field, ProblemBox } from '../components.jsx';

const NETWORKS = ['FedNow', 'RTP', 'ACH', 'Bitcoin', 'Ethereum', 'Solana', 'Polygon', 'Base', 'XRP', 'Arc'];

const ACTION_LABELS = {
  PAID: 'Mark as paid',
  CANCELLED: 'Cancel',
  PAYMENT_INITIATED: 'Mark initiated',
  ACTIVE: 'Reactivate',
};
const ACTION_STYLES = {
  PAID: 'bg-petrol-600 text-white hover:bg-petrol-700',
  CANCELLED: 'bg-white border border-red-300 text-red-600 hover:bg-red-50',
  PAYMENT_INITIATED: 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-50',
  ACTIVE: 'bg-white border border-ink/20 text-ink hover:bg-ink/5',
};

export default function DetailView() {
  const { id } = useParams();
  const { state } = useLocation();
  const [qr, setQr] = useState(null);
  const [problem, setProblem] = useState(null);
  const [actionProblem, setActionProblem] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ network: 'FedNow', endToEndId: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api.get(id).then(
    (d) => { setQr(d); setProblem(null); },
    (e) => setProblem(e.problem || { title: e.message }));
  useEffect(() => { load(); }, [id]);

  const doAction = async (status, extra = {}) => {
    setActionProblem(null); setBusy(true);
    try {
      await api.updateStatus(id, { status, ...extra });
      setPayModal(false);
      await load();
    } catch (e) {
      setActionProblem(e.problem || { title: e.message });
    } finally { setBusy(false); }
  };

  if (problem) return (
    <div className="max-w-xl">
      <ProblemBox problem={problem} />
      <Link to="/" className="inline-block mt-4 text-sm font-semibold text-petrol-600">← Back to list</Link>
    </div>
  );
  if (!qr) return <div className="text-ink/40 text-sm">Loading…</div>;

  const emv = qr.qrCode;
  const actions = allowedActions(qr.status);

  return (
    <div>
      {state?.justCreated && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-petrol-200 bg-petrol-50 px-4 py-3 text-sm font-semibold text-petrol-800">
          QR code created — ready to be presented to the payer.
        </motion.div>
      )}

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <Link to="/" className="text-xs font-bold text-ink/40 hover:text-ink transition-colors">← QR Codes</Link>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy mt-1">{qr.creditor?.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={qr.status} size="lg" />
            <span className="text-sm text-ink/45">rev {qr.revision} · created {new Date(qr.createdAt).toLocaleString('en-US')}</span>
          </div>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {actions.map((a) => (
              <button key={a} disabled={busy}
                onClick={() => a === 'PAID' ? setPayModal(true) : doAction(a)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 ${ACTION_STYLES[a]}`}>
                {ACTION_LABELS[a]}
              </button>
            ))}
          </div>
        )}
      </div>

      {actionProblem && <div className="mt-4 max-w-2xl"><ProblemBox problem={actionProblem} /></div>}

      <div className="mt-8 grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* QR */}
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="card p-6 flex flex-col items-center">
          <QRImage emv={emv} size={300} logo />
          <Link to={`/qr/${qr.id}/placard`}
            className="mt-4 w-full text-center px-4 py-2.5 rounded-xl bg-ink text-paper text-sm font-bold hover:bg-ink/85 transition-all active:scale-[0.98]">
            Counter placard →
          </Link>
          <div className="mt-3 flex gap-4">
            <button onClick={() => downloadQR(emv, `qr-${qr.id}`, 'png')} className="text-xs font-bold text-petrol-600 hover:text-petrol-800">Download PNG</button>
            <button onClick={() => downloadQR(emv, `qr-${qr.id}`, 'svg')} className="text-xs font-bold text-petrol-600 hover:text-petrol-800">Download SVG</button>
            <CopyButton text={emv} label="Copy EMV" />
          </div>
          <div className="mt-5 w-full">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40 mb-1.5">EMV string</div>
            <div className="mono-box">{emv}</div>
          </div>
        </motion.div>

        {/* data */}
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-display text-xl font-bold text-navy mb-4">Payment request</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Amount">
                <span className="font-display text-2xl">
                  {qr.bill?.amountDue ? formatAmount(qr.bill.amountDue.amount, qr.bill.amountDue.currency) : 'open amount (editable)'}
                </span>
              </Field>
              <Field label="Description">{qr.bill?.description || '—'}</Field>
              <Field label="Timing">{qr.bill?.paymentTiming}</Field>
              <Field label="Valid until">{new Date(qr.validUntil).toLocaleString('en-US')}</Field>
              {qr.bill?.tip && (
                <Field label="Tip" className="sm:col-span-2">
                  {qr.bill.tip.presets?.map((p) => `${(p / 10).toFixed(1)}%`).join(' · ')}
                  {qr.bill.tip.range && ` (range ${(qr.bill.tip.range.min / 10).toFixed(1)}–${(qr.bill.tip.range.max / 10).toFixed(1)}%)`}
                </Field>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-xl font-bold text-navy mb-4">Payment methods</h2>
            <div className="space-y-3">
              {(qr.paymentMethods || []).map((m, i) => (
                <div key={i} className="rounded-xl border border-ink/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{formatAmount(m.amount, m.currency) ?? m.currency}</span>
                    <span className="text-xs text-ink/40">until {new Date(m.validUntil).toLocaleDateString('en-US')}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {Object.entries(m.networks || {}).map(([net, cfg]) => (
                      <div key={net} className="flex items-center gap-2 text-xs font-mono text-ink/60">
                        <span className="px-2 py-0.5 rounded-md bg-petrol-50 text-petrol-700 font-sans font-bold uppercase tracking-wider text-[10px]">{net}</span>
                        {cfg.routingNumber && <span>ABA {cfg.routingNumber} · account {cfg.accountNumber} · {cfg.protectionType}</span>}
                        {cfg.walletAddress && <span className="truncate">{cfg.walletAddress}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-display text-xl font-bold text-navy mb-4">Identifiers</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="QR Code id"><span className="font-mono text-xs">{qr.id}</span></Field>
              <Field label="Location id"><span className="font-mono text-xs">{qr.location?.id || qr.locationId || '—'}</span></Field>
              <Field label="Notification">{typeof qr.paymentNotification === 'string' ? qr.paymentNotification : qr.paymentNotification?.kind}</Field>
              <Field label="MCC">{qr.creditor?.MCC}</Field>
            </div>
          </div>
        </div>
      </div>

      {/* modal PAID */}
      <AnimatePresence>
        {payModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setPayModal(false)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-2xl">Mark as paid</h3>
              <p className="text-sm text-ink/55 mt-1">The contract requires the network and the transaction's <span className="font-mono text-xs">endToEndId</span>.</p>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">Network</span>
                  <select value={payForm.network} onChange={(e) => setPayForm({ ...payForm, network: e.target.value })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-ink/15 bg-white text-sm outline-none focus:border-petrol-500">
                    {NETWORKS.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/40">endToEndId</span>
                  <input value={payForm.endToEndId} onChange={(e) => setPayForm({ ...payForm, endToEndId: e.target.value })}
                    placeholder="e.g. 0196cb82-afab-46f1-bf8d-fff2f9c8a53e"
                    className="mt-1 w-full px-3 py-2.5 rounded-xl border border-ink/15 font-mono text-xs outline-none focus:border-petrol-500" />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setPayModal(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-ink/50 hover:bg-ink/5">Back</button>
                <button disabled={!payForm.endToEndId || busy} onClick={() => doAction('PAID', payForm)}
                  className="px-5 py-2 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40">
                  {busy ? 'Submitting…' : 'Confirm payment'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
