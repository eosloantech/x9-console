// Cliente do BFF. Toda escrita passa pela API oficial via proxy;
// a listagem vem do Mongo (read-only) porque a API não tem endpoint de lista.
export const getToken = () => localStorage.getItem('x9-console-token') || '';
export const setToken = (t) => t ? localStorage.setItem('x9-console-token', t) : localStorage.removeItem('x9-console-token');

async function req(path, init) {
  const token = getToken();
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(path, {
    ...(init || {}),
    headers: { 'Content-Type': 'application/json', ...auth, ...(init?.headers || {}) },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(data?.title || `HTTP ${r.status}`);
    err.status = r.status;
    err.problem = data; // RFC-7807 do backend
    throw err;
  }
  return data;
}

export const api = {
  list: () => req('/bff/qrcodes'),
  get: (id) => req(`/bff/qrcodes/${id}`),
  create: (body) => req('/bff/qrcodes', { method: 'POST', body: JSON.stringify(body) }),
  patch: (id, body) => req(`/bff/qrcodes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateStatus: (id, body) => req(`/bff/qrcodes/${id}/status`, { method: 'PUT', body: JSON.stringify(body) }),
  decode: (emv) => req('/bff/decode', { method: 'POST', body: JSON.stringify({ qrCode: emv }) }),
  presets: () => req('/bff/presets'),
  health: () => req('/bff/health'),
};

// Moedas → casas decimais (minor units). Aberto por design: default 2.
const DECIMALS = { USD: 2, JPY: 0, USDC: 6, BTC: 8, ETH: 18, SOL: 9, XRP: 6 };

export function formatAmount(minor, currency) {
  if (minor == null) return null;
  const d = DECIMALS[currency] ?? 2;
  const v = minor / 10 ** d;
  const digits = Math.min(d, v < 1 && d > 2 ? 6 : 2);
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) })} ${currency}`;
}

export const STATUS_META = {
  ACTIVE:            { label: 'Ativo',     cls: 'bg-petrol-100 text-petrol-800 border-petrol-200' },
  PAYMENT_INITIATED: { label: 'Iniciado',  cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  PAID:              { label: 'Pago',      cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  CANCELLED:         { label: 'Cancelado', cls: 'bg-red-100 text-red-700 border-red-200' },
};

// Máquina de estados (STATE-MACHINE.md): só ofereça transições válidas.
export function allowedActions(status) {
  switch (status) {
    case 'ACTIVE':            return ['PAYMENT_INITIATED', 'PAID', 'CANCELLED'];
    case 'PAYMENT_INITIATED': return ['ACTIVE', 'PAID', 'CANCELLED'];
    default:                  return []; // PAID e CANCELLED são terminais
  }
}
