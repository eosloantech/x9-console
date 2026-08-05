import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import ListView from './views/ListView.jsx';
import CreateView from './views/CreateView.jsx';
import DetailView from './views/DetailView.jsx';
import DecoderView from './views/DecoderView.jsx';
import PlacardView from './views/PlacardView.jsx';

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
      {up == null ? 'verificando…' : up ? 'API no ar' : 'API fora do ar'}
    </span>
  );
}

const navCls = ({ isActive }) =>
  `px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
    isActive ? 'bg-ink text-paper' : 'text-ink/60 hover:text-ink hover:bg-ink/5'
  }`;

function TokenGate({ onOk }) {
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setToken(value.trim());
    try { await api.health(); onOk(); }
    catch (err) { setBad(true); if (err.status === 401) setToken(''); }
  };
  return (
    <div className="mesh-bg min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm text-center">
        <img src="/eos-logo.svg" alt="Eos Loan" className="h-8 w-auto mx-auto" />
        <h1 className="font-display text-2xl font-extrabold text-navy mt-4">X9 Console</h1>
        <p className="text-sm text-ink/50 mt-1">Este console está protegido. Informe o token de acesso.</p>
        <input
          type="password" value={value} onChange={(e) => { setValue(e.target.value); setBad(false); }}
          placeholder="token de acesso" autoFocus
          className={`mt-5 w-full px-4 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${bad ? 'border-red-400' : 'border-ink/15 focus:border-petrol-500'}`}
        />
        {bad && <div className="mt-2 text-xs font-semibold text-red-600">Token inválido — tente novamente.</div>}
        <button type="submit" disabled={!value.trim()}
          className="mt-4 w-full px-5 py-2.5 rounded-xl bg-petrol-600 text-white text-sm font-bold hover:bg-petrol-700 disabled:opacity-40 transition-colors">
          Entrar
        </button>
      </form>
    </div>
  );
}

export default function App() {
  // 'checking' | 'locked' | 'open' — o gate só aparece se o BFF exigir token (401).
  const [gate, setGate] = useState('checking');
  useEffect(() => {
    api.health().then(
      () => setGate('open'),
      (e) => setGate(e.status === 401 ? 'locked' : 'open'),
    );
  }, []);
  if (gate === 'checking') return <div className="mesh-bg min-h-screen" />;
  if (gate === 'locked') return <TokenGate onOk={() => setGate('open')} />;

  return (
    <div className="mesh-bg min-h-screen">
      {/* noise overlay */}
      <svg className="fixed inset-0 w-full h-full pointer-events-none opacity-[0.035] mix-blend-multiply" aria-hidden="true">
        <filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      <header className="sticky top-0 z-20 backdrop-blur-md bg-paper/80 border-b border-ink/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img src="/eos-logo.svg" alt="Eos Loan" className="h-7 w-auto" />
            <span className="w-px h-7 bg-line" aria-hidden="true" />
            <div className="leading-none">
              <span className="font-display text-lg font-extrabold text-navy">X9 Console</span>
              <span className="block text-[10px] font-sans font-bold uppercase tracking-[0.18em] text-mute">Payment QR Codes · X9.150</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navCls}>QR Codes</NavLink>
            <NavLink to="/new" className={navCls}>Criar</NavLink>
            <NavLink to="/decoder" className={navCls}>Decoder</NavLink>
          </nav>
          <HealthDot />
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        <Routes>
          <Route path="/" element={<ListView />} />
          <Route path="/new" element={<CreateView />} />
          <Route path="/qr/:id" element={<DetailView />} />
          <Route path="/qr/:id/plaquinha" element={<PlacardView />} />
          <Route path="/decoder" element={<DecoderView />} />
        </Routes>
      </main>

      <footer className="relative z-10 max-w-6xl mx-auto px-6 pb-8 text-xs text-mute/80">
        Eos Loan · NMLS #2744537 · Confidential — Console X9.150 · escrita via API oficial (:8080) · listagem lida do MongoDB
      </footer>
    </div>
  );
}
