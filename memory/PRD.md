# TMN Decorating & Maintenance — Website PRD

## Original problem statement
Fully animated website for a domestic and commercial painting & decorating and property
maintenance specialist (TMN). Client initially wanted their logo inside the white circle of a
fabric-reveal animation looping with rewind on the homepage, and a white holo-ripple animation
as a general background with scroll animations. Iterated direction (latest wins):
- Drop the black-and-white fabric animation entirely.
- Use ONLY the white holo-ripple animation as the site-wide background, sharper/more detailed.
- Darker, easier-to-read text over the holo background.
- Bigger logo in the corner (nav).
- Constant floating WhatsApp button linking to wa.me.
- Luxury painting photos (no people) in the work gallery.

## Contact facts (client-provided, exact)
- WhatsApp / phone: 07736325643 (wa.me/447736325643)
- Email: info@tmndecorating.co.uk
- No location, pricing, stats or credentials given — none invented on the site.

## Architecture
- Frontend: React (CRA/craco) + Tailwind + framer-motion + lenis smooth scroll, single page.
- Components: Nav (glass, big corner logo), Hero (light, kinetic masked headline, floating
  logo badge with parallax), Marquee (slow editorial), Services (numbered 01–04 accordion,
  WhatsApp quote links), Work (luxury painting gallery, hover colour-reveal), About (holo bg,
  3-chapter manifesto), Contact (WhatsApp/phone/email rows + quick-quote WhatsApp composer),
  Footer, FloatingWhatsApp (pulsing, fixed), Cursor (blend-difference ring), global fixed
  HoloBackground video (2560px VP9/H.264, paper overlay for text contrast), Lenis init.
- Assets: /public/videos (bg-hq.webm/mp4; unused hero-loop kept), logo-dark/white/badge PNGs
  (badge = feathered white disc + logo, generated with PIL).
- Backend: untouched FastAPI template (site is fully static; contact is link-based).
- data-testids on all interactive elements (nav, CTAs, chapters, work cards, quote composer,
  contact links, floating WhatsApp).

## Implemented (2026-09-08)
- Light monochrome editorial theme; holo-ripple video background across the whole site.
- Kinetic masked headline hero, floating logo badge, lenis scroll, scroll reveals, marquee.
- Services accordion 01–04 with per-service WhatsApp quote links.
- Gallery rebuilt as editorial cards: numbered chips, alternating frame heights, scroll
  reveal + settle, hover zoom, sliding WhatsApp caption bar. Luxury painting imagery
  (representative stock — MOCKED, not client photos).
- Quick-quote composer → prefilled WhatsApp message; floating WhatsApp button.
- Auth: customer register/login, admin login (bcrypt, JWT httpOnly cookies, 15-min access +
  7-day refresh, auto-refresh interceptor, brute-force lockout). Pages /login, /account, /admin.
- Customer account: chat thread + My jobs + My invoices (+ PDF download, Stripe pay button).
- Admin console: chat inbox (unread badges), Jobs tab (create/track/date/status/delete),
  Notes tab (private notes), Invoices tab (line items, auto numbers TMN-0001…, draft/sent/paid,
  PDF download), rename customers, Client records view (searchable full history, CSV export).
- Payments: Stripe Checkout (claimable sandbox, GBP) on "sent" invoices; webhook +
  status-polling mark invoices paid; tax mode = Stripe calculates only (calc_only).
- Email: Resend notification to owner on new message / new registration / invoice paid —
  activates automatically once RESEND_API_KEY is configured on the platform.
- AI assistant: floating sparkle button above WhatsApp opens a streaming chat panel
  (OpenAI gpt-5.4 via Emergent LLM key, per-session history, Mongo persistence) that answers
  minor painting/decorating/maintenance questions and redirects quotes to WhatsApp. The
  assistant knows any domestic trade can be completed by TMN or their qualified tradesman
  friends (single point of contact).
- AI Colour Studio section (#colours): visitors upload a room photo, pick a preset look
  (sage/navy/ivory/charcoal/blush/white) or type their own scheme, and gpt-image-1 (via the
  Emergent proxy) repaints only the described surfaces — before/after display, save image,
  gold "Get this look — quote" WhatsApp link. Verified end-to-end (42s generation).
- Homepage background music: client's second uploaded track (57s), continuous loop, homepage only
  (mounted in the Site component so login/account/admin pages are silent). Music auto-starts
  as soon as the visitor makes their first interaction (tap/scroll/key — browser autoplay
  policy blocks a true silent start), with a floating speaker toggle above the AI button to
  turn it off; once muted by the visitor it stays off until they re-enable it.
- Services now has chapter 05 "Any Trade, One Call" describing the same full-trade message.
- Verified: desktop (1440) + mobile (390) screenshots, no overflow, no blank sections; full
  curl verification of auth, chat, jobs, notes, invoices incl. role enforcement (403/401);
  Stripe checkout session + webhook → invoice paid verified end-to-end.

- Floating TMN logo disc (Msg 680): now dissolves gradually across the whole hero as the
  visitor scrolls down (scroll-linked opacity, option b "cinematic fade") and fades back in
  as they scroll back up; removed the upward parallax slide that used to push it over the
  headline. Verified with measured opacity (1 → 0.5 @450px → 0 @1000px → 1 on return) on
  desktop 1440x900 and mobile 390x844; no overflow. User may switch to fade + shrink (c).

- Rectangle plate trial (user request): logo badge rebuilt as a glossy rounded-rectangle
  glass plate — same one-flat-baked-image approach (no CSS blur → Android bug impossible),
  corners transparent, chrome shine + gloss + rim light intact, badge-glint CSS mask switched
  from circular to 12.5% border-radius. Live as /logo-plate.png; circle version kept at
  /logo-disc.png for instant revert. Bake script persisted at /app/scripts/gen_plate.py
  (radius adjustable). Scroll-fade re-verified on the plate: 1 → 0.5 @450px → 1 on return,
  desktop 1440x900 + mobile 390x844, no overflow, no square edges.

- Colour Studio interior/exterior (user request): new "What are we painting?" toggle after
  photo upload — Interior (rooms & indoor woodwork) and Exterior (walls, doors & trims),
  each with its own 6 preset looks, adaptive custom placeholder and adaptive default AI
  scheme; backend /api/ai/colour accepts mode and uses an exterior-specific repaint prompt;
  mode stored with each generation.
- ROOT CAUSE of "upload isn't working": the Emergent Universal LLM key hit its budget
  (429 budget_exceeded, cost 0.51417 / max 0.4) → ALL AI features (colour generation AND
  chat) fail until the user tops up: Profile → Manage plan → Universal Key → Add Balance
  (or enable auto top-up). Upload/preview themselves work fine.
- Edge bug fixed: preview edge replaces backend 5xx bodies with its own HTML error page, so
  visitors saw generic "something went wrong" — AI failure + email failure now return 429
  JSON so the friendly detail messages reach the browser (verified externally).
- Verified: external curl (422 validation, 429 JSON detail passthrough, login 200), UI
  toggle + preset sets + placeholder on desktop 1440x900 + mobile 390x844, no overflow.
  NOT verifiable until key top-up: a real end-to-end repaint (budget 429).

- GEMINI MIGRATION (owner directive — cost-proofing): ALL customer-facing AI (chat SSE +
  colour studio) moved off the Emergent Universal Key (now blanked in backend/.env, zero
  code references) to the owner's OWN Google Gemini free-tier key via the official
  google-genai SDK, server-side only. Models: gemini-2.5-flash (chat, thinking disabled,
  max_output_tokens=400, short-answer system prompt) + gemini-2.5-flash-image (colour
  studio, image-in/image-out). No billing enabled anywhere; no Google Search/Maps/other
  paid APIs; NO fallback to Emergent.
- Hard usage caps in Mongo (ai_usage, TTL 48h, enforced BEFORE any model call, survives
  restarts): 5 AI requests/visitor/rolling-24h + 100 site-wide/rolling-24h; cooldown
  collection (ai_cooldown) after any Gemini 429 → all rejections return the exact friendly
  message "Our free AI service has reached today's limit. Please try again tomorrow."
  (429 JSON so the preview edge passes it through). Visitor id: X-Visitor-Id header
  (localStorage UUID) or hashed-IP fallback (src/constants/visitor.js).
- PENDING: GEMINI_API_KEY is EMPTY — owner must create a free key at aistudio.google.com
  (NO billing), paste into GEMINI_API_KEY= in /app/backend/.env, then the backend needs a
  supervisor restart; only then can real streaming/chat/image E2E be verified.
- Verified (testing agent 100% B+F): no Emergent references; caps fire (visitor + site
  logs); friendly message in chat widget + colour studio on desktop & mobile; auth +
  homepage + studio UI unchanged; pytest at /app/backend/tests/test_ai_limits.py.

- ZERO-COST SELF-HOSTED AI (owner chose option A — replaced the Gemini plan entirely):
  all AI now runs open-source models INSIDE the server. NO external AI service, NO API
  keys, NO usage caps, NOTHING that can bill. Emergent key + Gemini key both removed from
  use; daily-limit logic deleted (per owner).
  • Assistant chat: Qwen2.5-0.5B-Instruct (transformers, local) — streamed via job worker,
    ~25s end-to-end through the public URL. Answer quality is 0.5B-level (basic).
  • Colour studio: SD1.5 (StableDiffusionInpaintPipeline) + AUTO WALL MASK (numpy/PIL edge
    analysis: largest smooth region, upper 62% band, feathered) + pixel compositing
    (out-of-mask = original photo, structure guaranteed). Strength 0.6. Presets rewritten
    as SD-native noun phrases.
  • Architecture (8GB pod cap): heavy models run as SHORT-LIVED subprocess workers
    (ai_worker.py, ~4.8GB RSS) that load→generate→exit; backend never holds model memory.
    Critical: the public edge cuts HTTP responses at ~60s, so POST /api/ai/colour now
    returns {job_id} instantly and the page polls GET /api/ai/colour/result/{id}
    (frontend polls every 3s, 10min deadline).
  • Verified: full external E2E (job 0.3s → done 225s → 170KB PNG), chat external E2E
    (25s streamed), UI flow (upload → generate → spinner), memory 2.7GB idle / 7.9GB peak
    (worker survived), auth unaffected.
  • HONEST LIMITATION (owner informed): SD1.5 does not follow instructions like paid
    instruct models — wall-colour fidelity varies (on the synthetic test image it painted
    furniture blue instead of walls). Needs tuning with real room photos; not equivalent
    to gpt-image-1/nano-banana quality. Chat answers are basic (0.5B model).

- BRUSH-TO-PAINT VISUALISER (owner chose option A after self-hosted SD failed on real
  photos — weak colour fidelity + quality loss): the colour studio is now fully client-side
  classical image processing — upload, BRUSH over any surface (canvas mask, touch-ready,
  undo/clear/size slider), pick from 12 paint swatches or any custom hex, and the brushed
  region is re-tinted in LAB space keeping the photo's own lightness/shading (average-L
  rescaled to the target colour's lightness) — TRUE-to-colour, INSTANT (<1s), ZERO quality
  loss, ZERO cost, no AI service, no keys, no limits. Interior/Exterior toggle removed
  (brush works on any surface); before/after slider, save, email, WhatsApp quote all kept;
  section retitled "Colour visualiser". Verified: brushed wall pixels sample EXACTLY the
  target colour (62,73,153 for #1F3A93) with untouched quality elsewhere; mobile + desktop.
  Backend colour-generation endpoints removed; ai_worker/ai_local now chat-only
  (Qwen2.5-0.5B local, ~25-55s per reply through the public URL, streamed).

- VISUALISER TO ITS OWN TAB (user request): homepage section replaced by a compact dark
  CTA card (id="colours" kept → nav anchor works) with gold "Open the visualiser" button
  opening /visualiser in a NEW TAB; new page /pages/Visualiser.jsx = top bar (Back to site
  / TMN logo / Get a quote) + full ColourStudio + footer note. Verified: button target=_blank
  ✓, /visualiser full brush flow E2E ✓ (instant blue repaint visible in slider), desktop +
  mobile, no overflow. Homepage space reclaimed.

## Backlog
- P0: Replace gallery stock with real TMN project photos when provided.
