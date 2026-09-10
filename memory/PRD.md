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

- FOUR VISUALISER UPGRADES (owner: "first three options yes + colour wheel/code"):
  1. AUTO WALL DETECTION — "Detect walls" button (lib/colour.js): seed-based flood fill
     from upper-middle of the photo with colour tolerance + sky rejection; mask drawn to
     the brush canvas as a base layer; brush = touch-ups; Clear resets. Verified: mask hits
     wall (230) not floor/sofa (0); auto-recolour lands exactly on target colour.
  2. BRAND PALETTES — tabs Popular / Farrow & Ball (10 real names+No. codes: Hague Blue,
     Railings, Pigeon, Mole's Breath, Ammonite, Elephant's Breath, Card Room Green, Dead
     Salmon, Inchyra Blue, Charlotte's Locks) / Dulux (8: Egyptian Cotton, Goose Down,
     Nutmeg White, Polished Pebble, Denim Drift, Sapphire Salute, Emerald Glade, Cherry
     Blossom) — with "close digital match, order a sample pot" disclaimer.
  3. SHARE MY LOOK — Web Share API with the actual image file (mobile WhatsApp direct);
     fallback = download + wa.me prefilled.
  4. COLOUR WHEEL + CODE — custom HSV colour wheel (canvas) + brightness slider + hex code
     input with validation (3/6 digit) + Apply; syncs both ways.
  All verified desktop + mobile on /visualiser: no overflow, flows PASS. New lib:
  frontend/src/lib/colour.js.

- THREE MORE UPGRADES (owner: "first three options yes"):
  1. MULTI-SURFACE LAYERS — Walls + Woodwork layers, each with its own colour (dot shown
     on the layer chip), own auto-detect ("Detect walls" / "Detect woodwork" — woodwork
     finds smooth strips/panels: skirting, doors, frames) and own brush strokes (red =
     walls, blue = woodwork on the overlay); recolour applies walls first then woodwork
     (woodwork wins overlaps). Surface selector chips show ready/not-marked status.
  2. SHEEN PREVIEW — Matte / Silk / Gloss chips: silk lifts highlights subtly, gloss adds
     a strong top-down light sheen curve on the painted area; description line updates.
  3. SAVED LOOKS GALLERY — "Save this look" (flash confirmation) + "My looks (n)" toggle:
     localStorage grid (max 12, 640px thumbs), each card opens back into the viewer;
     Remove button per card.
  Fixed: mobile overflow on the result view (grid min-w-0 + overflow-x-hidden); JSX
  nesting bug in the gallery block. Verified desktop + mobile: layered recolour with two
  colours at once, gloss/silk summary text, save→flash→gallery→reopen, no overflow
  (scrollW 390 = clientW 390).

- ACCOUNT SAVED LOOKS + SEND TO TMN (owner request): signed-in users can "Save to my
  account" (POST/GET/DELETE /api/looks — saved_looks collection, 24-look cap, owner-only
  delete) and "Send to TMN" (POST /api/looks/{id}/send → drops the look image into the
  customer-admin chat + owner email). Messages now support an optional image field;
  rendered in the Account chat bubbles AND the admin ChatTab. Logged-out visitors see a
  sign-up CTA (with WhatsApp alternative). Account portal Chat tab shows a "My saved
  looks" grid (open visualiser link + remove). Verified via full curl journey: register →
  save → list → send (image in message) → customer chat shows image → admin console sees
  image → delete. Test account: looktest@tmn-test.co.uk / LookTest123!
  Saved looks render in: visualiser (device gallery) + Account portal.

- AUTO-DETECT EDGE-TO-EDGE FIX (user: real exterior left white patches at corners/shadows
  and speckles): wall detection now (1) smooths the photo with a 3x3 box blur, (2) grows
  the region with LOCAL gradient acceptance (walks smooth shading gradients and corners
  right to the wall's true edges — door/window frames still block it), (3) runs 3 rounds
  of hole-filling + speckle removal. Fixed a critical buffer-size bug found in testing
  (RGBA-indexed buffer was 1/4 size → detection died below row 30). Verified on a harsh
  synthetic case (95-shade wall gradient + 700 speckles + door): mask covers bright end,
  dark corner AND speckles (230), excludes floor/door (0); recolour lands blue across the
  whole wall with original shading preserved, floor untouched.

- MOBILE "NOTHING SHOWS" BUG FIXED (owner iPhone: upload card stuck invisible — whileInView
  reveal never fired below the fold on their browser, leaving a blank gap where the tool
  should be): FadeUp gained a `mount` prop (animate on page load, no scroll observer) —
  both visualiser tool cards now use it and are ALWAYS visible immediately. Testing agent:
  100% pass — mobile 390x844 cards visible with opacity 1 at load, upload→detect→swatch→
  generate flow works on mobile AND desktop, no overflow, homepage teaser + hero unaffected.

- OVER-DETECTION FIX + ERASER (user: real exterior photo — door, window and ground got
  covered): (1) gradient-walk tolerance tightened (local 36→26, seed 60→50) so the fill
  stops at door/window/ground boundaries, (2) the bottom quarter of the photo is excluded
  from the walls mask (ground/flooring never walls), (3) NEW Brush/Erase mode toggle —
  erase strokes (destination-out, 1.4x wider) wipe any over-detected area per layer;
  verified: ground+door excluded by detect, erased stripe = 0 with wall intact, recolour
  respects the erasure.

- DETECTION ROOT-CAUSE FIX — "wrong again, only the white walls" (user msg 565) + AI chat
  unresponsiveness (same msg). ROOT CAUSES FOUND: (1) detectWallMask had a hidden BLANKET
  FALLBACK that painted the top 45% of the photo as walls whenever detection failed —
  this covered doors/windows/ground and was the real villain behind msgs 538 & 565;
  (2) the sky-block walk (tolerance 30) leaked through blurred sky/wall boundaries into
  white walls, eating the wall and blocking all seeds → detection "failed" → fallback
  fired. FIXES (colour.js): sky walk now requires sky-plausible pixels (blue >= red - 2 —
  pale skies always lean blue, warm white walls never do) with tolerance 24; blanket
  fallback REMOVED (returns null → ColourStudio shows "Couldn't spot the walls
  automatically — brush over them instead" with zero wrong pixels); dead isSky function
  deleted. VERIFIED with a NEW Node regression harness /app/scripts/test_wall_detect.mjs
  that runs the REAL algorithm in Node (canvas stubbed) — 4/4 scenarios pass: house
  exterior (sky 0% / wall 85% / door 0% / ground 0%), interior (wall 99% / floor 0%),
  ambiguous all-white (graceful null), harsh gradient+speckles+door (sky 0% / wall 60% /
  door 0% / ground 0%; wall partial on extreme gradients is the accepted trade-off —
  brushable). AI chat: backend verified healthy via external curl (real streamed answer,
  ~6-10s; typing indicator + disabled send button confirmed working in UI by testing
  agent — 102-char answer streamed, no fix needed). Testing agent iteration_3: 100%
  backend + frontend — detect flow with quantitative pixel analysis on desktop+mobile,
  graceful-failure path, chat E2E, homepage/admin/account regressions all PASS.

## Backlog
- P0: Replace gallery stock with real TMN project photos when provided.
- P1: If the user's real photo still misbehaves (option B chosen): tune
  /app/scripts/test_wall_detect.mjs scenario values against THEIR photo via the Node
  harness, then port thresholds to colour.js (harness prints per-region coverage %).
- P2 (refactor, outstanding since iteration_2): split ColourStudio.jsx (~1100 lines)
  into BeforeAfter / ColourWheel / saved-looks components.
- P2: silence pre-existing /api/auth/me 401 console noise on public pages.
- P1: live Stripe keys (currently sandbox).
- DECLINED by owner (2026-09-10): Admin Looks Gallery — do not build unless asked.

- COLOUR FIDELITY ROOT-CAUSE FIX (user: "colours aren't appearing as the ones selected
  and are fading into different colours on the walls") — THREE real bugs in colour.js:
  (1) labToRgb back() gamma used the sRGB threshold 0.04045 on the LINEAR value instead
  of 0.0031308 → every dark channel inflated (royal blue R came out 45 not 31) so painted
  colours didn't match the selected swatch; (2) labToRgb G-row matrix coefficient 0.0557
  → correct 0.0415 (green inflated ~9% on every painted colour); (3) recolourLayers kept
  the photo's FULL lightness spread → colours read as "fading into different shades
  across the wall"; now compressed to the target lightness (newL = tL + (raw−tL)×0.42,
  clamped [tL−20, tL+16]) so the wall reads as the chosen colour with only subtle
  shading. VERIFIED: /app/scripts/test_recolour.mjs (ivory spread 24.2→12.1, royal blue
  20.8→7.5, Lab roundtrip EXACT for 6 colour families); testing agent iteration_4:
  painted wall avg Lab within 0.2 of target, spread 0; detect mask 90.2% wall / 1.3%
  sky / 0% ground; all regressions pass.
- QUOTE WITH COLOURS (owner approved): "Get this look — quote" WhatsApp link now
  prefills the message with the exact colours + finish chosen (result.prompt).
- SMART COLOUR PAIRING (owner approved, spark): "Pairs well with" strip under the
  swatches — 3 curated trim colours per wall-colour family (7 rules covering all brand
  palettes, Lab-nearest fallback for custom hexes); tap applies to the woodwork layer.
  Testing agent: all 7 trios exact, tap updates woodwork dot, no mobile overflow.

- OWNER DIRECTIVE — GENERALITY FOR ANY VISITOR PHOTO (2026-09-10): the colour tools
  must work for ANY uploaded image (exteriors, rooms, kitchens), never tuned to one
  photo. Delivered: (1) NEW TAP-TO-SELECT — colour.js regionFromPoint(img, xFrac,
  yFrac, kind) grows the region under the visitor's tap with the same edge-aware fill
  (localDiff 18, seedDiff 90, 2 hole-fill rounds, sharpened upscale); ColourStudio has
  a third tool "Tap" (data-testid colour-brush-mode-tap + colour-tap-hint) beside
  Brush/Erase — ANY surface (wall, door, frame, kitchen unit, ceiling) on ANY image is
  selectable by tap; (2) the woodwork gates REWRITTEN as ONE per-pick stats pass
  (fixing a chained-filter index bug that mislabelled doors as glass using stale Lab
  lookups): not-the-wall-colour (Lab > 12), not-a-sky-reflecting-pane (b-r > 12 AND
  L >= 50), not-a-pane-enclosed-by-a-ring (dark doors inside architraves survive);
  (3) multi-scale woodwork analysis: edge map at half scale (384, thick boundary
  lines, grain averaged away) + shape analysis at 768 (thin frames stay solid) +
  colour-constrained dilation (thickens hairline rings within their own colour).
  VERIFIED: harness 7/7 IDENTICAL across 3 runs (deterministic); on the tester's exact
  colours: WALLS main 89% + right 55% + glass/pipe/door 0%; WOOD door 96%, walls 0%,
  glass 0%; testing agent iteration_9: tap door = 93% coverage no bleed, tap wall =
  99% of the region, frame tap = overlay with clean glass, mobile identical, 0
  overflow, all logins green, 100% pass. KNOWN LIMITS: hairline (<=7px) frames and
  low-contrast skirting stay best-effort — one tap selects them on demand.

- DETECT REFINEMENTS FROM THE OWNER'S REAL HOUSE PHOTO (owner: the colour is perfect, but
  edges could be sharper next to trims/windows/doors; auto-detect missed one white
  wall; trim detect missed one window) — FOUR detectWallMask upgrades in colour.js:
  (1) SHARPER EDGES: analysis resolution 160→256 + the upscaled mask is re-binarized
  (sharpenMask) — no soft half-covered boundary pixels bleed over trims/windows/doors;
  (2) MISSED SECOND WALL: walls detector now unions ALL qualifying regions ≥4.5% of the
  image (was: only the single largest — a return wall split by a downpipe was dropped);
  (3) WINDOW FRAMES in trim mode: new boxy-ring rule (frame perimeter bounding a pane;
  fixed a unit bug where the fill ratio compared an area fraction to bbox pixels —
  always ≈0, which had made window GLASS get picked), picks cap 3→6, size caps relaxed,
  luminance edge map 3×3-smoothed so grain can't bridge boundaries (low-contrast
  skirting stays best-effort — brush to add); (4) STRONGER HOLE-FILL: 4 rounds, 0.62
  join threshold (kills white speckle holes around windows). VERIFIED: Node harness
  /app/scripts/test_wall_detect.mjs 6/6 scenarios ×3 runs (new E: two wall faces split
  by a downpipe → both 100% masked, pipe 0%; new F: woodwork rings+door, glass clean);
  testing agent iteration_5 on a real DOM: both wall faces painted (0.0% on sky/ground/
  door/pipe/glass), door 89.5% + both window rings ~30% strips with glass 0.0%, mobile
  0px overflow, homepage + chat FAB fine.

- OWNER: REMOVE TRIM FROM THE SITE (2026-09-10) — "focus strictly on wall colour, save
  the trim option for later, just remove it from the site". SURFACES is walls-only (the
  woodwork layer code stays dormant in colour.js + git history), the pairings strip and
  the woodwork chip are gone, all copy is walls-focused. Wall-fill tolerances widened
  (localDiff 18→24, seedDiff 90→140, tap fill matching) so shaded patches of the same
  wall fill completely instead of leaving white patches — sky plausibility, the
  bottom-quarter rule and door/ground edges still seal. Self-tested (owner asked to
  save credits, no subagents): harness 7/7 ×3 stable (house wall 86-88%, sky/door/
  ground 0%, two-walls 100/100 pipe 0%), recolour 0 failed, esbuild clean, visualiser
  screenshot: no woodwork chip, no overflow, walls-focused copy renders.

- OWNER: AUTO-DETECT REMOVED FROM UI + STRAIGHT TAP-FILL EDGES (2026-09-10) — "make
  auto detect dormant, remove from the options, use tap-to-select, make the edges
  straight not jagged". DONE: (1) ColourStudio.jsx is now 100% Tap/Brush/Eraser — the
  "Detect walls" button, autoDetect(), autoDone state, auto-status banner, detectWallMask
  import and all auto-copy are gone (autoMaskRef→tapMaskRef, tapCount state drives the
  READY chip); detectWallMask stays DORMANT in colour.js for later as instructed.
  (2) regionFromPoint edge-barrier hardened: analysis 384→512, TWO smoothing rounds so
  gravel/stone/render texture averages into flat colour (barrier becomes one continuous
  line the fill can't sneak through), majority-filter boundary straightening keeps edges
  straight instead of staircase-jagged. SELF-TESTED (owner asked to save credits — no
  subagents): new harness /app/scripts/test_tap_fill.mjs 11/11 ×3 stable (gravel leak 0%
  + boundary wobble sd=0px, house wall 100%/sky 0%/door 0%/ground 0%, door tap 97% clean,
  textured render wall 100% covered, two taps accumulate); dormant detect regression
  test_wall_detect.mjs 7/7 unchanged; LIVE on the preview: desktop + mobile uploads —
  Detect button absent, tap paints wall with dead-straight edges along gutter/door/
  gravel, sky/gravel/door stay clean, chip goes READY, no overflow. NOTE: pre-existing
  site-wide console noise "t.split is not a function" fires on the HOMEPAGE too at load
  (platform-injected scripts / 401 auth-me for logged-out visitors) — not from this
  change, no user-facing impact.

- OWNER: TAP IS NOW THE DEFAULT TOOL + BRIEF GUIDE AT TOP (2026-09-10) — "tap to paint
  working correctly, make it the preset function not the brush; add a very brief guide
  at the top: for best results tap, if areas missed tap again or use brush to highlight".
  DONE: tapMode defaults to true (Tap pill active on load, first tap paints with no mode
  switch needed) + a one-line gold hint strip above the photo: "For the best result tap
  each wall. Missed a patch? Tap it again — or switch to Brush to highlight it by hand"
  (data-testid colour-guide / colour-guide-text, MousePointerClick icon). SELF-TESTED
  (credit-light, screenshots only): desktop + mobile upload → guide renders, Tap pill
  active by default, first-try tap painted the wall (overlay alpha 255; sky 0 / gravel 0),
  chip flips to READY, no sideways overflow on either viewport.

- OWNER: COLOUR PLATE — CUSTOM COLOURS FROM AN UPLOADED PHOTO (2026-09-10) — "upload a
  separate image or screenshot of a wall highlight, zoom in on colour, create a custom
  colour sample, savable with an account; if not logged in popup: you can only save
  custom upload colours to your colour plate — sign in or create account". DONE:
  (1) Backend: /api/colours GET/POST/DELETE (auth via get_current_user, Mongo collection
  custom_colours keyed by user_id, 40-colour cap, hex normaliser accepts #039-style
  codes, 400 on bad hex, 401 logged out). (2) Frontend "Match a colour from a photo"
  card in the picker: upload a close-up or screenshot → PIXEL-ZOOM LOUPE follows the
  cursor (imageSmoothing off, hex readout) → tap samples that exact pixel (object-contain
  letterbox mapping handled) → applies as "Photo match" to the walls; "Use average of
  screenshot" for already-zoomed swatch screenshots; Remove. (3) MY COLOUR PLATE strip:
  saved colours load from the account on login, tap a swatch to apply it, hover × to
  delete, duplicate-save blocked, saved colours flow into the quote message. (4) Logged-
  out save → shadcn Dialog popup (paper-styled — theme --background is near-black) with
  the requested wording + Sign in / Create account buttons; Login.jsx now honours
  /login?mode=register. FIXED DURING BUILD: missing rgbToHex import (webpack overlay
  caught it) and onLoad-timing replaced by lazy pixel canvas from the visible <img>.
  TESTED: curl CRUD + auth guards pass; browser E2E desktop+mobile — loupe PASS
  (#9BAD87 on sage), corner tap PASS (#1F3A93 exact), average PASS, popup wording PASS,
  register deep-link PASS, login→plate loads/swatch applies/save/persist-reload/delete
  all PASS, no overflow either viewport.

- OWNER: ADMIN STATS TAB + CLIENT COLOUR FAVOURITES + PRIORITY CLIENTS + HOLO ON VISUALISER
  (2026-09-10) — "admin option tab for site views + customer account quantity; clients can
  favourite colours (admin favourites list); admin can pin a client / priority clients list;
  Test Your Colours page gets the home page's animated holo background". DONE:
  (1) VIEW TRACKING: POST /api/track/view (public) — anonymous visitorId in localStorage,
  daily site_views doc ($inc views, $addToSet visitors); PageTracker in App.js fires on
  every route change. (2) /api/admin/stats extended: views_total, views_today, views_7d,
  visitors_7d, customers_new_7d + existing customers/messages/unread. New admin "Stats"
  view (StatsView.jsx): six stat cards + "Clients' favourite colours" panel (hex, name,
  ♥ count, client emails, sorted most-loved first). (3) FAVOURITES: heart button beside the
  active colour (any source: swatch/wheel/code/photo match), POST/GET/DELETE /api/favourites
  (auth, dup-hex-safe, 60 cap); "Your favourites" row applies hearted colours on tap;
  logged-out heart → sign-in popup (favourites wording variant). FIX: brand swatch clicks
  now sync customHex/hexInput, and the heart + plate save read the ACTIVE wall colour —
  was saving stale wheel hex under the swatch's name. (4) PRIORITY CLIENTS: POST
  /api/admin/customers/{id}/pin toggles pinned; admin customers list returns pinned flag +
  pinned-first sort; inbox rows have a gold pin toggle + PRIORITY badge, pinned float top.
  (5) HOLO: HoloBackground extracted to components/HoloBackground.jsx (video + CSS fallback
  + paper tint); rendered on /visualiser (bg-paper removed) — home unchanged.
  TESTED: curl — tracking ✓, extended stats ✓, favourites CRUD + admin aggregate ✓, pin
  toggle + sort ✓; browser desktop+mobile — holo renders on visualiser ✓, heart add/remove
  + persistence ✓, admin stats cards ✓, favourites row correct (Sage green #9CAF88 +
  client email) ✓, pin → PRIORITY badge + floats first ✓, no overflow.

- OWNER: HOLO BACKGROUND ON THE ADMIN CONSOLE (2026-09-10) — "yes, the holo background on
  the admin console". DONE: HoloBackground rendered on /admin (root bg-paper removed,
  header+main wrapped in relative z-10, header frosted bg-paper/80 + backdrop-blur-md,
  workspace card bg-white/70→85 for readability over the animation). Same video + CSS
  fallback as home/visualiser. TESTED: browser desktop+mobile — holo video present behind
  inbox + Stats views, cards readable, no overflow.

- OWNER: PUBLIC "CLIENTS' FAVOURITE COLOURS" TAB (2026-09-10) — "create a tab on the
  homepage header for clients' favourite colours, ranked list 1-10, no numbers of people
  shown, preset 10 colours that change as people favourite them, holo background on this
  part". DONE: (1) Backend GET /api/favourites/top (PUBLIC — no auth, no counts, no client
  details): aggregates favourite_colours by hex, ranks by count then recency, fills to 10
  with FAVOURITE_PRESETS (curated TMN ten). (2) New page /favourites (Favourites.jsx):
  HoloBackground + visualiser-style header, "CLIENTS' FAVOURITE COLOURS." hero, ranked
  01-10 rows (big rank numeral, colour disc, name + hex), gold "MOST LOVED" badge on #1,
  CTA to the visualiser, staggered FadeUp reveals, skeleton while loading.
  (3) Homepage header nav: new FAVOURITES tab (Link route among the hash links).
  TESTED: curl ranking — real favourites climb above presets (Sage green #1 after client
  hearts, Anthracite entered #2 on a new favourite), exactly 10 rows, zero counts/emails
  exposed; browser desktop+mobile — 10 rows render, nav tab navigates, no overflow.

- OWNER: TOP-10 BUTTON UNDER THE TEST-YOUR-COLOURS SECTION (2026-09-10) — "where is the
  option to view the top 10 colours — I want a tab I can click underneath the test your
  colours section". DONE: white pill button "♥ SEE THE TOP 10 FAVOURITE COLOURS →"
  (data-testid colour-top10-link) centered directly under the dark ColourTeaser card,
  glassy bg-white/80 over the holo, hover → ink. Vital on mobile where the nav links are
  hidden. TESTED: button present + navigates to /favourites on desktop and mobile, no
  overflow.

- OWNER: "FREE COLOUR ADVICE" BUTTON REMOVED (2026-09-10) — removed the WhatsApp
  colour-advice anchor from the ColourTeaser card (unused waLink import cleaned up too).
  The card now has just the gold "Open the visualiser" button + the top-10 pill beneath.
  TESTED: gone on desktop + mobile, top-10 button unaffected, no overflow.

- OWNER: "GET A QUOTE" NOW ACCOUNT-GATED (2026-09-10) — "change all get a quote tabs to a
  popup to create an account or sign in rather than leading to WhatsApp; prompt to create
  an account to chat and request a quote". DONE: new shared QuoteCta component — clicking
  any Get a quote button: logged-out → shadcn popup "Request your quote / Create an account
  or sign in to chat with us and request your quote — messages, quotes and updates all stay
  in one place" with Sign in + Create account (deep-links to /login and /login?mode=register);
  logged-in → straight to their portal (/account, admins /admin) where the chat + quote
  request live. NO WhatsApp in this flow. Swapped on: homepage nav (nav-quote-button),
  Hero CTA (hero-cta-quote-button), visualiser header, favourites leaderboard header —
  stale waLink imports removed. Floating WhatsApp button + Contact page still WhatsApp.
  TESTED in browser: all four buttons open the popup logged out (create-account deep link
  lands on register), logged-in click goes straight to /account, no overflow. NOTE: the
  Contact page "Quick quote" WhatsApp form was kept (it's a form, not a Get-a-quote tab) —
  flagged to the owner.

- OWNER: 5-STAR REVIEWS SECTION (2026-09-10) — "access and apply these 5 star rating and
  reviews to the site" (screenshot: Google AI overview — TMN holds 5.0/5 across ~16
  reviews; TopTenTrades 5.0, high praise on MyBuilder + MyJobQuote; highlights: quality on
  hard jobs, reliability, site care, ~88% positive recommendation). DONE: new homepage
  Reviews section (components/Reviews.jsx) placed between Work and About — sticky left
  column: eyebrow "Rated on TopTenTrades, MyBuilder & MyJobQuote", "FIVE STARS, TIME AFTER
  TIME.", huge 5.0 + 5 gold stars + "from around 16 client reviews", platform chips; right:
  4 glass quote-theme cards (Quality of Work / Reliability / Site Care / Repeat Work with
  sources — paraphrased honestly from the overview, no invented names). SEO:
  aggregateRating (5.0, 16, bestRating 5) added to the existing LocalBusiness JSON-LD in
  public/index.html so Google can surface stars. TESTED: section + 4 cards + 5 stars render
  on desktop + mobile over the holo, no overflow; JSON-LD served (curl confirmed).

- OWNER: VIEW-ALL-REVIEWS BUTTON + FULL /REVIEWS PAGE ON HOLO (2026-09-10) — "add a view
  all reviews button underneath them, holo animated background still while scrolling
  through them all on a separate tab". DONE: (1) "VIEW ALL REVIEWS →" glass pill centred
  under the highlight cards in the homepage Reviews section (data-testid reviews-view-all).
  (2) New page /reviews (ReviewsPage.jsx): HoloBackground + visualiser-style header
  (Back to site / logo / QuoteCta), "WHAT CLIENTS SAY." hero with 5.0 stars line, 12
  five-star review-highlight cards (masonry columns, paraphrased honestly from the
  verified-review themes — quality/reliability/site care/social proof/all-round service,
  attributed via platform), bottom CTAs to the visualiser + quote popup. Route added in
  App.js. TESTED: button present + navigates to /reviews; 12 cards render; holo stays
  fixed while scrolling the whole feed; desktop + mobile, no overflow.

- OWNER: REVIEWS MOVED UNDER "THE TRADE, DONE PROPERLY" (2026-09-10) — homepage order is
  now Hero → Marquee → ColourTeaser → Services ("The trade, done properly.") → REVIEWS →
  Work → About → Contact. TESTED: DOM offsets confirm services < reviews < work; renders
  clean on desktop + mobile, no overflow.

- OWNER: MUSIC DOUBLING FIXED + CONTINUOUS ACROSS THE SITE (2026-09-10) — "music doubling
  over when switching tabs; make it one continuous track anywhere you go on the site".
  ROOT CAUSE: HomeMusic was mounted inside the home page only — every navigation destroyed
  it and hot reloads could orphan extra audio elements. FIX: (1) module-level SINGLETON
  Audio (one element per browser session, physically impossible to double — every mount
  shares it); (2) mounted ONCE at router level in App.js so it plays continuously on every
  page (button now shows on all pages); (3) no pause-on-unmount; (4) user's pause intent
  persisted to localStorage (tmn-music-muted) so it stays off after reloads; (5) autoplay
  policy handled: after a hard reload it resumes on the first scroll/tap. TESTED in
  browser: exactly one button per page (home/visualiser/favourites/reviews), music keeps
  playing across client-side navigation, stays off after pause+reload, resumes on first
  gesture after reload, no overflow.

- OWNER: REVIEWS BUTTON IN THE HOMEPAGE HEADER (2026-09-10) — "add a button next to the
  login button on the homepage that takes you to the full reviews page". DONE: gold-star
  "★ REVIEWS" pill (nav-reviews-button) directly left of the Log in button in the site
  header — full label on desktop, star icon only on mobile → /reviews. TESTED: button next
  to login on the same row (desktop + mobile), navigates to the full reviews page, no
  overflow.

- OWNER: GOLD STAR REMOVED FROM HEADER REVIEWS BUTTON (2026-09-10) — the homepage header
  reviews button now reads just "Reviews" (no star icon) on desktop and mobile; unused
  Star import cleaned. TESTED: no svg in the button either viewport, label intact,
  navigates to /reviews, no overflow.

- OWNER: HEADER REVIEWS BUTTON SIZED TO MATCH (2026-09-10) — Reviews button now uses the
  exact same mono pill styling/size as Log in (37px height both, desktop + mobile).
  TESTED: measured equal heights, no overflow.

- OWNER: MUSIC NEVER RESTARTS + LOGIN LANDS ON HOMEPAGE (2026-09-10) — "music starts from
  beginning when logging in; make it loop with no cut outs/starts/stops no matter what;
  first login should go to the homepage not the chat". ROOT CAUSE: the nav LOG IN was an
  <a href> = full page reload, killing the audio; the new context then started it from
  zero on the next gesture. FIX: (1) nav Log in/My account + login back-link are now
  client-side Links (no reload, no cut); (2) the audio persists its position to
  localStorage (timeupdate, ~1/s) and RESUMES from there after any full reload — only a
  browser gesture is needed after reloads (autoplay policy); (3) after login/register users
  now land on "/" (admins → /admin); My account button still goes to the portal chat.
  TESTED in browser: music kept playing across login (position 2.3→4.4→6.5, never reset),
  landed on homepage after login with MY ACCOUNT in nav, hard reload → first scroll
  resumed at ~4.4 (not 0), no overflow.

- OWNER: CHAT OPENS AT TOP, NO AUTO-SCROLL (2026-09-10) — "when opening chat stay at the
  top where it says hello, let the user scroll down to the chat rather than auto doing it".
  DONE: removed the scrollIntoView-on-messages effect (and the unused bottomRef) from the
  account portal — opening the page now rests on the "HELLO, {name}" greeting; visitors
  scroll to the conversation themselves; incoming messages no longer yank the view.
  TESTED: mobile — opens at scroll 0 with the greeting in view, no overflow.

- OWNER: ADMIN INVOICE DESK + CLIENT ARCHIVING (2026-09-10) — "button right of the unread
  box: generate invoices, view paid & unpaid with a search bar, send to client on the site
  or download to email; archive a client once job completed & paid, return full chat
  history if they request new work". DONE: (1) INVOICES pill right of UNREAD in the inbox
  header → new top-level Invoices desk (InvoicesView.jsx): Generate-invoice modal (client
  picker, line items with live total, due date, draft/sent), search bar (number/client/
  email/status), All/Unpaid/Paid filter chips with counts, per-row actions — SEND TO CLIENT
  (POST /admin/invoices/{id}/send: marks sent + drops a chat message into the client's
  portal thread: "Invoice TMN-0005 for £1,370.00 has been sent to you…"), DOWNLOAD (jsPDF
  via existing invoicePdf util), Mark paid/unpaid (PATCH). (2) ARCHIVE: POST /admin/
  customers/{id}/archive toggles archived; inbox hides archived clients by default with a
  "Show archived (N)" toggle + ARCHIVED badge + faded rows; one-tap restore; GET customers
  sorts pinned → active → archived; AUTO-RETURN: an archived client sending a chat message
  is instantly unarchived with full history intact. TESTED via curl + browser: invoice
  create/send/client-visible/download flash all PASS; search+filters PASS; archive →
  hidden + badge → restore PASS; auto-return PASS; no overflow.

- OWNER: ADMIN CONSOLE BUTTONS COMPACT ON MOBILE ONLY (2026-09-10) — "make the buttons
  smaller to fit on mobile only, do not edit desktop". DONE: header view pills (Inbox/
  Stats/Client records), Log out, the stats pills row (customers/messages/unread) and the
  Invoices button all shrink on <640px (px-2.5/3 py-1.5 text-[9px] tracking-[0.08em]
  whitespace-nowrap) and restore the EXACT original classes at sm:+ (desktop px-4/5
  text-[10px] untouched); header container wraps gracefully on phones (h-auto flex-wrap,
  sm:h-24 sm:flex-nowrap = identical desktop); stats pills row gained flex-wrap (was
  overflowing 444px > 390px); music button ping ring clipped (overflow-hidden). TESTED:
  390px — zero overflow (scrollW 390), every button visible uncut; 1440px — padding 16px/
  font 10px/logout 20px unchanged, no overflow.

- OWNER: STATS BAR CHART (2026-09-10) — "turn the daily view counts into a simple bar
  chart in the admin console". DONE: /api/admin/stats now returns daily_views (last 14
  days, [{day, views}]); StatsView.jsx gained a "SITE VIEWS — LAST 14 DAYS" card with a
  recharts BarChart (gold #C6A55C bars, rounded tops, mono axis labels dd/mm, hover tooltip
  with day + view count, zero-state hint "Bars rise as the visits come in"). Also deduped
  PageTracker (StrictMode dev double-mounts were double-counting views; production builds
  unaffected). TESTED: chart renders desktop + mobile over the holo, tooltip works, counts
  increment +1 per page load after dedupe (418→420 across 2 navigations), no overflow.

- OWNER: CLICKABLE STAT CHARTS + DELETE CLIENT + LOOKTEST CLEANUP (2026-09-10) — "click
  each stat to change the chart for each stat; what is Look Tester, cannot remove". DONE:
  (1) All six stat cards are now clickable — views cards chart SITE VIEWS/day, the visitors
  card charts UNIQUE VISITORS/day (per-day visitor counts), the account cards chart NEW
  ACCOUNTS/day (signups from created_at); gold "■ CHARTING NOW" state on the active card +
  "□ TAP TO CHART" hint on others; chart title + tooltips follow the metric. Backend
  /api/admin/stats returns one combined daily[] series (views/visitors/signups × 14 days).
  FIXED during build: chart read the old daily_views key → blank chart; switched to daily.
  (2) Look Tester was a leftover TEST account from development — deleted via the new
  DELETE /admin/customers/{id} endpoint (cascade: messages, invoices, jobs, notes, looks,
  colours, payments). Admin client rows now have a two-tap delete (bin → red "SURE?" →
  gone) alongside pin/archive. (3) Housekeeping: looktest + throwaway test accounts purged;
  Jane restored to active. TESTED: metric switching (titles + rings + bars) PASS on
  desktop, delete arm/confirm/remove PASS, no overflow.

- OWNER: NO AUTO-SCROLL IN ADMIN + CHATS NEVER DELETED UNLESS FULL DELETE (2026-09-10) —
  "don't auto scroll down when clicking things in the admin; never delete chats, only
  archive; archive menu gets the fully delete option". DONE: (1) removed the admin
  ChatTab's scrollIntoView effect — selecting a client opens their thread at the top, no
  jumping. (2) the bin button no longer exists on ACTIVE client rows (pin + archive only —
  chats can never be deleted from the list); the two-tap full delete (bin → red SURE? →
  cascade including chats) now lives ONLY in the archive menu (Show archived → archived
  rows show Restore + Delete). (3) archiving/removing test state left clean (Jane active).
  TESTED in browser: no bin on active rows PASS, select-client no auto-scroll PASS
  (scrollY 0), archive menu shows restore + full-delete PASS, restore PASS, no overflow.

- OWNER: ARCHIVE + SEARCH PILLS NEXT TO THE INVOICES BUTTON (2026-09-10) — "archive view
  button and search button to the right of the invoice button". DONE: the Show-archived
  toggle moved OUT of the client list into the pills row as a pill (Archive icon + live
  count, right of INVOICES) and a SEARCH pill added next to it — opens an inline input
  filtering clients by name/email; closing the search clears the query (fixed a bug where
  the list stayed stuck on "No customers"); also fixed a crash from a missing Search icon
  import. TESTED: pill order (unread → invoices → archived → search, same row) PASS,
  search finds Jane + close restores the list PASS, archived reveal/hide PASS, Jane left
  active, no overflow on desktop or mobile.

- OWNER: OFF-SITE CUSTOM INVOICES + PROFESSIONAL A4 PDF (2026-09-10) — "allow custom
  invoices for clients outside the website and create an A4 fully detailed professional
  invoice with the logo on generating". DONE: (1) InvoiceInput customer_id now optional +
  client_name/client_email/client_address fields; create endpoint branches (registered →
  denormalise name/email from the account; off-site → require client_name); invoice_public
  carries the details; send-to-client rejected 400 for off-site (download + email instead).
  (2) InvoicesView form: Registered / Off-site client toggle pills; off-site shows name*
  + email + address fields; rows show an OFF-SITE badge and hide the Send button for
  off-site; clientFor prefers stored details. (3) invoicePdf.js rewritten: professional A4
  — dark letterhead with logo + gold brand rule, INVOICE + number, issue/due dates, PAID/
  DUE/DRAFT chip, billed-to block (name/email/address), striped items table with wrapped
  descriptions, Total due rule, payment note, footer with contact details, multi-page safe.
  (4) INFRA NOTE: the pod's Mongo restarted + wiped data mid-session (ephemeral volume);
  admin auto-reseeded, customer@test.co.uk recreated (same password) — see
  test_credentials.md. TESTED: curl — off-site create (TMN-0001, customer_id None) PASS,
  send → 400 PASS, registered create carries details PASS; browser — form toggle + fields
  PASS, OFF-SITE badge + no-send PASS, PDF download TMN-0002.pdf PASS (flash + download
  event), no overflow.
