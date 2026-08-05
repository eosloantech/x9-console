# X9 Console

Console web para criar, visualizar e gerenciar **QR codes de pagamento ANSI X9.150** servidos por um
backend [matera-inc/x9.150-qrcode](https://github.com/matera-inc/x9.150-qrcode). Interface local de
operação e demonstração — lista, criação por cenários, detalhe com QR renderizado, ações de ciclo de
vida, decoder EMV e plaquinha de balcão imprimível.

> Este projeto é **independente** do backend da Matera: interopera apenas pelas APIs REST publicadas
> (portanto não é obra derivada nos termos da Matera Source License). O backend continua sendo
> executado a partir do repositório/imagem oficial.

## Arquitetura

```
Browser (React + Vite + Tailwind + Framer Motion)
   │  same-origin
   ▼
BFF (Express)
   ├── escrita/detalhe  → proxy para a API oficial (:8080)   ← única fonte de mutação
   ├── listagem         → MongoDB read-only (a API não expõe lista)
   └── presets          → presets/qr-*-createqr.json
```

Por que um BFF: o backend não habilita CORS (o proxy torna tudo same-origin) e não tem endpoint de
listagem (o BFF lê o Mongo, somente leitura). O `_id` no Mongo é UUID binário legacy do Java
(subtype 3) — o BFF converte para o id hex que a API usa.

## Rodando

Pré-requisitos: Node 20+, o backend X9 no ar e o MongoDB dele acessível.

```bash
npm install
npm run build
npm start          # http://localhost:5177
```

### Variáveis de ambiente

| Var | Default | Para quê |
|---|---|---|
| `X9_API_URL` | `http://localhost:8080` | Base da API oficial |
| `MONGO_URL` | `mongodb://127.0.0.1:27017/?replicaSet=x9-qrcode&directConnection=true` | Mongo do backend (leitura) |
| `MONGO_DB` | `x9-qrcode` | Nome do database |
| `CONSOLE_TOKEN` | *(vazio = sem auth)* | Se definido, todo `/bff` exige `Authorization: Bearer <token>`; a UI mostra tela de acesso |
| `PORT` / `HOST` | `5177` / `127.0.0.1` | Bind do servidor local |
| `PRESETS_DIR` | `./presets` | Pasta dos cenários de criação |

## Deploy na Vercel

O repo já está no formato: UI estática (`dist/`) + BFF como function (`api/bff.js`, roteada por
`vercel.json`). O que a Vercel **não** hospeda é o resto do stack — você precisa de:

1. **MongoDB gerenciado** (ex.: Atlas M0) → `MONGO_URL`
2. **Backend Java hospedado** (ex.: Railway/Render/Fly com a imagem `materainc/x9-qrcode`) → `X9_API_URL`
3. **`CONSOLE_TOKEN` definido** — a API do backend é aberta por design; nunca exponha o console
   público sem token (e mantenha o backend fora da internet, acessível só pelo BFF).

Sem esses três, o deploy sobe mas o console não tem o que gerenciar.

## Segurança

- Sem `CONSOLE_TOKEN`, o console é aberto — uso local apenas.
- O token via `Bearer` é proteção de demo/operação interna, não substitui um IdP para produção.
- O backend deve ficar em rede privada; só o BFF fala com ele.

## Licença

MIT — veja [LICENSE](LICENSE). O backend X9.150 da Matera tem licença própria
(Matera Source License v1.0), no repositório oficial.
