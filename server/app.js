// X9 QRCode Console — BFF (app compartilhado entre server local e Vercel functions)
// Escrita: sempre via API oficial. Listagem: MongoDB read-only (a API não tem lista).
import express from 'express';
import { MongoClient } from 'mongodb';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const API = process.env.X9_API_URL || 'http://localhost:8080';
// tolera espaços e aspas colados por engano na env var
const MONGO_URL = (process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/?replicaSet=x9-qrcode&directConnection=true')
  .trim().replace(/^["']|["']$/g, '');
const PRESETS_DIR = process.env.PRESETS_DIR || path.resolve(__dirname, '../presets');
const TOKEN = process.env.CONSOLE_TOKEN || null;

// Conexão lazy + cacheada — obrigatório em serverless (reusa entre invocações).
let clientPromise = null;
function collection() {
  clientPromise ||= new MongoClient(MONGO_URL).connect();
  return clientPromise.then((c) => c.db(process.env.MONGO_DB || 'x9-qrcode').collection('qrcodes'));
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Auth opcional: definir CONSOLE_TOKEN protege todo o /bff com Bearer token.
app.use('/bff', (req, res, next) => {
  if (!TOKEN) return next();
  const got = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (got === TOKEN) return next();
  res.status(401).json({ title: 'Não autorizado', detail: 'Informe o token de acesso do console.' });
});

// ---- helpers ---------------------------------------------------------------

// UUID legacy do Java (Binary subtype 3): cada metade de 8 bytes vem little-endian.
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

async function proxy(res, apiPath, init = {}) {
  try {
    const r = await fetch(`${API}${apiPath}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    const text = await r.text();
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ title: 'Backend indisponível', detail: String(e.message || e) });
  }
}

// ---- rotas -----------------------------------------------------------------

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
    res.status(500).json({ title: 'Erro ao ler o MongoDB', detail: String(e.message || e) });
  }
});

app.get('/bff/qrcodes/:id', (req, res) =>
  proxy(res, `/api/v1/payment-request/${req.params.id}`));

app.post('/bff/qrcodes', (req, res) =>
  proxy(res, '/api/v1/payment-request', { method: 'POST', body: JSON.stringify(req.body) }));

app.patch('/bff/qrcodes/:id', (req, res) =>
  proxy(res, `/api/v1/payment-request/${req.params.id}`, { method: 'PATCH', body: JSON.stringify(req.body) }));

app.put('/bff/qrcodes/:id/status', (req, res) =>
  proxy(res, `/api/v1/payment-request/${req.params.id}/status-update`, { method: 'PUT', body: JSON.stringify(req.body) }));

app.post('/bff/decode', (req, res) =>
  proxy(res, '/api/v1/qrcode-emv-decoder', { method: 'POST', body: JSON.stringify(req.body) }));

app.get('/bff/health', (_req, res) => proxy(res, '/actuator/health'));

// ---- simulador do PAGADOR (lado Payer-PSP do X9.150) -----------------------
// Assina via /api/v1/signature/generate (certificado demo do backend) — um
// pagador real assinaria com o próprio certificado X9.

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

// Escaneou o QR: assina a chamada e busca o payload completo em /pub/api/v1/loc/{id}
app.post('/bff/payer/fetch', async (req, res) => {
  try {
    const emv = String(req.body?.emv || '').trim();
    const at = emv.indexOf('/loc/');
    if (at < 0) return res.status(400).json({ title: 'EMV inválido', detail: 'não contém /loc/{id}' });
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
    res.status(502).json({ title: 'Falha ao buscar payload', detail: String(e.body || e.message || e) });
  }
});

// Confirma o pagamento: monta a PaymentNotificationData, assina e envia.
// O backend registra a notificação e move o QR para PAYMENT_INITIATED.
app.post('/bff/payer/pay', async (req, res) => {
  try {
    const { qrcodeId, amount, tipAmount, currency, network, payerInfo } = req.body || {};
    if (!qrcodeId || !amount || !currency || !network) {
      return res.status(400).json({ title: 'Campos obrigatórios', detail: 'qrcodeId, amount, currency e network' });
    }
    const notification = {
      payment: {
        qrcodeId,
        amount,
        ...(tipAmount ? { tipAmount } : {}),
        currency,
        network,
        transactionId: `SIM.${network}.${crypto.randomUUID().slice(0, 12)}`,
      },
      ...(payerInfo ? { payer: { info: String(payerInfo).slice(0, 140) } } : {}),
      expectedDate: new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
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
    res.json({ ok: true, transactionId: notification.payment.transactionId });
  } catch (e) {
    res.status(502).json({ title: 'Falha ao notificar pagamento', detail: String(e.body || e.message || e) });
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
    res.status(500).json({ title: 'Erro ao ler presets', detail: String(e.message || e) });
  }
});

export default app;
