# Auth Testing Playbook — TMN Website

Read this before testing authentication.

## Stack
- FastAPI backend (/app/backend/server.py), MongoDB via MONGO_URL env.
- Password hashing: bcrypt. Tokens: PyJWT HS256, access 15 min + refresh 7 days, httpOnly cookies (SameSite=None; Secure) with Bearer fallback.
- Brute force: login_attempts collection, 5 failures → 15 min lockout per ip:email.
- Admin seeded on startup from ADMIN_EMAIL / ADMIN_PASSWORD in /app/backend/.env.

## Credentials
See /app/memory/test_credentials.md (admin + test customer).

## API test sequence (use external URL https://paint-property-pro.preview.emergentagent.com/api)
1. POST /auth/register {"name","email","password"} → 200 user object + cookies; duplicate email → 400.
2. POST /auth/login wrong password → 401; correct → 200 user + cookies.
3. GET /auth/me with cookies → same user; without cookies → 401.
4. Customer: POST /messages {"text"} → message; GET /messages → thread (admin replies marked read_by_customer).
5. Admin (role=admin cookie): GET /admin/customers → list w/ unread + last message; GET /admin/messages?customer_id=; POST /admin/messages {"customer_id","text"}; GET /admin/stats.
6. Non-admin calling /admin/* → 403.

## UI checks
- /login: login + register modes, error rendering (formatApiError), redirects: customer → /account, admin → /admin.
- /account: thread bubbles, 4s polling, send message.
- /admin: customer list with unread badges, reply box, stats chips.
