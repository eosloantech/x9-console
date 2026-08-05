import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api, setToken, setEmail } from '../api.js';
import { ProblemBox } from '../components.jsx';

/* Admin-only area: shows every tester email that entered the console.
   Guarded by the console admin password (CONSOLE_TOKEN) — email-authed
   visitors get a password prompt, wrong passwords are rejected server-side. */

export default function AdminView() {
  const [data, setData] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pw, setPw] = useState('');
  const [bad, setBad] = useState(false);
  const [problem, setProblem] = useState(null);

  const load = () => api.adminTesters().then(
    (d) => { setData(d); setNeedsAuth(false); setProblem(null); },
    (e) => {
      if (e.status === 403 || e.status === 401) setNeedsAuth(true);
      else setProblem(e.problem || { title: e.message });
    },
  );
  useEffect(() => { load(); }, []);

  const signIn = async (e) => {
    e.preventDefault();
    setToken(pw.trim()); setEmail('');
    setBad(false);
    try {
      const d = await api.adminTesters();
      setData(d); setNeedsAuth(false);
    } catch { setBad(true); setToken(''); }
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (needsAuth) {
    return (
      <div className="max-w-sm mx-auto">
        <motion.form onSubmit={signIn} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="card p-8 text-center mt-10">
          <img src="/eos-logo.svg" alt="Eos Loan" className="h-7 w-auto mx-auto" />
          <h1 className="font-display text-2xl font-extrabold text-navy mt-4">Admin</h1>
          <p className="text-sm text-ink/50 mt-1">This area is restricted. Enter the admin password.</p>
          <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setBad(false); }}
            placeholder="admin password" autoFocus
            className={`mt-5 w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${bad ? 'border-red-400' : 'border-line focus:border-petrol-500'}`} />
          {bad && <div className="mt-2 text-xs font-semibold text-red-600">Wrong password.</div>}
          <button type="submit" disabled={!pw.trim()}
            className="mt-4 w-full px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-colors">
            Enter
          </button>
        </motion.form>
      </div>
    );
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-navy">Testers</h1>
          <p className="mt-2 text-ink/55">Everyone who entered the console with an email.</p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-xl border border-line text-sm font-bold text-ink/60 hover:border-petrol-300">
          Refresh
        </button>
      </motion.div>

      {problem && <div className="mt-5 max-w-xl"><ProblemBox problem={problem} /></div>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="card px-5 py-3.5 inline-flex items-baseline gap-2">
            <span className="font-display font-extrabold text-3xl text-navy">{data.total}</span>
            <span className="text-sm font-semibold text-mute">tester{data.total === 1 ? '' : 's'} so far</span>
          </div>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.12em] text-mute border-b border-line">
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">First seen</th>
                  <th className="px-5 py-3">Last seen</th>
                  <th className="px-5 py-3 text-right">Requests</th>
                </tr>
              </thead>
              <tbody>
                {data.testers.map((t) => (
                  <tr key={t.email} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 font-bold">{t.email}</td>
                    <td className="px-5 py-3 text-mute">{fmt(t.firstSeen)}</td>
                    <td className="px-5 py-3 text-mute">{fmt(t.lastSeen)}</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold">{t.requests}</td>
                  </tr>
                ))}
                {data.testers.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-mute">No testers yet — share the link!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
