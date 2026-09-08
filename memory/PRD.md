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
  reveal + settle, monochrome-to-colour hover, sliding WhatsApp caption bar. Luxury painting
  imagery (representative stock — MOCKED, not client photos).
- Quick-quote composer → prefilled WhatsApp message; floating WhatsApp button.
- Verified: desktop (1440) + mobile (390) screenshots, no overflow, no blank sections.

## Backlog
- P0: Replace gallery stock with real TMN project photos when provided.
- P1: Real service-area/location copy; testimonial section from real clients.
- P1: SEO pass (per-page meta, OpenGraph, sitemap) on request.
- P2: Optional contact form with email delivery (Resend) if client wants inbox enquiries.
