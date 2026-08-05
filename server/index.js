// Local server: BFF + built static UI.
// HTTP on :5177; if certs/ exists (self-signed), HTTPS on :5178 — required
// for the camera to work on phones over the local network (getUserMedia needs HTTPS).
import express from 'express';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app, { API } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5177;
const HTTPS_PORT = process.env.HTTPS_PORT || 5178;
const HOST = process.env.HOST || '127.0.0.1';

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, HOST, () =>
  console.log(`X9 Console: http://localhost:${PORT}  (API: ${API})`));

const certDir = path.resolve(__dirname, '../certs');
if (existsSync(path.join(certDir, 'cert.pem'))) {
  https.createServer({
    key: readFileSync(path.join(certDir, 'key.pem')),
    cert: readFileSync(path.join(certDir, 'cert.pem')),
  }, app).listen(HTTPS_PORT, HOST, () =>
    console.log(`X9 Console (https, phone/camera): https://<lan-ip>:${HTTPS_PORT}`));
}
