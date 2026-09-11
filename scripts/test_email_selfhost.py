"""Verify send_email: self-hosted Resend branch + Emergent managed branch."""
import asyncio, os, base64

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
os.environ.setdefault("JWT_SECRET", "test")
import server as s

PDF = base64.b64encode(b"%PDF-fake").decode()
results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), "-", name, extra)

# --- Branch A: self-hosted (RESEND_API_KEY set) -> official Resend SDK, own domain ---
os.environ["RESEND_API_KEY"] = "re_test_selfhost_key"
captured = {}
def _fake_resend_send(params):
    captured.update(params)
    return {"id": "resend-id-123"}
orig_send = s.resend.Emails.send
s.resend.Emails.send = _fake_resend_send
try:
    eid = asyncio.run(s.send_email(
        to="client@example.co.uk", subject="Invoice TMN-0001",
        html="<p>Invoice</p>", attachments=[{"filename": "TMN-0001.pdf", "content": PDF}]))
finally:
    s.resend.Emails.send = orig_send
    del os.environ["RESEND_API_KEY"]
check("self-host: sent via Resend SDK", eid == "resend-id-123")
check("self-host: from = brand <own domain>", captured.get("from") == f"{s.EMAIL_FROM_NAME} <{s.SENDER_EMAIL}>", captured.get("from", ""))
check("self-host: attachment passed", captured.get("attachments") == [{"filename": "TMN-0001.pdf", "content": PDF}])
check("self-host: no Emergent proxy fields", "from_name" not in captured)

# --- Branch B: managed (no RESEND_API_KEY) -> Emergent proxy, unchanged ---
class FakeResp:
    def raise_for_status(self): pass
    def json(self): return {"id": "proxy-id-456"}
class FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return None
    async def post(self, url, **k):
        captured.clear(); captured["url"] = url; captured["headers"] = k.get("headers"); captured["json"] = k.get("json")
        return FakeResp()
orig_client = s.httpx.AsyncClient
s.httpx.AsyncClient = FakeClient
try:
    eid2 = asyncio.run(s.send_email(to="client@example.co.uk", subject="Invoice TMN-0001", html="<p>Invoice</p>"))
finally:
    s.httpx.AsyncClient = orig_client
check("managed: sent via Emergent proxy", eid2 == "proxy-id-456")
check("managed: proxy URL + key", captured.get("url") == f"{s.EMAIL_BASE_URL}/api/v1/email/send" and captured.get("headers", {}).get("X-Email-Key") == s.EMAIL_KEY)
check("managed: from_name present", captured.get("json", {}).get("from_name") == s.EMAIL_FROM_NAME)

# --- safety gate still runs on both paths ---
try:
    asyncio.run(s.send_email(to="x@example.co.uk", subject="pw", html='<form action="https://evil.com"></form>'))
    check("gate blocks forms", False)
except ValueError:
    check("gate blocks forms", True)

print("SUMMARY:", "ALL PASS" if all(results) else "FAILURES")
