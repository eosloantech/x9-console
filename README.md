# X9 Console

Web console to create, view and manage **ANSI X9.150 payment QR codes** served by a
[matera-inc/x9.150-qrcode](https://github.com/matera-inc/x9.150-qrcode) backend. A local
operations and demo interface — listing, scenario-based creation, detail view with rendered QR,
lifecycle actions, EMV decoder and a printable counter placard.

> This project is **independent** from Matera's backend: it interoperates only through the
> published REST APIs (so it is not a derivative work under the Matera Source License terms).
> The backend keeps running from the official repository/image.

## Architecture

```
Browser (React + Vite + Tailwind + Framer Motion)
   │  same-origin
   ▼
BFF (Express)
   ├── writes/detail  → proxy to the official API (:8080)   ← single source of mutation
   ├── listing        → MongoDB read-only (the API exposes no list endpoint)
   └── presets        → presets/qr-*-createqr.json
```

Why a BFF: the backend does not enable CORS (the proxy makes everything same-origin) and has no
list endpoint (the BFF reads Mongo, read-only). The Mongo `_id` is a Java legacy binary UUID
(subtype 3) — the BFF converts it to the hex id the API uses.

## Running

Prerequisites: Node 20+, the X9 backend up, and its MongoDB reachable.

```bash
npm install
npm run build
npm start          # http://localhost:5177
```

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `X9_API_URL` | `http://localhost:8080` | Official API base URL |
| `MONGO_URL` | `mongodb://127.0.0.1:27017/?replicaSet=x9-qrcode&directConnection=true` | Backend's Mongo (read-only) |
| `MONGO_DB` | `x9-qrcode` | Database name |
| `CONSOLE_TOKEN` | *(empty = no auth)* | If set, every `/bff` call requires `Authorization: Bearer <token>`; the UI shows a sign-in screen |
| `PORT` / `HOST` | `5177` / `127.0.0.1` | Local server bind |
| `PRESETS_DIR` | `./presets` | Folder with the creation scenarios |

## Deploying to Vercel

The repo is already in the right shape: static UI (`dist/`) + BFF as a function (`api/bff.js`,
routed by `vercel.json`). What Vercel does **not** host is the rest of the stack — you need:

1. **Managed MongoDB** (e.g. Atlas M0) → `MONGO_URL`
2. **Hosted Java backend** (e.g. Railway/Render/Fly with the `materainc/x9-qrcode` image) → `X9_API_URL`
3. **`CONSOLE_TOKEN` set** — the backend API is open by design; never expose the console
   publicly without a token (and keep the backend off the internet, reachable only by the BFF).

Without those three, the deploy goes up but the console has nothing to manage.

## Security

- Without `CONSOLE_TOKEN`, the console is open — local use only.
- The `Bearer` token is demo/internal-ops protection, not a substitute for an IdP in production.
- The backend should live on a private network; only the BFF talks to it.

## License

MIT — see [LICENSE](LICENSE). Matera's X9.150 backend has its own license
(Matera Source License v1.0), in the official repository.
