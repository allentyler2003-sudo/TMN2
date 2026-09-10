import asyncio, base64, json, os, re
import httpx
import motor.motor_asyncio
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
results = []

def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("PASS" if ok else "FAIL"), "-", name, extra)

TINY_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF"
PDF_B64 = base64.b64encode(TINY_PDF).decode()

c = httpx.Client(timeout=60)

# 0. clean any leftovers from previous partial runs
async def pre_clean():
    m = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    async for inv in db.invoices.find({"items.description": "E2E test - download link"}):
        await db.invoice_files.delete_one({"invoice_id": str(inv["_id"])})
        await db.messages.delete_many({"customer_id": inv.get("customer_id"), "text": {"$regex": "has been sent to you"}})
        await db.invoices.delete_one({"_id": inv["_id"]})
    m.close()
asyncio.run(pre_clean())
print("pre-clean done")

# 1. admin login
r = c.post(f"{API}/api/auth/login", json={"email": "admin@tmndecorating.co.uk", "password": "TMN-Admin-2026!"})
check("admin login", r.status_code == 200)

# 2. find test customer
r = c.get(f"{API}/api/admin/customers")
cust = next((u for u in r.json() if u.get("email") == "customer@test.co.uk"), None)
check("find customer", cust is not None)
cid = cust.get("id") or cust.get("_id")

# 3. create invoice
r = c.post(f"{API}/api/admin/invoices", json={
    "customer_id": cid, "items": [{"description": "E2E test - download link", "amount": 123.45}],
    "due_date": "2026-10-01", "status": "draft"})
check("create invoice", r.status_code in (200, 201), r.text[:120])
inv = r.json()
iid = inv.get("id") or inv.get("_id")

# 4. send-to-client: expect invoice JSON back (restored tail) + portal chat message
r = c.post(f"{API}/api/admin/invoices/{iid}/send", json={})
body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
check("send returns invoice json", r.status_code == 200 and body.get("number"), f"status={r.status_code} body={str(body)[:120]}")

# 5. email with PDF -> ok + attached, Host = public host
r = c.post(f"{API}/api/admin/invoices/{iid}/email", json={"to": "delivered@resend.dev", "pdf_base64": PDF_B64, "filename": f"{inv.get('number','TMN-TEST')}.pdf"})
em = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
check("email sent + attached", r.status_code == 200 and em.get("ok") and em.get("attached"), f"status={r.status_code} {str(em)[:150]}")

# 6. fetch stored token from db
async def get_rec():
    m = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    rec = await db.invoice_files.find_one({"invoice_id": iid})
    msg = await db.messages.find_one({"customer_id": cid, "text": {"$regex": "has been sent to you"}})
    m.close()
    return rec, msg
rec, msg = asyncio.run(get_rec())
check("portal chat message dropped by /send", msg is not None, (msg or {}).get("text", "")[:80])
check("pdf stored with token", rec is not None and rec.get("token"))

# 7. public download link roundtrip (no auth)
if rec:
    url = f"{API}/api/invoices/download/{rec['token']}"
    r2 = httpx.get(url, timeout=30)
    cd = r2.headers.get("content-disposition", "")
    check("download 200 + pdf bytes", r2.status_code == 200 and r2.content.startswith(b"%PDF") and r2.content == TINY_PDF,
          f"status={r2.status_code} cd={cd}")
    check("download filename header", inv.get("number", "") in cd, cd)

# 8. bad token -> friendly 404
r3 = httpx.get(f"{API}/api/invoices/download/bogus-token-xyz", timeout=30)
check("bad token 404 friendly", r3.status_code == 404 and "fresh copy" in r3.text, r3.text[:100])

# 9. cleanup test data
async def clean():
    from bson import ObjectId
    m = motor.motor_asyncio.AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    await db.invoices.delete_one({"_id": ObjectId(iid)})
    await db.invoice_files.delete_one({"invoice_id": iid})
    await db.messages.delete_one({"customer_id": cid, "text": {"$regex": "has been sent to you"}})
    m.close()
asyncio.run(clean())
print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print("SUMMARY:", "ALL PASS" if not fails else f"FAILURES: {fails}")
