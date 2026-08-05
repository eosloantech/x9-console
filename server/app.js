// X9 QRCode Console — BFF (app shared between the local server and Vercel functions)
// Writes: always through the official API. Listing: MongoDB read-only (the API has no list endpoint).
import express from 'express';
import { MongoClient, Binary } from 'mongodb';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const API = process.env.X9_API_URL || 'http://localhost:8080';
// tolerates stray spaces and quotes pasted into the env var
const MONGO_URL = (process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/?replicaSet=x9-qrcode&directConnection=true')
  .trim().replace(/^["']|["']$/g, '');
const PRESETS_DIR = process.env.PRESETS_DIR || path.resolve(__dirname, '../presets');
const TOKEN = process.env.CONSOLE_TOKEN || null;

// Lazy + cached connection — required in serverless (reused across invocations).
let clientPromise = null;
function collection() {
  clientPromise ||= new MongoClient(MONGO_URL).connect();
  return clientPromise.then((c) => c.db(process.env.MONGO_DB || 'x9-qrcode').collection('qrcodes'));
}

const EMAIL_GATE = String(process.env.EMAIL_GATE || '').toLowerCase() === 'true';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function testersCollection() {
  clientPromise ||= new MongoClient(MONGO_URL).connect();
  return clientPromise.then((c) => c.db(process.env.MONGO_DB || 'x9-qrcode').collection('console_testers'));
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Access control for /bff:
// - CONSOLE_TOKEN set        → Bearer token grants full (admin) access.
// - EMAIL_GATE=true          → a valid email in the x-console-email header also
//   grants access; every email is logged to Mongo so you can see who tested.
// - Neither set              → open (local development).
app.use('/bff', (req, res, next) => {
  if (!TOKEN && !EMAIL_GATE) return next();

  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (TOKEN && bearer === TOKEN) return next();

  if (EMAIL_GATE) {
    const email = String(req.headers['x-console-email'] || '').trim().toLowerCase();
    if (EMAIL_RE.test(email) && email.length <= 254) {
      req.consoleEmail = email;
      testersCollection()
        .then((c) => c.updateOne(
          { email },
          { $set: { email, lastSeen: new Date() }, $setOnInsert: { firstSeen: new Date() }, $inc: { requests: 1 } },
          { upsert: true },
        ))
        .catch(() => {});
      return next();
    }
  }

  res.status(401).json({
    title: 'Unauthorized',
    detail: EMAIL_GATE ? 'Enter your email to access the console.' : 'Provide the console access token.',
    mode: EMAIL_GATE ? 'email' : 'token',
  });
});

// ---- helpers ---------------------------------------------------------------

// Java legacy UUID (Binary subtype 3): each 8-byte half comes little-endian.
function idFromBinary(bin) {
  const buf = Buffer.from(bin.buffer);
  if (buf.length !== 16) return buf.toString('hex').toUpperCase();
  let bytes = buf;
  if (bin.sub_type === 3) {
    bytes = Buffer.concat([
      Buffer.from(buf.subarray(0, 8)).reverse(),
      Buffer.from(buf.subarray(8, 16)).reverse(),
    ]);
  }
  return bytes.toString('hex').toUpperCase();
}

const asNumber = (v) =>
  typeof v === 'number' ? v
  : v && typeof v.toNumber === 'function' ? v.toNumber()
  : v && typeof v.low === 'number' ? v.low + v.high * 2 ** 32
  : Number(v);

// hex id → legacy Java Binary (subtype 3): reverse each 8-byte half.
function binaryFromId(id) {
  const buf = Buffer.from(id, 'hex');
  const legacy = Buffer.concat([
    Buffer.from(buf.subarray(0, 8)).reverse(),
    Buffer.from(buf.subarray(8, 16)).reverse(),
  ]);
  return new Binary(legacy, 3);
}

// Maps a raw Mongo document to the API's detail shape — used as a read
// fallback when the backend refuses to serve a QR it already stored
// (e.g. legacy notifications whose expectedDate now fails validation).
function docToDetail(d) {
  const camelNet = (cfg) => ({
    ...(cfg.routing_number ? { routingNumber: cfg.routing_number } : {}),
    ...(cfg.account_number ? { accountNumber: cfg.account_number } : {}),
    ...(cfg.protection_type ? { protectionType: cfg.protection_type } : {}),
    ...(cfg.wallet_address ? { walletAddress: cfg.wallet_address } : {}),
  });
  return {
    id: idFromBinary(d._id),
    status: d.status,
    revision: d.revision,
    createdAt: d.created_at,
    revisedAt: d.revised_at,
    sentAt: d.sent_at,
    validUntil: d.valid_until,
    creditor: d.creditor ? {
      name: d.creditor.name, phone: d.creditor.phone, email: d.creditor.email,
      MCC: d.creditor.merchant_category_code, address: d.creditor.address,
    } : undefined,
    bill: d.bill ? {
      description: d.bill.description,
      paymentTiming: d.bill.payment_timing,
      ...(d.bill.amount_due ? { amountDue: { amount: asNumber(d.bill.amount_due.amount), currency: d.bill.amount_due.currency } } : {}),
      ...(d.bill.tip ? { tip: d.bill.tip } : {}),
    } : undefined,
    paymentNotification: d.payment_notification?.kind ?? d.payment_notification,
    paymentMethods: (d.payment_method || []).map((m) => ({
      currency: m.currency,
      amount: asNumber(m.amount),
      validUntil: m.valid_until,
      networks: Object.fromEntries(Object.entries(m.networks || {}).map(([k, v]) => [k, camelNet(v)])),
    })),
    qrCode: d.qrcode_emv,
  };
}

async function proxy(res, apiPath, init = {}) {
  try {
    const r = await fetch(`${API}${apiPath}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const text = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ title: 'Backend unavailable', detail: String(e.message || e) });
  }
}

// ---- routes ----------------------------------------------------------------

app.get('/bff/qrcodes', async (_req, res) => {
  try {
    const docs = await (await collection())
      .find({}, { projection: { history: 0 } })
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();

    const items = docs.map((d) => ({
      id: idFromBinary(d._id),
      status: d.status,
      revision: d.revision,
      createdAt: d.created_at,
      validUntil: d.valid_until,
      creditorName: d.creditor?.name,
      description: d.bill?.description,
      amount: d.bill?.amount_due ? asNumber(d.bill.amount_due.amount) : null,
      currency: d.bill?.amount_due?.currency ?? d.payment_method?.[0]?.currency ?? null,
      editableAmount: !d.bill?.amount_due,
      methods: (d.payment_method || []).map((m) => ({
        currency: m.currency,
        networks: Object.keys(m.networks || {}),
      })),
      emv: d.qrcode_emv,
    }));
    res.json({ items, total: items.length });
  } catch (e) {
    res.status(500).json({ title: 'Failed to read MongoDB', detail: String(e.message || e) });
  }
});

app.get('/bff/qrcodes/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const r = await fetch(`${API}/api/v1/payment-request/${id}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    const text = await r.text();
    if (r.status !== 400) {
      return res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text);
    }
    // 400 on a stored QR (e.g. legacy expectedDate) — serve it from Mongo.
    if (/^[0-9A-F]{32}$/.test(id)) {
      const doc = await (await collection()).findOne({ _id: binaryFromId(id) }, { projection: { history: 0 } });
      if (doc) return res.json(docToDetail(doc));
    }
    res.status(400).type('application/json').send(text);
  } catch (e) {
    res.status(502).json({ title: 'Backend unavailable', detail: String(e.message || e) });
  }
});

app.post('/bff/qrcodes', (req, res) =>
  proxy(res, '/api/v1/payment-request', { method: 'POST', body: JSON.stringify(req.body) }));

app.patch('/bff/qrcodes/:id', (req, res) =>
  proxy(res, `/api/v1/payment-request/${req.params.id}`, { method: 'PATCH', body: JSON.stringify(req.body) }));

app.put('/bff/qrcodes/:id/status', (req, res) =>
  proxy(res, `/api/v1/payment-request/${req.params.id}/status-update`, { method: 'PUT', body: JSON.stringify(req.body) }));

app.post('/bff/decode', (req, res) =>
  proxy(res, '/api/v1/qrcode-emv-decoder', { method: 'POST', body: JSON.stringify(req.body) }));

app.get('/bff/health', (_req, res) => proxy(res, '/actuator/health'));

// ---- PAYER simulator (the Payer-PSP side of X9.150) ------------------------
// Signs via /api/v1/signature/generate (the backend's demo certificate) — a
// real payer would sign with their own X9 certificate.

async function signJws(body, correlationId) {
  const r = await fetch(`${API}/api/v1/signature/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Correlation-Id': correlationId,
      'TTL-Seconds': '300',
    },
    body: JSON.stringify(body),
  });
  const text = (await r.text()).trim();
  if (!r.ok) throw Object.assign(new Error('sign failed'), { status: r.status, body: text });
  return text;
}

const b64urlJson = (seg) =>
  JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

// QR scanned: signs the call and fetches the full payload from /pub/api/v1/loc/{id}
app.post('/bff/payer/fetch', async (req, res) => {
  try {
    const emv = String(req.body?.emv || '').trim();
    const at = emv.indexOf('/loc/');
    if (at < 0) return res.status(400).json({ title: 'Invalid EMV', detail: 'does not contain /loc/{id}' });
    const locId = emv.slice(at + 5, at + 5 + 32);

    const cid = crypto.randomUUID();
    const callJws = await signJws({ qrCodeContent: Buffer.from(emv).toString('base64') }, cid);

    const r = await fetch(`${API}/pub/api/v1/loc/${locId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose' },
      body: callJws,
    });
    const respText = (await r.text()).trim();
    if (!r.ok) {
      let problem; try { problem = JSON.parse(respText); } catch { problem = { title: `HTTP ${r.status}`, detail: respText.slice(0, 300) }; }
      return res.status(r.status).json(problem);
    }
    const [hdr, payload] = respText.split('.');
    res.json({
      locId,
      correlationEchoed: b64urlJson(hdr).correlationId === cid,
      payload: b64urlJson(payload),
    });
  } catch (e) {
    res.status(502).json({ title: 'Failed to fetch payload', detail: String(e.body || e.message || e) });
  }
});

// Confirms the payment: sends the signed PaymentNotificationData, then flips the
// QR to PAID via the management API so the console reflects the settled payment.
// `channel` is the presentation-level method (eos-balance / apple-pay / google-pay /
// card) — settlement always rides the QR's underlying X9 network.
const CHANNEL_PREFIX = {
  'eos-balance': 'EOS', 'apple-pay': 'APAY', 'google-pay': 'GPAY', card: 'CARD',
};

app.post('/bff/payer/pay', async (req, res) => {
  try {
    const { qrcodeId, amount, tipAmount, currency, network, channel, payerInfo } = req.body || {};
    if (!qrcodeId || !amount || !currency || !network) {
      return res.status(400).json({ title: 'Required fields', detail: 'qrcodeId, amount, currency and network' });
    }
    const prefix = CHANNEL_PREFIX[channel] || 'SIM';
    const transactionId = `${prefix}.${network}.${crypto.randomUUID().slice(0, 12)}`;
    const info = [req.consoleEmail, payerInfo].filter(Boolean).join(' · ').slice(0, 140);

    const notification = {
      payment: {
        qrcodeId,
        amount,
        ...(tipAmount ? { tipAmount } : {}),
        currency,
        network,
        transactionId,
      },
      ...(info ? { payer: { info } } : {}),
      // The backend validates expectedDate against "now" on every read of the
      // QR, so a short horizon makes paid QRs unreadable minutes later.
      expectedDate: new Date(Date.now() + 30 * 24 * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
    const jws = await signJws(notification, crypto.randomUUID());
    const r = await fetch(`${API}/pub/api/v1/payment-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/jose' },
      body: jws,
    });
    const text = (await r.text()).trim();
    if (!r.ok) {
      let problem; try { problem = JSON.parse(text); } catch { problem = { title: `HTTP ${r.status}`, detail: text.slice(0, 300) }; }
      return res.status(r.status).json(problem);
    }

    // Settle: mark the QR as PAID (payee-side management call).
    const paid = await fetch(`${API}/api/v1/payment-request/${qrcodeId}/status-update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PAID', network, endToEndId: transactionId }),
    });
    const status = paid.ok ? 'PAID' : 'NOTIFIED';

    res.json({ ok: true, transactionId, status });
  } catch (e) {
    res.status(502).json({ title: 'Failed to notify payment', detail: String(e.body || e.message || e) });
  }
});

// ---- owner-only: delete a QR code -----------------------------------------
// Deletion is reserved for the console owner (specific email) or the admin
// token. The official API has no delete — this removes the stored document.
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'lucas@eosloan.com').toLowerCase();

app.delete('/bff/qrcodes/:id', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const isOwner = req.consoleEmail === OWNER_EMAIL || (TOKEN && bearer === TOKEN);
  if (!isOwner) {
    return res.status(403).json({ title: 'Owner only', detail: 'Only the console owner can delete QR codes.' });
  }
  const id = req.params.id;
  if (!/^[0-9A-F]{32}$/.test(id)) {
    return res.status(400).json({ title: 'Invalid id' });
  }
  try {
    const r = await (await collection()).deleteOne({ _id: binaryFromId(id) });
    if (!r.deletedCount) return res.status(404).json({ title: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ title: 'Failed to delete', detail: String(e.message || e) });
  }
});

// ---- admin: tester registry (console admin token ONLY — email users get 403)
app.get('/bff/admin/testers', async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!TOKEN || bearer !== TOKEN) {
    return res.status(403).json({ title: 'Admins only', detail: 'This area requires the console admin password.' });
  }
  try {
    const list = await (await testersCollection()).find({}).sort({ lastSeen: -1 }).limit(500).toArray();
    res.json({
      total: list.length,
      testers: list.map((t) => ({
        email: t.email, firstSeen: t.firstSeen, lastSeen: t.lastSeen, requests: t.requests || 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ title: 'Failed to read testers', detail: String(e.message || e) });
  }
});

app.get('/bff/presets', async (_req, res) => {
  try {
    const files = (await readdir(PRESETS_DIR)).filter((f) => /^qr-.*-createqr\.json$/.test(f));
    const presets = await Promise.all(files.map(async (f) => ({
      name: f.replace(/^qr-|-createqr\.json$/g, ''),
      body: JSON.parse(await readFile(path.join(PRESETS_DIR, f), 'utf8')),
    })));
    res.json(presets);
  } catch (e) {
    res.status(500).json({ title: 'Failed to read presets', detail: String(e.message || e) });
  }
});

export default app;
