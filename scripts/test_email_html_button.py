"""Capture the exact invoice-email HTML the server builds and verify the download button."""
import asyncio, base64, os
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "tmn")
os.environ.setdefault("JWT_SECRET", "test")
import server as s


class FakeCollection:
    def __init__(self, doc):
        self.doc = doc

    async def find_one(self, q):
        return self.doc


class FakeFiles:
    def __init__(self):
        self.stored = None

    async def update_one(self, filt, update, upsert=False):
        self.stored = update["$set"]


class FakeDB:
    def __init__(self, inv):
        self.invoices = FakeCollection(inv)
        self.invoice_files = FakeFiles()


async def main():
    inv = {"_id": "64f0a1b2c3d4e5f6a7b8c9d0", "number": "TMN-0005", "customer_id": "c1", "client_name": "Jane Smith",
           "client_email": "jane@example.com", "client_address": "1 Road", "items": [
               {"description": "Exterior repaint — walls", "amount": 850.0},
               {"description": "Gloss woodwork", "amount": 320.0}],
           "total": 1170.0, "due_date": "2026-10-01", "status": "sent"}
    fake = FakeDB(inv)
    s.db = fake
    captured = {}

    async def fake_send(**kw):
        captured.update(kw)
        return "test-email-id"

    s.send_email = fake_send
    from starlette.requests import Request
    # reproduce the owner's real case: admin browses from the platform app-view domain —
    # the email link must STILL point at the public site origin (FRONTEND_URL)
    scope = {"type": "http", "method": "POST", "path": "/", "headers": [
        (b"host", b"view.emergentcf.cloud"),
        (b"x-forwarded-proto", b"https")], "query_string": b""}
    request = Request(scope)
    pdf = base64.b64encode(b"%PDF-fake").decode()
    body = s.InvoiceEmailInput(to="jane@example.com", pdf_base64=pdf, filename="TMN-0005.pdf")
    res = await s.admin_email_invoice("64f0a1b2c3d4e5f6a7b8c9d0", body, request, admin={})
    html = captured["html"]
    public = s.FRONTEND_URL.rstrip("/")
    url = f"{public}/api/invoices/download/{fake.invoice_files.stored['token']}"
    checks = {
        "button in email html": "DOWNLOAD INVOICE PDF" in html,
        "link uses PUBLIC origin, not browsing host": url in html and "emergentcf" not in html,
        "attachment still present": captured.get("attachments") and captured["attachments"][0]["filename"] == "TMN-0005.pdf",
        "token stored": bool(fake.invoice_files.stored and fake.invoice_files.stored.get("token")),
    }
    for name, ok in checks.items():
        print(("PASS" if ok else "FAIL"), "-", name)
    with open("/tmp/email_preview.html", "w") as f:
        f.write(html)
    print("preview written to /tmp/email_preview.html")
    print("SUMMARY:", "ALL PASS" if all(checks.values()) else "FAILURES")

asyncio.run(main())
