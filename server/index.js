// Servidor local: BFF + UI estática buildada.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app, { API } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5177;

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(PORT, process.env.HOST || '127.0.0.1', () =>
  console.log(`X9 Console: http://localhost:${PORT}  (API: ${API})`));
