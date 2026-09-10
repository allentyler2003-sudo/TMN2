# TMN Decorating & Maintenance — Complete Website Source

Full source code for the TMN Decorating & Maintenance website: a luxury animated marketing
site with a client portal, admin console, invoicing, payments, an AI assistant and a
client-side colour visualiser. This archive contains everything needed to run the site
away from the Emergent platform.

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React (Create React App + CRACO), Tailwind CSS, framer-motion, react-router, recharts, jsPDF, shadcn/ui components |
| Backend    | Python FastAPI, JWT auth (httpOnly cookies, bcrypt), Motor (async MongoDB) |
| Database   | MongoDB |
| Payments   | Stripe Checkout + webhook |
| AI chat    | Qwen2.5-0.5B-Instruct running LOCALLY on the server (PyTorch, no external AI API) |
| Email      | Emergent managed email proxy (transactional) + Resend SDK (owner notifications) — see "Emergent dependencies" |

## Project structure

```
tmn-website/
├── frontend/               React app (all pages, components, animations, assets)
│   ├── src/pages/          Site, Login, Account (client portal), Admin, Visualiser,
│   │                       Favourites, ReviewsPage
│   ├── src/components/     Hero, Services, Work, Reviews, ColourStudio, AiChat,
│   │                       HomeMusic, HoloBackground, FloatingWhatsApp, admin/*
│   ├── src/lib/colour.js   Colour visualiser engine (tap-select + LAB recolour, client-side)
│   ├── src/utils/          invoicePdf.js (A4 PDF generation)
│   └── public/             Videos (holo background), TMN logos, favicon, fonts, images
├── backend/
│   ├── server.py           FastAPI app: auth, chat, invoices, Stripe, email, stats, favourites
│   ├── ai_local.py         Local AI chat interface (streams from the worker process)
│   ├── ai_worker.py        Short-lived PyTorch worker (Qwen2.5-0.5B) — loads → answers → exits
│   ├── tests/              Pytest suite
│   └── requirements.txt    Pinned Python dependencies (includes CPU PyTorch)
├── scripts/                Node.js regression harnesses for the colour algorithms
├── database/
│   ├── mongodump/          Binary MongoDB dump (restore with mongorestore)
│   ├── json/               Readable per-collection JSON exports
│   └── RESTORE.md          How to restore the data
├── docs/PRD.md             Full product documentation & change history
├── docker-compose.yml      One-command production stack (Mongo + API + web server)
└── README.md               This file
```

## What's included (feature inventory)

- Animated marketing site: holo-ripple video background, scroll animations, marquee,
  services accordion, work gallery, reviews section, contact rows — desktop + mobile layouts
- Floating WhatsApp button + WhatsApp quote links (wa.me deep links — no third-party API)
- Accounts: customer registration/login, admin login (bcrypt + JWT httpOnly cookies,
  refresh tokens, brute-force lockout)
- Client portal: chat thread (with images), saved colour looks, jobs, invoices
- Admin console: inbox with unread badges, client records (search/archive/pin/delete),
  jobs, private notes, stats dashboard with 14-day charts, colour favourites leaderboard
- Invoices: draft/sent/paid, auto numbering (TMN-0001…), professional A4 PDF (jsPDF),
  send-to-client portal message, email with PDF attachment + download button, Stripe payment
- Colour visualiser (client-side image processing — no AI service): tap-to-select surfaces,
  brush/eraser, colour wheel + hex input, brand palettes, sheen preview, saved looks
- AI assistant: local Qwen2.5-0.5B chat (streamed), session history in MongoDB
- Public favourites leaderboard, view tracking/statistics
- SEO: metadata, LocalBusiness JSON-LD with aggregate rating, favicon

Honesty notes: the "Reviews" content is static paraphrased text (there is no live Google
Reviews API integration), there is no QR-code feature and no Facebook integration — the
only social/contact integrations are WhatsApp deep links and mailto/tel links.

## Requirements

- Any VPS/cloud server: 2 vCPU / 4 GB RAM minimum, **8 GB+ RAM recommended** if you want
  the AI assistant (the local PyTorch model peaks around 5 GB). Without the AI chat the
  rest of the site runs comfortably on 2 GB.
- Node.js 20 + Yarn (frontend build), Python 3.11 (backend)
- MongoDB 6/7 (local or hosted, e.g. Atlas)
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
`nginx.conf` does exactly that). Set it to a full URL only if the API is hosted on a
different domain, and then add that domain to the backend's CORS list.

## 3. Production (one command, Docker)

```bash
cp backend/.env.example backend/.env    # fill in real values first
docker compose up -d --build
```

Brings up MongoDB (persistent volume), the FastAPI backend and an nginx web server on
port 80 that serves the built site and proxies `/api` to the backend. Put HTTPS in front
with your own reverse proxy (Caddy, Traefik, cloud load balancer) or extend the nginx
config with certificates.

## 4. Environment variables

### backend/.env (create from backend/.env.example)

| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name (the included dump uses `test_database`) |
| `JWT_SECRET` | Random secret for signing auth tokens — generate: `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account auto-seeded on first boot |
| `FRONTEND_URL` | Public origin of the site (CORS + invoice-email download links) |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_ACCOUNT_ID` | Your Stripe account keys (currently sandbox/test) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) from your Stripe dashboard |
| `STRIPE_MODE` | `test` or `live` |
| `SENDER_EMAIL` | From-address for emails (must be verified with your email provider) |
| `EMAIL_FROM_NAME` / `EMAIL_REPLY_TO` | Display name / reply-to for outgoing email |
| `EMERGENT_EMAIL_KEY` | Emergent-only email key — **not used once you self-host** (see below) |
| `EMERGENT_LLM_KEY` / `GEMINI_API_KEY` | Legacy leftovers — **unused by the current code**, can stay blank |
| `LOGO_URL` | Absolute URL to the white logo used in email templates |
| `CORS_ORIGINS` | Present in the current deployment env but not read by the code (informational) |

### frontend/.env (create from frontend/.env.example)

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Baked in at build time. Empty = same-origin `/api` (recommended in production). Full URL = separate API domain. |

## 5. API keys & external services

| Service | Used for | Self-host status |
|---|---|---|
| Stripe | Invoice payments (Checkout + webhook) | Works with YOUR OWN Stripe account keys — replace the sandbox keys in `backend/.env`. Add a webhook endpoint in the Stripe dashboard: `https://your-domain.com/api/stripe/webhook`. |
| Resend (owner notifications) | Emails to you: new message / new registration / invoice paid | Optional. Set `RESEND_API_KEY` in `backend/.env` with a key from resend.com (free tier available). Already coded — no code change needed. |
| Emergent managed email proxy | Transactional email to CLIENTS (invoice emails with PDF + download button) | **Emergent-dependent.** The key only works inside Emergent. Replace `send_email()` — see below. |
| MongoDB | All data | Fully local/self-hosted. |
| AI (chat assistant) | Customer chat | **Fully local** (Qwen2.5-0.5B via PyTorch in `ai_worker.py`). No API key, no external AI service, works offline. |
| Colour visualiser | Room recolouring | **Fully client-side** canvas image processing (`src/lib/colour.js`). No server, no AI service. |

## 6. Emergent dependencies — the honest list

Everything above works 100% independently of Emergent EXCEPT transactional email.

**What breaks when you leave Emergent:** invoice/client emails (`send_email` in
`backend/server.py`, around line 1215) POST to `https://integrations.emergentagent.com`
using the `EMERGENT_EMAIL_KEY` env var. Without that key the request fails and clients
won't receive invoice emails (the site itself, portal chat and PDF downloads all keep
working).

**How to replace it (5 minutes):** create a free account at resend.com, verify your domain,
create an API key, then replace the body of `send_email()` with the drop-in below and add
`RESEND_API_KEY=…` to `backend/.env`:

```python
async def send_email(*, to, subject, html, reply_to=None, attachments=None):
    resend.api_key = os.environ["RESEND_API_KEY"]
    params = {
        "from": SENDER_EMAIL,          # e.g. "TMN <invoices@your-domain.co.uk>"
        "to": [to], "subject": subject, "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to
    if attachments:                    # [{"filename": ..., "content": base64}]
        params["attachments"] = attachments
    return (await asyncio.to_thread(resend.Emails.send, params)).get("id")
```

(The `resend` SDK is already in `requirements.txt`, and `_assert_safe_email` + the HTML
template above it stay exactly as they are.) AI is NOT an Emergent dependency — the chat
model is self-hosted and the visualiser never touches a server.

## 7. Database backup / restore

The full current database is included:

- `database/mongodump/` — binary dump, restore with:
  `mongorestore --uri "mongodb://localhost:27017" --drop database/mongodump`
- `database/json/` — one readable JSON file per collection
- `database/RESTORE.md` — step-by-step instructions

The `users` collection contains bcrypt password HASHES (never plaintext) — existing
logins keep working after a restore. The data includes real client names/emails, so
treat the archive as personal data (GDPR).

## 8. Verifying the build

```bash
cd backend && pytest tests/          # backend test suite
cd frontend && yarn build            # must build without errors
./scripts/test_email_download_link.py --help  # regression harnesses (need a running stack)
```

## Support notes

- Invoice PDFs are generated in the browser (jsPDF) — no server-side PDF dependency.
- The holo background videos live in `frontend/public/videos/` (VP9 + H.264).
- `docs/PRD.md` documents every feature decision and fix in chronological order.
