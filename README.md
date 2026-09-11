# TMN Decorating & Maintenance — Complete Website Source

Full source code for the TMN Decorating & Maintenance website: a luxury animated
marketing site with a client portal, admin console, invoicing, payments, an AI
assistant and a client-side colour visualiser. This repository contains everything
needed to build, deploy and run the site independently of the Emergent platform.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React (Create React App + CRACO), Tailwind CSS, framer-motion, react-router, recharts, jsPDF, shadcn/ui components |
| Backend    | Python FastAPI, JWT auth (httpOnly cookies, bcrypt), Motor (async MongoDB) |
| Database   | MongoDB |
| Payments   | Stripe Checkout + webhook |
| AI chat    | Qwen2.5-0.5B-Instruct running LOCALLY on the server (PyTorch, no external AI API) |
| Email      | Resend (self-hosted) with an Emergent-proxy fallback — see "Emergent dependencies" |

## Project structure

```
/
├── frontend/               React app (all pages, components, animations, assets)
│   ├── src/pages/          Site, Login, Account (client portal), Admin, Visualiser,
│   │                       Favourites, ReviewsPage
│   ├── src/components/     Hero, Services, Work, Reviews, ColourStudio, AiChat,
│   │                       HomeMusic, HoloBackground, FloatingWhatsApp, admin/*
│   ├── src/lib/colour.js   Colour visualiser engine (tap-select + LAB recolour, client-side)
│   ├── src/utils/          invoicePdf.js (A4 PDF generation)
│   ├── public/             Videos (holo background), TMN logos, favicon, fonts, images
│   ├── Dockerfile          Multi-stage build → nginx static hosting
│   └── nginx.conf          SPA routing + /api reverse proxy
├── backend/
│   ├── server.py           FastAPI app: auth, chat, invoices, Stripe, email, stats, favourites
│   ├── ai_local.py         Local AI chat interface (streams from the worker process)
│   ├── ai_worker.py        Short-lived PyTorch worker (Qwen2.5-0.5B) — loads → answers → exits
│   ├── tests/              Pytest suite
│   ├── Dockerfile          Python 3.11 + CPU PyTorch image
│   └── requirements.txt    Pinned Python dependencies
├── scripts/                Node.js regression harnesses for the colour algorithms
├── database/
│   ├── mongodump/          Binary MongoDB dump (restore with mongorestore)
│   ├── json/               Readable per-collection JSON exports
│   └── RESTORE.md          How to restore the data
├── docs/PRD.md             Full product documentation & change history
└── docker-compose.yml      One-command production stack (Mongo + API + web server)
```

## What's included (feature inventory)

- Animated marketing site: holo-ripple video background, scroll animations, marquee,
  services accordion, work gallery, reviews section, contact rows — desktop + mobile
- Floating WhatsApp button + WhatsApp quote links (wa.me deep links — no third-party API)
- Accounts: customer registration/login, admin login (bcrypt + JWT httpOnly cookies,
  refresh tokens, brute-force lockout)
- Client portal: chat thread (with images), saved colour looks, jobs, invoices
- Admin console: inbox with unread badges, client records (search/archive/pin/delete),
  jobs, private notes, stats dashboard with 14-day charts, colour favourites leaderboard
- Invoices: draft/sent/paid, auto numbering (TMN-0001…), professional A4 PDF (jsPDF),
  send-to-client portal message, email with PDF attachment + one-click download link,
  Stripe payment
- Colour visualiser (client-side image processing — no AI service): tap-to-select
  surfaces, brush/eraser, colour wheel + hex input, brand palettes, sheen preview,
  saved looks
- AI assistant: local Qwen2.5-0.5B chat (streamed), session history in MongoDB
- Public favourites leaderboard, view tracking/statistics
- SEO: metadata, LocalBusiness JSON-LD with aggregate rating, favicon

Honesty notes: the "Reviews" content is static paraphrased text (no live Google
Reviews API integration); there is no QR-code feature and no Facebook integration —
the only social/contact integrations are WhatsApp deep links and mailto/tel links.

## Requirements

- Any VPS/cloud server: 2 vCPU / 4 GB RAM minimum, **8 GB+ RAM recommended** if you
  want the AI assistant (the local PyTorch model peaks around 5 GB). Without the AI
  chat the rest of the site runs comfortably on 2 GB.
- Node.js 20 + Yarn (frontend build), Python 3.11 (backend)
- MongoDB 6/7 (self-hosted or Atlas free tier)
- Docker + Docker Compose (optional, for the one-command deployment)

## 1. Local development

```bash
# 1. MongoDB running locally (default port 27017)
# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit .env (see below)
uvicorn server:app --port 8001 --reload

# 3. Frontend (new terminal)
cd frontend
yarn install
cp .env.example .env          # point REACT_APP_BACKEND_URL at http://localhost:8001
yarn start                    # dev server on http://localhost:3000
```

The admin account is auto-seeded on backend startup from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` in `backend/.env` (only if no admin exists yet).

## 2. Production build (manual)

```bash
cd frontend
REACT_APP_BACKEND_URL= yarn build     # empty = API calls go to same origin (recommended)
# deploy backend: uvicorn server:app --host 0.0.0.0 --port 8001 (use systemd/supervisor)
# serve frontend/build with nginx/caddy and proxy /api → http://127.0.0.1:8001
```

`REACT_APP_BACKEND_URL` is baked in at BUILD time. Empty string = same-origin `/api`
calls (use this when the web server proxies `/api` to the backend — the included
`frontend/nginx.conf` does exactly that). Set it to a full URL only if the API is
hosted on a different domain, and then make sure that origin is allowed by the
backend's CORS (`FRONTEND_URL`).

## 3. Production (one command, Docker — single server)

```bash
cp backend/.env.example backend/.env    # fill in real values first
docker compose up -d --build
```

Brings up MongoDB (persistent volume), the FastAPI backend and an nginx web server on
port 80 that serves the built site and proxies `/api` to the backend. Put HTTPS in
front with your own reverse proxy or a Cloudflare tunnel.

## 4. Deploying through Cloudflare

The frontend is a static build → **Cloudflare Pages is a perfect home for it**.
The backend CANNOT run on Cloudflare (FastAPI + MongoDB + the local PyTorch model
need a real server — Workers/Pages Functions can't run them), so the recommended
architecture is:

```
Cloudflare DNS
├── your-domain.co.uk        → Cloudflare Pages  (frontend static build)
└── api.your-domain.co.uk    → YOUR VPS          (FastAPI backend + MongoDB)
```

**Frontend on Cloudflare Pages:**
1. Push this repo to GitHub (in Emergent: chat input → Save → "Save to GitHub").
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: Root directory `frontend`, build command `yarn build`, output dir `build`.
4. Environment variables (Production): `REACT_APP_BACKEND_URL = https://api.your-domain.co.uk`.
5. Add your custom domain in Pages → Custom domains.

**Backend on your own VPS (Hetzner/DigitalOcean ~£5-10/mo; 8 GB RAM if you want the AI
assistant, 2 GB without):**
1. Clone the repo, `cp backend/.env.example backend/.env`, fill it in (below).
2. `docker compose up -d backend mongo` (skip the compose frontend — Pages hosts it),
   or run `uvicorn server:app --host 0.0.0.0 --port 8001` under systemd.
3. Cloudflare DNS: `api.your-domain.co.uk` → A record to the VPS IP (orange-cloud
   proxied for CDN/SSL). In Cloudflare SSL/TLS settings use "Full" mode and run the
   origin behind HTTPS (Caddy makes this a one-liner) — email links must be https.
4. MongoDB: either the compose `mongo` service (with auth enabled for a public
   server) or a free MongoDB Atlas cluster — set `MONGO_URL` accordingly.
5. Stripe dashboard: add webhook endpoint `https://api.your-domain.co.uk/api/stripe/webhook`
   (events: `checkout.session.completed`) and put its signing secret in `STRIPE_WEBHOOK_SECRET`.

Everything (Pages + VPS + Atlas + Resend + Stripe) runs entirely outside Emergent.

## 5. Environment variables

### backend/.env (create from backend/.env.example)

| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name (the included dump uses `test_database`) |
| `JWT_SECRET` | Random secret for signing auth tokens — generate: `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account auto-seeded on first boot |
| `FRONTEND_URL` | Public origin of the site (CORS + invoice-email download links) |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_ACCOUNT_ID` | Your Stripe account keys (the live deployment currently uses sandbox/test keys) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) from your Stripe dashboard |
| `STRIPE_MODE` | `test` or `live` |
| `RESEND_API_KEY` | **Self-hosted sending** — set it and ALL transactional email flows through your own Resend account (resend.com, free tier) |
| `SENDER_EMAIL` | From-address (must be a verified domain in Resend) |
| `EMAIL_FROM_NAME` / `EMAIL_REPLY_TO` | Display name / reply-to for outgoing email |
| `EMERGENT_EMAIL_KEY` | Emergent-proxy key — used ONLY when `RESEND_API_KEY` is empty; leave blank on your own server |
| `EMERGENT_LLM_KEY` / `GEMINI_API_KEY` | Legacy leftovers — **unused by the current code**, keep blank |
| `LOGO_URL` | Absolute URL to the white logo used in email letterheads |
| `CORS_ORIGINS` | Present in the current deployment env but not read by the code (informational) |

### frontend/.env (create from frontend/.env.example)

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Baked in at build time. Empty = same-origin `/api` (single-server hosting). Full URL = split hosting (Cloudflare Pages + API VPS). |

## 6. External services & Emergent dependencies — the honest list

| Service | Used for | Self-host status |
|---|---|---|
| Stripe | Invoice payments (Checkout + webhook) | Works with YOUR OWN Stripe account keys — replace the sandbox keys in `backend/.env`. Webhook: see step 4 above. |
| Resend (all transactional email) | Invoice emails to clients (PDF attachment + download button) + owner notifications | **Fully self-hosted once `RESEND_API_KEY` is set** — the backend sends directly through your own Resend account (create a free account at resend.com, verify your domain). No Emergent dependency. |
| Emergent managed email proxy | Fallback path used ONLY while `RESEND_API_KEY` is empty (i.e. only inside the Emergent workspace today) | Not needed on your own server — leave the key blank. |
| MongoDB | All data | Fully self-hosted (local/Atlas). |
| AI (chat assistant) | Customer chat | **Fully local** (Qwen2.5-0.5B via PyTorch in `ai_worker.py`). No API key, no external AI service, works offline. |
| Colour visualiser | Room recolouring | **Fully client-side** canvas image processing (`frontend/src/lib/colour.js`). No server, no AI service. |

The AI assistant is NOT an Emergent dependency; nothing in the app calls an external
AI API. `EMERGENT_LLM_KEY` / `GEMINI_API_KEY` in the env are unused legacy values.

## 7. Database backup / restore

The full current database is included in `database/`:

- `database/mongodump/` — binary dump, restore with:
  `mongorestore --uri "mongodb://localhost:27017" --drop database/mongodump`
- `database/json/` — one readable JSON file per collection
- `database/RESTORE.md` — step-by-step instructions

The `users` collection contains bcrypt password HASHES (never plaintext) — existing
logins keep working after a restore. The data includes real client names/emails, so
treat it as personal data (GDPR).

## 8. Verifying the build

```bash
cd backend && pytest tests/          # backend test suite
cd frontend && yarn build            # must build without errors
python scripts/test_email_selfhost.py         # email paths (needs the backend venv)
```

## Support notes

- Invoice PDFs are generated in the browser (jsPDF) — no server-side PDF dependency.
- The holo background videos live in `frontend/public/videos/` (VP9 + H.264).
- `docs/PRD.md` documents every feature decision and fix in chronological order.
