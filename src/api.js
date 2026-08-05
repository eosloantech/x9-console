// BFF client. All writes go through the official API via the proxy;
// the listing comes from Mongo (read-only) because the API has no list endpoint.
// Access: a single stored credential — an email (tester) or the admin token.
export const getToken = () => localStorage.getItem('x9-console-token') || '';
export const setToken = (t) => t ? localStorage.setItem('x9-console-token', t) : localStorage.removeItem('x9-console-token');
export const getEmail = () => localStorage.getItem('x9-console-email') || '';
export const setEmail = (e) => e ? localStorage.setItem('x9-console-email', e) : localStorage.removeItem('x9-console-email');

async function req(path, init) {
  const token = getToken();
  const email = getEmail();
  const auth = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(email ? { 'x-console-email': email } : {}),
  };
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
    err.problem = data; // RFC-7807 from the backend
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
  payerFetch: (emv) => req('/bff/payer/fetch', { method: 'POST', body: JSON.stringify({ emv }) }),
  payerPay: (body) => req('/bff/payer/pay', { method: 'POST', body: JSON.stringify(body) }),
  adminTesters: () => req('/bff/admin/testers'),
  remove: (id) => req(`/bff/qrcodes/${id}`, { method: 'DELETE' }),
};

// Deletion is owner-only: the owner's email, or the admin token holder.
export const OWNER_EMAIL = 'lucas@eosloan.com';
export const isOwner = () => getEmail() === OWNER_EMAIL || !!getToken();

// Network display labels — we brand the XRP Ledger rail as Ripple (we accept
// RLUSD, not XRP the asset).
export const networkLabel = (n) => ({ XRP: 'Ripple' }[n] || n);

// Currency → decimal places (minor units). Open by design: defaults to 2.
const DECIMALS = { USD: 2, JPY: 0, USDC: 6, RLUSD: 6, BTC: 8, ETH: 18, SOL: 9, XRP: 6 };

export function formatAmount(minor, currency) {
  if (minor == null) return null;
  const d = DECIMALS[currency] ?? 2;
  const v = minor / 10 ** d;
  const digits = Math.min(d, v < 1 && d > 2 ? 6 : 2);
  return `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) })} ${currency}`;
}

// Status colors on the Eos palette: green = positive, gold = highlight,
// blue = complete, red #E5573B = alert.
export const STATUS_META = {
  ACTIVE:            { label: 'Active',    cls: 'bg-[#EAF6DC] text-[#4C7A1F] border-[#C9E7A4]' },
  PAYMENT_INITIATED: { label: 'Initiated', cls: 'bg-[#FFF4D1] text-[#8A6A00] border-[#FBE39B]' },
  PAID:              { label: 'Paid',      cls: 'bg-[#D6E7FA] text-[#2F5496] border-[#B7D4F5]' },
  CANCELLED:         { label: 'Cancelled', cls: 'bg-[#FBE5E0] text-[#B23E27] border-[#F3C4BA]' },
};

// State machine (STATE-MACHINE.md): only offer valid transitions.
export function allowedActions(status) {
  switch (status) {
    case 'ACTIVE':            return ['PAYMENT_INITIATED', 'PAID', 'CANCELLED'];
    case 'PAYMENT_INITIATED': return ['ACTIVE', 'PAID', 'CANCELLED'];
    default:                  return []; // PAID and CANCELLED are terminal
  }
}
