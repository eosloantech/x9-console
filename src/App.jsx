import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { api, setToken, setEmail, getEmail, getToken } from './api.js';
import ListView from './views/ListView.jsx';
import CreateView from './views/CreateView.jsx';
import DetailView from './views/DetailView.jsx';
import DecoderView from './views/DecoderView.jsx';
import PlacardView from './views/PlacardView.jsx';
import PayerView from './views/PayerView.jsx';
import AdminView from './views/AdminView.jsx';

function HealthDot() {
  const [up, setUp] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = () => api.health().then(
      (h) => alive && setUp(h?.status === 'UP'),
      () => alive && setUp(false),
    );
    check();
    const t = setInterval(check, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-ink/50">
      <span className={`w-2 h-2 rounded-full ${up == null ? 'bg-ink/20' : up ? 'bg-petrol-500' : 'bg-red-500'} ${up ? 'animate-pulse' : ''}`} />
      <span className="hidden md:inline">{up == null ? 'checking…' : up ? 'API online' : 'API offline'}</span>
    </span>
  );
}

function Identity() {
  const who = getEmail() || (getToken() ? 'admin' : '');
  if (!who) return null;
  const signOut = () => { setToken(''); setEmail(''); location.href = '/'; };
  return (
    <span className="hidden sm:flex items-center gap-2 text-xs text-mute max-w-[180px]">
      <span className="truncate" title={who}>{who}</span>
      <button onClick={signOut} className="font-bold text-petrol-600 hover:text-petrol-800 shrink-0">Sign out</button>
    </span>
  );
}

const navCls = ({ isActive }) =>
  `px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
    isActive ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink hover:bg-ink/5'
  }`;

/* app-style bottom bar — mobile only. Pay is a raised fintech-style FAB dead
   center; the regular tabs sit two on the left, one on the right. */
const TABS_LEFT = [
  { to: '/', end: true, label: 'QR Codes', d: 'M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 4h2v2h-2v-2zm-4 0h2v2h-2v-2zm4-4h2v2h-2v-2z' },
  { to: '/new', label: 'Create', d: 'M12 5v14M5 12h14', stroke: true },
];
const TABS_RIGHT = [
  { to: '/decoder', label: 'Decoder', d: 'M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3M7 12h10', stroke: true },
];

function Tab({ t }) {
  return (
    <NavLink to={t.to} end={t.end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
          isActive ? 'text-petrol-600' : 'text-mute'
        }`}>
      <svg viewBox="0 0 24 24" className="w-6 h-6"
        fill={t.stroke ? 'none' : 'currentColor'}
        stroke={t.stroke ? 'currentColor' : 'none'} strokeWidth={t.stroke ? 2 : 0} strokeLinecap="round">
        <path d={t.d} />
      </svg>
      {t.label}
    </NavLink>
  );
}

function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-line"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch">
        <div className="flex-1 grid grid-cols-2">
          {TABS_LEFT.map((t) => <Tab key={t.to} t={t} />)}
        </div>

        {/* center FAB — Pay */}
        <div className="w-20 relative">
          <NavLink to="/pay" aria-label="Pay"
            className="absolute left-1/2 -translate-x-1/2 -top-6 flex flex-col items-center">
            {({ isActive }) => (
              <>
                <span className={`w-14 h-14 rounded-full eos-band flex items-center justify-center text-white ring-4 ring-white shadow-lg shadow-navy/30 transition-transform active:scale-95 ${isActive ? 'ring-petrol-100' : ''}`}>
                  {/* contactless / pay waves over a card */}
                  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 9.5C5.6 11 6.5 13 6.5 15" opacity="0.55" />
                    <path d="M8 7c2.4 2.2 3.8 5 3.8 8" opacity="0.8" />
                    <path d="M12.5 4.5C15.7 7.4 17.5 11 17.5 15" />
                  </svg>
                </span>
                <span className={`mt-1 text-[10px] font-extrabold tracking-wide ${isActive ? 'text-petrol-600' : 'text-navy'}`}>Pay</span>
              </>
            )}
          </NavLink>
        </div>

        <div className="flex-1 grid grid-cols-1">
          {TABS_RIGHT.map((t) => <Tab key={t.to} t={t} />)}
        </div>
      </div>
    </nav>
  );
}

function AccessGate({ mode, onOk }) {
  // mode 'email': testers sign in with just their email (it doubles as the
  // credential and is logged server-side). Anything without an '@' is treated
  // as the admin token, so the same field serves both.
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  const emailMode = mode === 'email';

  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (v.includes('@')) { setEmail(v.toLowerCase()); setToken(''); }
    else { setToken(v); setEmail(''); }
    try { await api.health(); onOk(); }
    catch (err) { setBad(true); if (err.status === 401) { setToken(''); setEmail(''); } }
  };

  return (
    <div className="mesh-bg min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm text-center">
        <img src="/eos-logo.svg" alt="Eos Loan" className="h-8 w-auto mx-auto" />
        <h1 className="font-display text-2xl font-extrabold text-navy mt-4">X9 Console</h1>
        <p className="text-sm text-ink/50 mt-1">
          {emailMode
            ? 'Enter your email to try the payment QR codes. No password needed.'
            : 'This console is protected. Enter your access token.'}
        </p>
        <input
          type={emailMode ? 'email' : 'password'}
          value={value} onChange={(e) => { setValue(e.target.value); setBad(false); }}
          placeholder={emailMode ? 'you@company.com' : 'access token'} autoFocus
          className={`mt-5 w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors ${emailMode ? '' : 'font-mono'} ${bad ? 'border-red-400' : 'border-ink/15 focus:border-petrol-500'}`}
        />
        {bad && <div className="mt-2 text-xs font-semibold text-red-600">
          {emailMode ? 'That doesn’t look like a valid email — please try again.' : 'Invalid token — please try again.'}
        </div>}
        <button type="submit" disabled={!value.trim()}
          className="mt-4 w-full px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-colors">
          {emailMode ? 'Start testing' : 'Sign in'}
        </button>
        {emailMode && (
          <p className="mt-3 text-[11px] text-ink/35">
            Your email identifies your test session — that&apos;s all we use it for.
          </p>
        )}
      </form>
    </div>
  );
}

export default function App() {
  // 'checking' | 'locked' | 'open' — the gate only shows if the BFF requires access (401).
  const [gate, setGate] = useState('checking');
  const [gateMode, setGateMode] = useState('token');
  useEffect(() => {
    api.health().then(
      () => setGate('open'),
      (e) => {
        if (e.status === 401) {
          setGateMode(e.problem?.mode || 'token');
          setGate('locked');
        } else setGate('open');
      },
    );
  }, []);
  if (gate === 'checking') return <div className="mesh-bg min-h-screen" />;
  if (gate === 'locked') return <AccessGate mode={gateMode} onOk={() => setGate('open')} />;

  return (
    <div className="mesh-bg min-h-screen">
      {/* noise overlay */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none opacity-[0.035] mix-blend-multiply" aria-hidden="true">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      <header className="sticky top-0 z-20 backdrop-blur-md bg-paper/80 border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-5 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img src="/eos-logo.svg" alt="Eos Loan" className="h-7 w-auto" />
            <span className="hidden md:block w-px h-7 bg-line" aria-hidden="true" />
            <div className="hidden md:block leading-none">
              <span className="font-display text-lg font-extrabold text-navy">X9 Console</span>
              <span className="block text-[10px] font-sans font-bold uppercase tracking-[0.18em] text-mute">Payment QR Codes · X9.150</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" end className={navCls}>QR Codes</NavLink>
            <NavLink to="/new" className={navCls}>Create</NavLink>
            <NavLink to="/decoder" className={navCls}>Decoder</NavLink>
            <NavLink to="/pay" className={navCls}>Pay</NavLink>
            {getToken() && <NavLink to="/admin" className={navCls}>Admin</NavLink>}
          </nav>
          <span className="flex items-center gap-4">
            <Identity />
            <HealthDot />
          </span>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-28 md:pb-10">
        <Routes>
          <Route path="/" element={<ListView />} />
          <Route path="/new" element={<CreateView />} />
          <Route path="/qr/:id" element={<DetailView />} />
          <Route path="/qr/:id/placard" element={<PlacardView />} />
          <Route path="/decoder" element={<DecoderView />} />
          <Route path="/pay" element={<PayerView />} />
          <Route path="/pay/:id" element={<PayerView />} />
          <Route path="/admin" element={<AdminView />} />
        </Routes>
      </main>

      <footer className="relative z-10 max-w-6xl mx-auto px-6 pb-28 md:pb-8 text-center md:text-left">
        <div className="md:hidden flex items-center justify-center gap-2 mb-2">
          <img src="/eos-logo.svg" alt="" className="h-4 w-auto opacity-70" />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-mute">X9 Console · X9.150</span>
        </div>
        <div className="text-[11px] md:text-xs text-mute/80">
          Eos Loan · NMLS #2744537 · Confidential — X9.150 Console · writes go through the official API · listing read from MongoDB
        </div>
      </footer>

      <BottomNav />
    </div>
  );
}
