"""Backend tests for AI limits (no GEMINI_API_KEY configured -> friendly 429)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip().strip('"')

FRIENDLY = "Our free AI service has reached today's limit. Please try again tomorrow."
VISITOR = "qatestvisitor123"


# ---------- Backend purity ----------
def test_backend_purity_no_emergent_ai_refs():
    with open("/app/backend/server.py") as f:
        code = f.read()
    for bad in ["emergentintegrations", "OpenAIClient", "EMERGENT_LLM_KEY"]:
        assert bad not in code, f"Found forbidden reference: {bad}"


# ---------- Visitor cap regression (6 chat calls) ----------
def test_visitor_cap_six_chat_calls():
    headers = {"X-Visitor-Id": VISITOR, "Content-Type": "application/json"}
    payload = {"session_id": "qatest-session-1", "message": "hi"}
    codes = []
    bodies = []
    for i in range(6):
        r = requests.post(f"{BASE_URL}/api/ai/chat", json=payload, headers=headers, timeout=30)
        codes.append(r.status_code)
        bodies.append(r.text[:400])
    print("codes:", codes)
    print("last body:", bodies[-1])
    # Every response must be 429 JSON with friendly detail (no key configured)
    for i, (c, b) in enumerate(zip(codes, bodies)):
        assert c == 429, f"call {i+1} expected 429, got {c}: {b}"
        assert FRIENDLY in b, f"call {i+1} missing friendly message: {b}"


# ---------- Colour studio friendly block ----------
def test_colour_studio_friendly_block():
    # tiny 1x1 png base64
    tiny_png = ("data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==")
    headers = {"X-Visitor-Id": "qacolourvisitor1", "Content-Type": "application/json"}
    body = {"image": tiny_png, "prompt": "sage green walls", "mode": "interior"}
    r = requests.post(f"{BASE_URL}/api/ai/colour", json=body, headers=headers, timeout=30)
    assert r.status_code == 429, f"expected 429 got {r.status_code}: {r.text[:300]}"
    assert FRIENDLY in r.text


# ---------- Regression: auth still works ----------
@pytest.mark.parametrize("email,password", [
    ("customer@test.co.uk", "password123"),
    ("admin@tmndecorating.co.uk", "TMN-Admin-2026!"),
])
def test_auth_login_regression(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"


# ---------- Homepage renders ----------
def test_homepage_renders():
    r = requests.get(BASE_URL, timeout=15)
    assert r.status_code == 200
