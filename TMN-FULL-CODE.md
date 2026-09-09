# TMN Decorating & Maintenance — Full Source Code

Full-stack app: React frontend + FastAPI backend + MongoDB.

## How to run it yourself

### Prerequisites
- Node.js 18+, Yarn  (`npm install -g yarn`)
- Python 3.11+
- A MongoDB database — free tier at mongodb.com (Atlas) works

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
# create backend/.env — see .env.example below — then:
uvicorn server:app --host 0.0.0.0 --port 8001
```

### 2. Frontend
```bash
cd frontend
yarn install
yarn build        # produces frontend/build — host this on any static host
yarn start        # or run the dev server
```

### 3. Environment variables (backend/.env — NEVER commit real keys)
All values below are placeholders. MONGO_URL from your Atlas cluster.
STRIPE keys from dashboard.stripe.com (test then live). EMERGENT_LLM_KEY only works inside Emergent — for self-hosting, use your own OpenAI key and swap the LlmChat call for the OpenAI SDK.

### 4. Important notes
- `REACT_APP_BACKEND_URL` must point at your backend's public https URL in frontend/.env at build time.
- Cookies use Secure/SameSite=None — serve both frontend and backend over HTTPS.
- The admin account is seeded on first backend start from ADMIN_EMAIL/ADMIN_PASSWORD.
- Images: gallery uses Unsplash/Pexels URLs (replace with your own photos).
- Videos: your brand animations live in frontend/public/videos/ (included in the zip).

---

# FILE: backend/.env.example
```env
MONGO_URL="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
DB_NAME="tmn_database"
CORS_ORIGINS="https://your-domain.co.uk"
JWT_SECRET="paste-a-long-random-hex-string-here"
ADMIN_EMAIL="admin@tmndecorating.co.uk"
ADMIN_PASSWORD="choose-a-strong-password"
FRONTEND_URL="https://your-domain.co.uk"
STRIPE_SECRET_KEY="sk_live_or_test_key_from_stripe_dashboard"
STRIPE_PUBLISHABLE_KEY="pk_live_or_test_key_from_stripe_dashboard"
STRIPE_ACCOUNT_ID="acct_xxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxx"
STRIPE_MODE="test"
SENDER_EMAIL="onboarding@resend.dev"
RESEND_API_KEY="re_xxxxxxxx"
EMERGENT_LLM_KEY="sk-emergent-xxxx (only valid inside Emergent; use your own OpenAI key when self-hosting)"
```

# FILE: backend/server.py
```
from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import json
import bcrypt
import jwt
import logging
import stripe
import resend
import asyncio
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------- helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: str, email: str, token_type: str) -> str:
    exp = datetime.now(timezone.utc) + (
        timedelta(minutes=15) if token_type == "access" else timedelta(days=7)
    )
    payload = {"sub": user_id, "email": email, "type": token_type, "exp": exp}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, user_id: str, email: str):
    response.set_cookie("access_token", create_token(user_id, email, "access"),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", create_token(user_id, email, "refresh"),
                        httponly=True, secure=True, samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "customer"),
        "created_at": user.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


def msg_doc(customer_id: str, sender: str, text: str) -> dict:
    return {
        "customer_id": customer_id,
        "sender": sender,
        "text": text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by_customer": sender == "customer",
        "read_by_admin": sender == "admin",
    }


def msg_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "sender": doc["sender"],
        "text": doc["text"],
        "created_at": doc["created_at"],
    }


# ---------- models ----------

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=100)


class LoginInput(BaseModel):
    email: str
    password: str


class MessageInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class AdminReplyInput(BaseModel):
    customer_id: str
    text: str = Field(min_length=1, max_length=2000)


# ---------- auth endpoints ----------

@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.strip().lower()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    doc = {
        "name": input.name.strip(),
        "email": email,
        "password_hash": hash_password(input.password),
        "role": "customer",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    set_auth_cookies(response, str(doc["_id"]), email)
    await send_owner_email(
        "New customer registered — TMN website",
        f"<p><b>{doc['name']}</b> ({doc['email']}) just created an account on your website.</p>",
    )
    return public_user(doc)


@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.strip().lower()
    identifier = f"{request.client.host}:{email}"
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("locked_until"):
        locked_until = attempt["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until)
        if locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(input.password, user.get("password_hash", "")):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1},
             "$set": {"locked_until": datetime.now(timezone.utc) + timedelta(minutes=15)}
             if attempt and attempt.get("count", 0) + 1 >= 5 else {}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    await db.login_attempts.delete_many({"identifier": identifier})
    set_auth_cookies(response, str(user["_id"]), email)
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": __import__("bson").ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        set_auth_cookies(response, str(user["_id"]), user["email"])
        return public_user(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ---------- customer chat ----------

@api_router.get("/messages")
async def get_my_messages(user: dict = Depends(get_current_user)):
    docs = await db.messages.find({"customer_id": str(user["_id"])}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many(
        {"customer_id": str(user["_id"]), "sender": "admin", "read_by_customer": False},
        {"$set": {"read_by_customer": True}},
    )
    return [msg_public(d) for d in docs]


@api_router.post("/messages")
async def send_message(input: MessageInput, user: dict = Depends(get_current_user)):
    doc = msg_doc(str(user["_id"]), "customer", input.text)
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    await send_owner_email(
        f"New message from {user.get('name', 'a customer')} — TMN website",
        f"<p><b>{user.get('name')}</b> ({user.get('email')}) sent you a message:</p>"
        f"<p style='white-space:pre-wrap'>{input.text}</p>",
    )
    return msg_public(doc)


# ---------- admin: customers & all messages ----------

@api_router.get("/admin/customers")
async def admin_customers(admin: dict = Depends(require_admin)):
    customers = await db.users.find({"role": "customer"}).sort("created_at", -1).to_list(1000)
    out = []
    for c in customers:
        cid = str(c["_id"])
        last = await db.messages.find({"customer_id": cid}).sort("created_at", -1).to_list(1)
        unread = await db.messages.count_documents(
            {"customer_id": cid, "sender": "customer", "read_by_admin": False}
        )
        total = await db.messages.count_documents({"customer_id": cid})
        out.append({
            "id": cid,
            "name": c.get("name", ""),
            "email": c.get("email", ""),
            "created_at": c.get("created_at"),
            "last_message": msg_public(last[0]) if last else None,
            "unread": unread,
            "total_messages": total,
        })
    return out


@api_router.get("/admin/messages")
async def admin_messages(customer_id: str, admin: dict = Depends(require_admin)):
    docs = await db.messages.find({"customer_id": customer_id}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many(
        {"customer_id": customer_id, "sender": "customer", "read_by_admin": False},
        {"$set": {"read_by_admin": True}},
    )
    return [msg_public(d) for d in docs]


@api_router.post("/admin/messages")
async def admin_reply(input: AdminReplyInput, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    doc = msg_doc(input.customer_id, "admin", input.text)
    result = await db.messages.insert_one(doc)
    doc["_id"] = result.inserted_id
    return msg_public(doc)


@api_router.get("/admin/stats")
async def admin_stats(admin: dict = Depends(require_admin)):
    return {
        "customers": await db.users.count_documents({"role": "customer"}),
        "messages": await db.messages.count_documents({}),
        "unread": await db.messages.count_documents({"sender": "customer", "read_by_admin": False}),
    }


# ---------- admin: jobs, notes & invoices ----------

JOB_STATUSES = {"scheduled", "in progress", "completed"}
INVOICE_STATUSES = {"draft", "sent", "paid"}


def job_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "title": doc["title"],
        "description": doc.get("description", ""),
        "scheduled_date": doc.get("scheduled_date", ""),
        "status": doc.get("status", "scheduled"),
        "created_at": doc.get("created_at"),
    }


def note_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "text": doc["text"],
        "created_at": doc["created_at"],
    }


def invoice_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "number": doc["number"],
        "items": doc.get("items", []),
        "total": doc.get("total", 0),
        "due_date": doc.get("due_date", ""),
        "status": doc.get("status", "draft"),
        "created_at": doc.get("created_at"),
    }


class JobInput(BaseModel):
    customer_id: str
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    scheduled_date: str = Field(min_length=10, max_length=10)
    status: str = "scheduled"


class JobUpdateInput(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    scheduled_date: Optional[str] = None
    status: Optional[str] = None


class NoteInput(BaseModel):
    customer_id: str
    text: str = Field(min_length=1, max_length=2000)


class InvoiceItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)


class InvoiceInput(BaseModel):
    customer_id: str
    items: List[InvoiceItemInput] = Field(min_length=1)
    due_date: str = Field(min_length=10, max_length=10)
    status: str = "draft"


class InvoiceUpdateInput(BaseModel):
    status: Optional[str] = None
    due_date: Optional[str] = None


@api_router.get("/admin/jobs")
async def admin_list_jobs(customer_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {"customer_id": customer_id} if customer_id else {}
    docs = await db.jobs.find(query).sort("scheduled_date", -1).to_list(1000)
    return [job_public(d) for d in docs]


@api_router.post("/admin/jobs")
async def admin_create_job(input: JobInput, admin: dict = Depends(require_admin)):
    if input.status not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid job status")
    target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    doc = {
        "customer_id": input.customer_id,
        "title": input.title.strip(),
        "description": input.description.strip(),
        "scheduled_date": input.scheduled_date,
        "status": input.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.jobs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return job_public(doc)


@api_router.patch("/admin/jobs/{job_id}")
async def admin_update_job(job_id: str, input: JobUpdateInput, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in JOB_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid job status")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.jobs.find_one_and_update(
        {"_id": __import__("bson").ObjectId(job_id)}, {"$set": updates}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return job_public(result)


@api_router.delete("/admin/jobs/{job_id}")
async def admin_delete_job(job_id: str, admin: dict = Depends(require_admin)):
    result = await db.jobs.delete_one({"_id": __import__("bson").ObjectId(job_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@api_router.get("/admin/notes")
async def admin_list_notes(customer_id: str, admin: dict = Depends(require_admin)):
    docs = await db.notes.find({"customer_id": customer_id}).sort("created_at", -1).to_list(1000)
    return [note_public(d) for d in docs]


@api_router.post("/admin/notes")
async def admin_create_note(input: NoteInput, admin: dict = Depends(require_admin)):
    doc = {
        "customer_id": input.customer_id,
        "text": input.text.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.notes.insert_one(doc)
    doc["_id"] = result.inserted_id
    return note_public(doc)


@api_router.delete("/admin/notes/{note_id}")
async def admin_delete_note(note_id: str, admin: dict = Depends(require_admin)):
    result = await db.notes.delete_one({"_id": __import__("bson").ObjectId(note_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}


@api_router.get("/admin/invoices")
async def admin_list_invoices(customer_id: Optional[str] = None, admin: dict = Depends(require_admin)):
    query = {"customer_id": customer_id} if customer_id else {}
    docs = await db.invoices.find(query).sort("created_at", -1).to_list(1000)
    return [invoice_public(d) for d in docs]


@api_router.post("/admin/invoices")
async def admin_create_invoice(input: InvoiceInput, admin: dict = Depends(require_admin)):
    if input.status not in INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")
    target = await db.users.find_one({"_id": __import__("bson").ObjectId(input.customer_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Customer not found")
    items = [{"description": i.description.strip(), "amount": round(i.amount, 2)} for i in input.items]
    total = round(sum(i["amount"] for i in items), 2)
    count = await db.invoices.count_documents({})
    doc = {
        "customer_id": input.customer_id,
        "number": f"TMN-{count + 1:04d}",
        "items": items,
        "total": total,
        "due_date": input.due_date,
        "status": input.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.invoices.insert_one(doc)
    doc["_id"] = result.inserted_id
    return invoice_public(doc)


@api_router.patch("/admin/invoices/{invoice_id}")
async def admin_update_invoice(invoice_id: str, input: InvoiceUpdateInput, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in input.model_dump().items() if v is not None}
    if "status" in updates and updates["status"] not in INVOICE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid invoice status")
    result = await db.invoices.find_one_and_update(
        {"_id": __import__("bson").ObjectId(invoice_id)}, {"$set": updates}, return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice_public(result)


# ---------- customer: my jobs & invoices ----------

@api_router.get("/my/jobs")
async def my_jobs(user: dict = Depends(get_current_user)):
    docs = await db.jobs.find({"customer_id": str(user["_id"])}).sort("scheduled_date", -1).to_list(1000)
    return [job_public(d) for d in docs]


@api_router.get("/my/invoices")
async def my_invoices(user: dict = Depends(get_current_user)):
    docs = await db.invoices.find({"customer_id": str(user["_id"])}).sort("created_at", -1).to_list(1000)
    return [invoice_public(d) for d in docs]


# ---------- admin: full client records & rename ----------

class CustomerUpdateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)


@api_router.patch("/admin/customers/{customer_id}")
async def admin_update_customer(customer_id: str, input: CustomerUpdateInput, admin: dict = Depends(require_admin)):
    result = await db.users.find_one_and_update(
        {"_id": __import__("bson").ObjectId(customer_id)},
        {"$set": {"name": input.name.strip()}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    return public_user(result)


@api_router.get("/admin/clients")
async def admin_clients(admin: dict = Depends(require_admin)):
    customers = await db.users.find({"role": "customer"}).sort("created_at", -1).to_list(1000)
    out = []
    for c in customers:
        cid = str(c["_id"])
        jobs = [job_public(d) for d in await db.jobs.find({"customer_id": cid}).sort("scheduled_date", -1).to_list(500)]
        notes = [note_public(d) for d in await db.notes.find({"customer_id": cid}).sort("created_at", -1).to_list(500)]
        invoices = [invoice_public(d) for d in await db.invoices.find({"customer_id": cid}).sort("created_at", -1).to_list(500)]
        messages = [msg_public(d) for d in await db.messages.find({"customer_id": cid}).sort("created_at", 1).to_list(2000)]
        out.append({
            **public_user(c),
            "jobs": jobs,
            "notes": notes,
            "invoices": invoices,
            "messages": messages,
            "total_invoiced": round(sum(i["total"] for i in invoices if i["status"] != "draft"), 2),
            "total_unpaid": round(sum(i["total"] for i in invoices if i["status"] != "paid"), 2),
        })
    return out


# ---------- stripe payments & email notifications ----------

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


async def send_owner_email(subject: str, html: str):
    key = os.environ.get("RESEND_API_KEY")
    if not key:
        logger.info("RESEND_API_KEY not set — email skipped: %s", subject)
        return
    try:
        resend.api_key = key
        params = {
            "from": SENDER_EMAIL,
            "to": [os.environ.get("ADMIN_EMAIL", "admin@tmndecorating.co.uk")],
            "subject": subject,
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error("Email send failed: %s", e)


async def _mark_invoice_paid(session_id: str, record: dict, stripe_session=None):
    updated = await db.payment_transactions.find_one_and_update(
        {"session_id": session_id, "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid",
                  "stripe_payment_intent_id": getattr(stripe_session, "payment_intent", None),
                  "updated_at": datetime.now(timezone.utc)}},
    )
    if not updated:
        return
    invoice_id = record.get("invoice_id")
    if invoice_id:
        await db.invoices.update_one(
            {"_id": __import__("bson").ObjectId(invoice_id)},
            {"$set": {"status": "paid"}},
        )
        inv = await db.invoices.find_one({"_id": __import__("bson").ObjectId(invoice_id)})
        cust = await db.users.find_one({"_id": __import__("bson").ObjectId(record.get("customer_id"))})
        if inv and cust:
            await send_owner_email(
                f"Invoice {inv['number']} paid — {fmtMoneyLite(inv['total'])}",
                f"<p>Invoice <b>{inv['number']}</b> from {cust.get('name')} was paid: <b>{fmtMoneyLite(inv['total'])}</b>.</p>",
            )


def fmtMoneyLite(n):
    return f"£{n:,.2f}"


@api_router.post("/invoices/{invoice_id}/checkout")
async def invoice_checkout(invoice_id: str, request: Request, user: dict = Depends(get_current_user)):
    invoice = await db.invoices.find_one({"_id": __import__("bson").ObjectId(invoice_id)})
    if not invoice or invoice["customer_id"] != str(user["_id"]):
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.get("status") == "paid":
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    if invoice.get("status") == "draft":
        raise HTTPException(status_code=400, detail="This invoice is not payable yet")

    body = await request.json()
    origin = body.get("origin_url") or os.environ.get("FRONTEND_URL", "").rstrip("/")

    product = None
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == "tmn_invoice_payment":
            product = p
            break
    if product is None:
        product = stripe.Product.create(
            name="TMN invoice payment",
            metadata={"managed_by": "emergent", "emergent_product_id": "tmn_invoice_payment"},
        )
    price = stripe.Price.create(
        product=product.id,
        unit_amount=round(invoice["total"] * 100),
        currency="gbp",
    )

    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="payment",
        success_url=f"{origin}/account?payment=success&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/account?payment=cancelled",
        metadata={"invoice_id": invoice_id, "customer_id": str(user["_id"])},
    )
    try:
        session = stripe.checkout.Session.create(automatic_tax={"enabled": True}, **kwargs)
    except stripe.error.StripeError:
        session = stripe.checkout.Session.create(**kwargs)

    await db.payment_transactions.insert_one({
        "session_id": session.id,
        "invoice_id": invoice_id,
        "customer_id": str(user["_id"]),
        "amount": invoice["total"],
        "currency": "gbp",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    return {"checkout_url": session.url, "session_id": session.id}


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    record = await db.payment_transactions.find_one({"session_id": session_id})
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _mark_invoice_paid(session_id, record, s)
                record = await db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return {
        "session_id": record["session_id"],
        "status": record["status"],
        "payment_status": record["payment_status"],
    }


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, os.environ.get("STRIPE_WEBHOOK_SECRET", ""))
    except (stripe.error.SignatureVerificationError, ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t == "checkout.session.completed":
        record = await db.payment_transactions.find_one({"session_id": obj["id"]})
        if record:
            await _mark_invoice_paid(obj["id"], record, None)
        else:
            await db.payment_transactions.update_one(
                {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
                {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                          "updated_at": datetime.now(timezone.utc)}},
            )
    elif t == "checkout.session.async_payment_failed":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "failed", "payment_status": "failed", "updated_at": datetime.now(timezone.utc)}},
        )
    elif t == "checkout.session.expired":
        await db.payment_transactions.update_one(
            {"session_id": obj["id"]},
            {"$set": {"status": "expired", "payment_status": "expired", "updated_at": datetime.now(timezone.utc)}},
        )
    return {"status": "ok"}


# ---------- AI assistant (minor guidance chat) ----------

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_SYSTEM_PROMPT = (
    "You are the TMN Assistant for TMN Decorating & Maintenance — a friendly painting, "
    "decorating and property maintenance company based in Plymouth, UK, serving domestic "
    "and commercial customers. You give practical, honest guidance on minor painting, "
    "decorating and home-maintenance questions: paint types, sheens, preparation, drying "
    "times, colour pairing, common repairs and upkeep. Keep answers short and clear (2-5 "
    "sentences unless steps are requested). You do not give prices, quotes, warranties or "
    "certifications — for quotes, bookings, site visits or anything needing a person, "
    "politely point the customer to WhatsApp or call 07736 325643, or email "
    "info@tmndecorating.co.uk. If a question is unrelated to painting, decorating or "
    "property maintenance, gently steer back to what TMN can help with."
)


class AiChatInput(BaseModel):
    session_id: str = Field(min_length=6, max_length=64)
    message: str = Field(min_length=1, max_length=1000)


@api_router.post("/ai/chat")
async def ai_chat(input: AiChatInput):
    async def generate():
        full = ""
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=input.session_id,
                system_message=AI_SYSTEM_PROMPT,
            ).with_model("openai", "gpt-5.4")
            async for event in chat.stream_message(UserMessage(text=input.message)):
                if isinstance(event, TextDelta):
                    full += event.content
                    yield f"data: {json.dumps({'delta': event.content})}\n\n"
                elif isinstance(event, StreamDone):
                    break
            yield f"data: {json.dumps({'done': True})}\n\n"
            now = datetime.now(timezone.utc).isoformat()
            await db.ai_chats.insert_one({"session_id": input.session_id, "role": "user", "text": input.message, "created_at": now})
            if full:
                await db.ai_chats.insert_one({"session_id": input.session_id, "role": "assistant", "text": full, "created_at": datetime.now(timezone.utc).isoformat()})
        except Exception as e:
            logger.error("AI chat error: %s", e)
            yield f"data: {json.dumps({'error': 'The assistant is unavailable right now — please WhatsApp us on 07736 325643 instead.'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------- legacy status routes ----------

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.get("/")
async def root():
    return {"message": "Hello World"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.messages.create_index("customer_id")
    await db.login_attempts.create_index("identifier")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@tmndecorating.co.uk")
    admin_password = os.environ.get("ADMIN_PASSWORD", "TMN-Admin-2026!")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "name": "TMN Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Updated admin password for {admin_email}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
```

# FILE: backend/requirements.txt
```
fastapi==0.110.1
uvicorn==0.25.0
boto3>=1.34.129
requests-oauthlib>=2.0.0
cryptography>=42.0.8
python-dotenv>=1.0.1
pymongo==4.6.3
pydantic>=2.6.4
email-validator>=2.2.0
pyjwt>=2.10.1
bcrypt==4.1.3
passlib>=1.7.4
tzdata>=2024.2
motor==3.3.1
pytest>=8.0.0
pytest-xdist>=3.6.0
black>=24.1.1
isort>=5.13.2
flake8>=7.0.0
mypy>=1.8.0
python-jose>=3.3.0
requests>=2.31.0
pandas>=2.2.0
numpy>=1.26.0
python-multipart>=0.0.9
jq>=1.6.0
typer>=0.9.0
emergentintegrations==0.2.0
stripe>=14.0.0
resend>=2.0.0
```

# FILE: frontend/package.json
```
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@hookform/resolvers": "5.0.1",
    "@radix-ui/react-accordion": "1.2.8",
    "@radix-ui/react-alert-dialog": "1.1.11",
    "@radix-ui/react-aspect-ratio": "1.1.4",
    "@radix-ui/react-avatar": "1.1.7",
    "@radix-ui/react-checkbox": "1.2.3",
    "@radix-ui/react-collapsible": "1.1.8",
    "@radix-ui/react-context-menu": "2.2.12",
    "@radix-ui/react-dialog": "1.1.11",
    "@radix-ui/react-dropdown-menu": "2.1.12",
    "@radix-ui/react-hover-card": "1.1.11",
    "@radix-ui/react-label": "2.1.4",
    "@radix-ui/react-menubar": "1.1.12",
    "@radix-ui/react-navigation-menu": "1.2.10",
    "@radix-ui/react-popover": "1.1.11",
    "@radix-ui/react-progress": "1.1.4",
    "@radix-ui/react-radio-group": "1.3.4",
    "@radix-ui/react-scroll-area": "1.2.6",
    "@radix-ui/react-select": "2.2.2",
    "@radix-ui/react-separator": "1.1.4",
    "@radix-ui/react-slider": "1.3.2",
    "@radix-ui/react-slot": "1.2.0",
    "@radix-ui/react-switch": "1.2.2",
    "@radix-ui/react-tabs": "1.1.9",
    "@radix-ui/react-toast": "1.2.11",
    "@radix-ui/react-toggle": "1.1.6",
    "@radix-ui/react-toggle-group": "1.1.7",
    "@radix-ui/react-tooltip": "1.2.4",
    "@tanstack/react-query": "5.56.2",
    "axios": "1.18.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "cmdk": "1.1.1",
    "cra-template": "1.2.0",
    "date-fns": "4.1.0",
    "dayjs": "1.11.13",
    "embla-carousel-react": "8.6.0",
    "framer-motion": "11.18.0",
    "input-otp": "1.4.2",
    "jspdf": "^4.2.1",
    "lenis": "^1.3.26",
    "lodash": "4.18.1",
    "lucide-react": "0.516.0",
    "next-themes": "0.4.6",
    "react": "19.0.0",
    "react-day-picker": "8.10.1",
    "react-dom": "19.0.0",
    "react-hook-form": "7.56.2",
    "react-resizable-panels": "3.0.1",
    "react-router-dom": "7.15.0",
    "react-scripts": "5.0.1",
    "recharts": "3.6.0",
    "sonner": "2.0.3",
    "swr": "2.3.8",
    "tailwind-merge": "3.2.0",
    "tailwindcss-animate": "1.0.7",
    "vaul": "1.1.2",
    "zod": "3.24.4"
  },
  "scripts": {
    "start": "craco start",
    "build": "craco build",
    "test": "craco test"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "devDependencies": {
    "@babel/plugin-proposal-private-property-in-object": "7.21.11",
    "@craco/craco": "7.1.0",
    "@emergentbase/visual-edits": "https://assets.emergent.sh/npm/emergentbase-visual-edits-1.0.13.tgz",
    "@eslint/js": "9.23.0",
    "@types/lodash": "4.17.24",
    "autoprefixer": "10.4.20",
    "dotenv": "16.4.5",
    "eslint": "9.23.0",
    "eslint-plugin-import": "2.31.0",
    "eslint-plugin-jsx-a11y": "6.10.2",
    "eslint-plugin-react": "7.37.4",
    "eslint-plugin-react-hooks": "5.2.0",
    "globals": "15.15.0",
    "postcss": "8.5.10",
    "tailwindcss": "3.4.17"
  },
  "resolutions": {
    "react-router": "7.15.1",
    "node-forge": "1.4.0",
    "fast-uri": "3.1.2",
    "flatted": "3.4.2",
    "qs": "6.15.2",
    "diff": "4.0.4",
    "follow-redirects": "1.16.0",
    "path-to-regexp": "0.1.13",
    "rollup": "2.80.0",
    "underscore": "1.13.8",
    "@babel/plugin-transform-modules-systemjs": "7.29.4",
    "@eslint/plugin-kit": "0.3.4",
    "shell-quote": "1.9.0",
    "jsonpath": "1.3.0",
    "nth-check": "2.0.1",
    "serialize-javascript": "7.0.5",
    "uuid": "11.1.1",
    "@tootallnate/once": "2.0.1",
    "webpack-dev-server": "5.2.6",
    "resolve-url-loader": "5.0.0",
    "**/resolve-url-loader/postcss": "8.5.10",
    "**/axios/form-data": "4.0.6",
    "**/jsdom/form-data": "3.0.5",
    "**/postcss-svgo/svgo": "2.8.1",
    "**/webpack-dev-server/ws": "8.21.0",
    "**/postcss-load-config/yaml": "2.8.3",
    "**/cosmiconfig/yaml": "1.10.3",
    "**/cssnano/yaml": "1.10.3",
    "**/eslint/js-yaml": "4.3.0",
    "**/@eslint/eslintrc/js-yaml": "4.3.0",
    "**/svgo/js-yaml": "3.15.0",
    "**/@istanbuljs/load-nyc-config/js-yaml": "3.15.0",
    "**/css-loader/postcss": "8.5.10",
    "**/css-minimizer-webpack-plugin/postcss": "8.5.10",
    "**/react-scripts/postcss": "8.5.10",
    "**/filelist/minimatch": "5.1.8",
    "**/anymatch/picomatch": "2.3.2",
    "**/micromatch/picomatch": "2.3.2",
    "**/readdirp/picomatch": "2.3.2",
    "**/jest-util/picomatch": "2.3.2",
    "**/tinyglobby/picomatch": "4.0.4",
    "http-proxy-middleware": "2.0.10"
  },
  "packageManager": "yarn@1.22.22+sha512.a6b2f7906b721bba3d67d4aff083df04dad64c399707841b7acf00f6b133b7ac24255f2652fa22ae3534329dc6180534e98d17432037ff6fd140556e2bb3137e"
}
```

# FILE: frontend/tailwind.config.js
```
/** @type {import('tailwindcss').Config} */
module.exports = {
    // `overline` is a Tailwind utility; without this an app's own eyebrow-label class draws a line above the text.
    blocklist: ["overline"],
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            fontFamily: {
                display: ['"Cabinet Grotesk"', '"General Sans"', 'sans-serif'],
                body: ['"General Sans"', 'sans-serif'],
                sans: ['"General Sans"', 'sans-serif'],
                mono: ['"Space Mono"', 'ui-monospace', 'monospace']
            },
            colors: {
                ink: '#0A0A0A',
                'ink-2': '#141414',
                paper: '#F5F4F0',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                chart: {
                    '1': 'hsl(var(--chart-1))',
                    '2': 'hsl(var(--chart-2))',
                    '3': 'hsl(var(--chart-3))',
                    '4': 'hsl(var(--chart-4))',
                    '5': 'hsl(var(--chart-5))'
                }
            },
            keyframes: {
                'accordion-down': {
                    from: {
                        height: '0'
                    },
                    to: {
                        height: 'var(--radix-accordion-content-height)'
                    }
                },
                'accordion-up': {
                    from: {
                        height: 'var(--radix-accordion-content-height)'
                    },
                    to: {
                        height: '0'
                    }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out'
            }
        }
    },
    plugins: [require("tailwindcss-animate")],
};
```

# FILE: frontend/postcss.config.js
```
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

# FILE: frontend/public/index.html
```
<!doctype html>
<html lang="en-GB">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#F5F4F0" />
        <meta name="robots" content="index, follow" />
        <title>TMN Decorating &amp; Maintenance | Painter &amp; Decorator Plymouth</title>
        <meta
            name="description"
            content="Domestic & commercial painting, decorating and property maintenance in Plymouth, UK. Flawless finishes, honest upkeep. WhatsApp, call or email for a quote."
        />
        <meta
            name="keywords"
            content="painter and decorator Plymouth, painting and decorating Plymouth, property maintenance Plymouth, commercial painters Plymouth, domestic painter Devon"
        />
        <link rel="canonical" href="https://paint-property-pro.preview.emergentagent.com/" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="TMN Decorating & Maintenance" />
        <meta property="og:locale" content="en_GB" />
        <meta property="og:url" content="https://paint-property-pro.preview.emergentagent.com/" />
        <meta property="og:title" content="TMN Decorating & Maintenance | Painter & Decorator Plymouth" />
        <meta
            property="og:description"
            content="Domestic & commercial painting, decorating and property maintenance in Plymouth, UK. Flawless finishes, honest upkeep."
        />
        <meta
            property="og:image"
            content="https://images.unsplash.com/photo-1598928506311-c55ded91a20c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
        />
        <meta name="twitter:card" content="summary_large_image" />

        <link rel="icon" type="image/png" href="%PUBLIC_URL%/logo-dark.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link rel="preconnect" href="https://api.fontshare.com" crossorigin />
        <link
            href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800,900&f[]=general-sans@400,500,600&display=swap"
            rel="stylesheet"
        />
        <link
            href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap"
            rel="stylesheet"
        />
        <script type="application/ld+json">
            {
                "@context": "https://schema.org",
                "@type": "HomeAndConstructionBusiness",
                "name": "TMN Decorating & Maintenance",
                "description": "Domestic and commercial painting, decorating and property maintenance based in Plymouth, UK.",
                "telephone": "+447736325643",
                "email": "info@tmndecorating.co.uk",
                "url": "https://paint-property-pro.preview.emergentagent.com/",
                "image": "https://paint-property-pro.preview.emergentagent.com/logo-dark.png",
                "priceRange": "££",
                "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "Plymouth",
                    "addressRegion": "Devon",
                    "addressCountry": "GB"
                },
                "areaServed": {
                    "@type": "City",
                    "name": "Plymouth"
                }
            }
        </script>
        <script>window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);</script>
        <script src="https://assets.emergent.sh/scripts/emergent-main.js"></script>
    </head>
    <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="root"></div>
        <script>
            !(function (t, e) {
                var o, n, p, r;
                e.__SV ||
                    ((window.posthog = e),
                    (e._i = []),
                    (e.init = function (i, s, a) {
                        function g(t, e) {
                            var o = t.split(".");
                            2 == o.length && ((t = o[0]), (e = o[1])),
                                (t[e] = function () {
                                    t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
                                });
                        }
                        ((p = t.createElement("script")).type = "text/javascript"),
                            (p.crossOrigin = "anonymous"),
                            (p.async = !0),
                            (p.src =
                                s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") +
                                "/static/array.js"),
                            (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r);
                        var u = e;
                        for (
                            void 0 !== a ? (u = e[a] = []) : (a = "posthog"),
                                u.people = u.people || [],
                                u.toString = function (t) {
                                    var e = u.toString();
                                    return (
                                        (e = e.substring(0, e.length - a.length - 1)) + "." + t + " (stub)"
                                    );
                                },
                                o =
                                    "init me ws ys ps bs capture je Di ks register register_once register_for_session unregister unregister_for_session Ps getFeatureFlag getFeatureFlagPayload isFeatureEnabled onFeatureFlags onSurveysLoaded getEarlyAccessFeatures getEarlyAccessFeatureEnrollment isEnabled getProperty setProperty getDistinctId getGroups getSessionProperty get_distinct_id getGroups get_session_props getSessionProperty startSessionRecording stopSessionRecording sessionRecordingStarted captureTraceFeedback captureTraceMetric".split(
                                        " ",
                                    ),
                                n = 0;
                            n < o.length;
                            n++
                        )
                            g(u, o[n]);
                        e._i.push([i, s, a]);
                    }),
                    (e.__SV = 1));
            })(document, window.posthog || []);
            posthog.init("phc_DbsPb39SRc8z3EiQ6Dhj6ikv4H4rTKcht9d4sZSesceP", {
                api_host: "https://ap.emergent.sh",
                person_profiles: "identified_only",
                session_recording: {
                    recordCrossOriginIframes: true,
                    capturePerformance: false,
                },
            });
        </script>
    </body>
</html>
```

# FILE: frontend/public/robots.txt
```
User-agent: *
Allow: /

Sitemap: https://paint-property-pro.preview.emergentagent.com/sitemap.xml
```

# FILE: frontend/public/sitemap.xml
```
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://paint-property-pro.preview.emergentagent.com/</loc>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>
```

# FILE: frontend/src/index.js
```
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

# FILE: frontend/src/index.css
```
@tailwind base;
@tailwind components;
@tailwind utilities;

html {
    scroll-behavior: auto;
}

body {
    margin: 0;
    background: #f5f4f0;
    color: #0a0a0a;
    font-family: "General Sans", sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
}

::selection {
    background: #0a0a0a;
    color: #f5f4f0;
}

::-webkit-scrollbar {
    width: 10px;
}
::-webkit-scrollbar-track {
    background: #f5f4f0;
}
::-webkit-scrollbar-thumb {
    background: #2e2e2e;
    border-radius: 8px;
    border: 2px solid #0a0a0a;
}
::-webkit-scrollbar-thumb:hover {
    background: #4a4a4a;
}

@layer base {
    :root {
        --background: 0 0% 4%;
        --foreground: 0 0% 96%;
        --card: 0 0% 7%;
        --card-foreground: 0 0% 96%;
        --popover: 0 0% 4%;
        --popover-foreground: 0 0% 96%;
        --primary: 0 0% 96%;
        --primary-foreground: 0 0% 4%;
        --secondary: 0 0% 15%;
        --secondary-foreground: 0 0% 96%;
        --muted: 0 0% 15%;
        --muted-foreground: 0 0% 64%;
        --accent: 0 0% 15%;
        --accent-foreground: 0 0% 96%;
        --destructive: 0 84.2% 60.2%;
        --destructive-foreground: 0 0% 98%;
        --border: 0 0% 15%;
        --input: 0 0% 15%;
        --ring: 0 0% 96%;
        --radius: 0.5rem;
    }
}

@layer base {
    * {
        @apply border-border;
    }
    body {
        @apply bg-background text-foreground;
    }
}
```

# FILE: frontend/src/App.css
```
/* ---------- outline type ---------- */
.text-outline {
    -webkit-text-stroke: 1.5px rgba(255, 255, 255, 0.9);
    color: transparent;
}
.text-outline-faint {
    -webkit-text-stroke: 1px rgba(10, 10, 10, 0.55);
    color: transparent;
}
.text-outline-ink {
    -webkit-text-stroke: 1.5px rgba(10, 10, 10, 0.9);
    color: transparent;
}

/* ---------- film grain ---------- */
.grain::before {
    content: "";
    position: fixed;
    inset: -50%;
    z-index: 70;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 250 250' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.05;
    animation: grain-shift 0.9s steps(4) infinite;
}
@keyframes grain-shift {
    0% { transform: translate(0, 0); }
    25% { transform: translate(-2%, 3%); }
    50% { transform: translate(3%, -2%); }
    75% { transform: translate(-3%, -3%); }
    100% { transform: translate(2%, 2%); }
}

/* ---------- marquee ---------- */
@keyframes marquee-x {
    to {
        transform: translateX(-50%);
    }
}
.animate-marquee {
    animation: marquee-x 32s linear infinite;
}
.marquee-mask {
    mask-image: linear-gradient(
        to right,
        transparent,
        black 8%,
        black 92%,
        transparent
    );
}

/* ---------- custom cursor ---------- */
@media (pointer: fine) {
    body.cursor-ready,
    body.cursor-ready a,
    body.cursor-ready button,
    body.cursor-ready textarea,
    body.cursor-ready [data-cursor] {
        cursor: none;
    }
}
.cursor-dot,
.cursor-ring {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 90;
    pointer-events: none;
    border-radius: 9999px;
}
.cursor-dot {
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    background: #fff;
    mix-blend-mode: difference;
}
.cursor-ring {
    width: 36px;
    height: 36px;
    margin: -18px 0 0 -18px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    mix-blend-mode: difference;
    transition: width 0.25s ease, height 0.25s ease, margin 0.25s ease;
}

/* ---------- underline link sweep ---------- */
.link-sweep {
    position: relative;
}
.link-sweep::after {
    content: "";
    position: absolute;
    left: 0;
    bottom: -3px;
    height: 1px;
    width: 100%;
    background: currentColor;
    transform: scaleX(0);
    transform-origin: right;
    transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}
.link-sweep:hover::after {
    transform: scaleX(1);
    transform-origin: left;
}

/* ---------- holo fallback (if video autoplay is blocked) ---------- */
.holo-fallback {
    background: linear-gradient(
        120deg,
        #e9e7f9,
        #d9f0ee,
        #f9e9e2,
        #e3ecf9,
        #efe6f6,
        #e9e7f9
    );
    background-size: 300% 300%;
    animation: holo-drift 18s ease-in-out infinite;
}
@keyframes holo-drift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

@media (prefers-reduced-motion: reduce) {
    .animate-marquee {
        animation: none;
    }
    .grain::before {
        animation: none;
    }
    .holo-fallback {
        animation: none;
    }
}
```

# FILE: frontend/src/App.js
```
import { Component, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import "@/App.css";
import Cursor from "@/components/Cursor";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Services from "@/components/Services";
import Work from "@/components/Work";
import About from "@/components/About";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import AiChat from "@/components/AiChat";
import Login from "@/pages/Login";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-paper p-8 text-center">
                    <p className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
                        Something went wrong — please refresh the page.
                    </p>
                </div>
            );
        }
        return this.props.children;
    }
}

function HoloBackground() {
    const videoRef = useRef(null);
    const [dead, setDead] = useState(false);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const tryPlay = () => {
            if (v.paused) v.play().catch(() => {});
        };
        const onCanPlay = () => {
            if (v.readyState >= 2) setDead(false);
            tryPlay();
        };
        const onError = () => setDead(true);
        const kick = () => tryPlay();
        v.addEventListener("canplay", onCanPlay);
        v.addEventListener("error", onError, true);
        window.addEventListener("pointerdown", kick, { passive: true });
        window.addEventListener("wheel", kick, { passive: true });
        window.addEventListener("touchstart", kick, { passive: true });
        const probe = setInterval(() => {
            if (v.readyState === 0 && v.networkState === 3) setDead(true);
            else tryPlay();
        }, 3000);
        tryPlay();
        return () => {
            v.removeEventListener("canplay", onCanPlay);
            v.removeEventListener("error", onError, true);
            window.removeEventListener("pointerdown", kick);
            window.removeEventListener("wheel", kick);
            window.removeEventListener("touchstart", kick);
            clearInterval(probe);
        };
    }, []);

    return (
        <div
            className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
            aria-hidden="true"
        >
            {dead && <div className="holo-fallback absolute inset-0" />}
            <video
                ref={videoRef}
                data-testid="holo-background-video"
                className="h-full w-full object-cover saturate-[1.25] contrast-[1.05]"
                muted
                loop
                playsInline
                preload="auto"
                poster="/videos/bg-poster.jpg"
            >
                <source src="/videos/bg-hq.webm" type="video/webm" />
                <source src="/videos/bg-hq.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-paper/55" />
        </div>
    );
}

function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
}

function Site() {
    useEffect(() => {
        const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
        window.__lenis = lenis;
        let raf;
        const loop = (t) => {
            lenis.raf(t);
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => {
            cancelAnimationFrame(raf);
            lenis.destroy();
            window.__lenis = undefined;
        };
    }, []);

    return (
        <>
            <HoloBackground />
            <div className="relative z-10">
                <Cursor />
                <Nav />
                <main>
                    <Hero />
                    <Marquee />
                    <Services />
                    <Work />
                    <About />
                    <Contact />
                </main>
                <Footer />
                <FloatingWhatsApp />
                <AiChat />
            </div>
        </>
    );
}

function Protected({ role, children }) {
    const { user } = useAuth();
    if (user === null) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-paper">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink/60">
                    Loading…
                </p>
            </div>
        );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (role === "admin" && user.role !== "admin") return <Navigate to="/account" replace />;
    if (role === "customer" && user.role === "admin") return <Navigate to="/admin" replace />;
    return children;
}

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <BrowserRouter>
                    <ScrollToTop />
                    <Routes>
                        <Route path="/" element={<Site />} />
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/account"
                            element={
                                <Protected role="customer">
                                    <Account />
                                </Protected>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <Protected role="admin">
                                    <Admin />
                                </Protected>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
```

# FILE: frontend/src/constants/site.js
```
export const SITE = {
    name: "TMN Decorating & Maintenance",
    shortName: "TMN",
    tagline:
        "Domestic & commercial painting, decorating and property maintenance, done properly.",
    phoneDisplay: "07736 325643",
    phoneHref: "tel:+447736325643",
    whatsappNumber: "447736325643",
    email: "info@tmndecorating.co.uk",
    emailHref: "mailto:info@tmndecorating.co.uk",
};

export const waLink = (text) =>
    `https://wa.me/${SITE.whatsappNumber}${
        text ? `?text=${encodeURIComponent(text)}` : ""
    }`;

export const SERVICES = [
    {
        id: "01",
        title: "Interior Painting & Decorating",
        blurb:
            "Sharp lines, smooth walls and woodwork finished with care — your home treated like our own.",
        points: [
            "Walls, ceilings & woodwork",
            "Feature walls & wallpaper",
            "Minor repairs & preparation included",
            "Clean, tidy and on schedule",
        ],
    },
    {
        id: "02",
        title: "Exterior Painting & Decorating",
        blurb:
            "Weather-ready finishes that keep facades, doors and windows looking their best, year after year.",
        points: [
            "Facades, render & masonry",
            "Doors, windows & cladding",
            "Preparation and repair first",
            "Access & safety handled",
        ],
    },
    {
        id: "03",
        title: "Commercial Painting",
        blurb:
            "Offices, shops, restaurants and communal spaces — finished around the hours that suit your business.",
        points: [
            "Offices & retail",
            "Out-of-hours working",
            "Communal & landlord spaces",
            "Minimal disruption",
        ],
    },
    {
        id: "04",
        title: "Property Maintenance",
        blurb:
            "The jobs that keep a property healthy — from plaster repairs to planned, ongoing upkeep.",
        points: [
            "Repairs & plastering",
            "Touch-ups & refreshes",
            "Planned, regular upkeep",
            "Domestic & commercial",
        ],
    },
];

export const PROJECTS = [
    {
        img: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Residential",
        title: "Luxury interior repaint",
    },
    {
        img: "https://images.unsplash.com/photo-1638885930125-85350348d266?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Detail",
        title: "Drawing room finish",
    },
    {
        img: "https://images.unsplash.com/photo-1615873968403-89e068629265?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Decorating — Feature wall",
        title: "Deep green feature wall",
    },
    {
        img: "https://images.unsplash.com/photo-1600684388091-627109f3cd60?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400",
        label: "Painting — Kitchen",
        title: "Modern kitchen finish",
    },
];
```

# FILE: frontend/src/components/Reveal.jsx
```
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1];

export function FadeUp({ children, delay = 0, className = "", ...rest }) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.9, ease: EASE, delay }}
            {...rest}
        >
            {children}
        </motion.div>
    );
}

export function MaskedLines({
    lines,
    className = "",
    lineClassName = "",
    delay = 0,
    inView = false,
    testIdPrefix = "masked-line",
}) {
    const container = {
        hidden: {},
        show: { transition: { staggerChildren: 0.12, delayChildren: delay } },
    };
    const line = {
        hidden: { y: "115%" },
        show: { y: "0%", transition: { duration: 1.05, ease: EASE } },
    };
    const MotionParent = inView ? motion.div : motion.div;
    const props = inView
        ? { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.3 } }
        : { initial: "hidden", animate: "show" };
    return (
        <MotionParent
            className={className}
            variants={container}
            data-testid={`${testIdPrefix}-group`}
        >
            {lines.map((l, i) => (
                <span
                    key={i}
                    className={`block overflow-hidden ${lineClassName}`}
                >
                    <motion.span className="block will-change-transform" variants={line}>
                        {l}
                    </motion.span>
                </span>
            ))}
        </MotionParent>
    );
}

export { EASE };
```

# FILE: frontend/src/components/Cursor.jsx
```
import { useEffect, useRef } from "react";

export default function Cursor() {
    const dotRef = useRef(null);
    const ringRef = useRef(null);

    useEffect(() => {
        if (!window.matchMedia("(pointer: fine)").matches) return;
        const dot = dotRef.current;
        const ring = ringRef.current;
        if (!dot || !ring) return;

        let x = -100;
        let y = -100;
        let rx = -100;
        let ry = -100;
        let scale = 1;
        let raf;

        const onMove = (e) => {
            x = e.clientX;
            y = e.clientY;
            if (!document.body.classList.contains("cursor-ready")) {
                document.body.classList.add("cursor-ready");
            }
        };
        const onOver = (e) => {
            const hit = e.target.closest("a, button, textarea, input, [data-cursor]");
            scale = hit ? 2.1 : 1;
        };
        const loop = () => {
            rx += (x - rx) * 0.18;
            ry += (y - ry) * 0.18;
            dot.style.transform = `translate(${x}px, ${y}px)`;
            ring.style.transform = `translate(${rx}px, ${ry}px) scale(${scale})`;
            raf = requestAnimationFrame(loop);
        };

        window.addEventListener("mousemove", onMove, { passive: true });
        window.addEventListener("mouseover", onOver, { passive: true });
        raf = requestAnimationFrame(loop);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseover", onOver);
            cancelAnimationFrame(raf);
            document.body.classList.remove("cursor-ready");
        };
    }, []);

    return (
        <>
            <div ref={dotRef} className="cursor-dot hidden md:block" aria-hidden="true" />
            <div
                ref={ringRef}
                data-testid="custom-cursor-ring"
                className="cursor-ring hidden md:block"
                aria-hidden="true"
            />
        </>
    );
}
```

# FILE: frontend/src/components/Nav.jsx
```
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { waLink } from "@/constants/site";
import { EASE } from "@/components/Reveal";

const LINKS = [
    { label: "Services", hash: "#services", testid: "nav-link-services" },
    { label: "Work", hash: "#work", testid: "nav-link-work" },
    { label: "About", hash: "#about", testid: "nav-link-about" },
    { label: "Contact", hash: "#contact", testid: "nav-link-contact" },
];

export const scrollToHash = (hash) => {
    const el = document.querySelector(hash);
    if (!el) return;
    if (window.__lenis) window.__lenis.scrollTo(hash, { offset: -72 });
    else el.scrollIntoView({ behavior: "smooth" });
};

export default function Nav() {
    const { user } = useAuth();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const go = (e, hash) => {
        e.preventDefault();
        scrollToHash(hash);
    };

    const accountHref = user
        ? user.role === "admin"
            ? "/admin"
            : "/account"
        : "/login";

    return (
        <motion.header
            initial={{ y: -90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
            className={`fixed inset-x-0 top-0 z-50 bg-paper/85 backdrop-blur-xl transition-shadow duration-500 ${
                scrolled ? "shadow-[0_1px_0_rgba(10,10,10,0.12),0_12px_40px_rgba(10,10,10,0.06)]" : ""
            }`}
        >
            <nav className="mx-auto flex h-24 max-w-[1600px] items-center justify-between px-5 sm:px-8 lg:px-12">
                <a
                    href="/"
                    data-testid="nav-brand-logo"
                    onClick={(e) => go(e, "#top")}
                    className="flex items-center gap-3"
                >
                    <img
                        src="/logo-dark.png"
                        alt="TMN Decorating & Maintenance logo"
                        className="h-16 w-16 object-contain sm:h-[4.5rem] sm:w-[4.5rem]"
                    />
                    <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] text-ink sm:block">
                        TMN <span className="text-ink/65">Decorating &amp; Maintenance</span>
                    </span>
                </a>

                <div className="hidden items-center gap-8 lg:flex">
                    {LINKS.map((l) => (
                        <a
                            key={l.hash}
                            href={l.hash}
                            data-testid={l.testid}
                            onClick={(e) => go(e, l.hash)}
                            className="link-sweep font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-ink/85 transition-colors hover:text-ink"
                        >
                            {l.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-2.5 sm:gap-4">
                    <a
                        href={accountHref}
                        data-testid={user ? "nav-account-link" : "nav-login-link"}
                        className="whitespace-nowrap rounded-full border border-ink/35 px-3.5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-paper sm:px-5"
                    >
                        {user
                            ? user.role === "admin"
                                ? "Admin"
                                : "My account"
                            : "Log in"}
                    </a>
                    <a
                        href={waLink("Hi TMN Decorating & Maintenance — I'd like a quote.")}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="nav-whatsapp-button"
                        className="group flex items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.04] active:scale-95 sm:px-5 sm:text-[11px]"
                    >
                        Get a quote
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-paper transition-transform duration-300 group-hover:scale-150" />
                    </a>
                </div>
            </nav>
        </motion.header>
    );
}
```

# FILE: frontend/src/components/Hero.jsx
```
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { waLink } from "@/constants/site";
import { MaskedLines } from "@/components/Reveal";
import { scrollToHash } from "@/components/Nav";

export default function Hero() {
    const sectionRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start start", "end start"],
    });
    const badgeY = useTransform(scrollYProgress, [0, 1], [0, -90]);
    const contentY = useTransform(scrollYProgress, [0, 1], [0, 120]);
    const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

    return (
        <section
            ref={sectionRef}
            id="top"
            data-testid="hero-section"
            className="relative flex min-h-[100svh] items-center overflow-hidden pb-16 pt-28 sm:pt-32"
        >
            <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-8 lg:px-12">
                <motion.div style={{ y: contentY, opacity: contentOpacity }}>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 1, delay: 0.4 }}
                        className="mb-5 max-w-xl font-mono text-[10px] uppercase leading-relaxed tracking-[0.3em] text-ink/70 sm:text-xs"
                    >
                        Domestic &amp; Commercial — Painting, Decorating &amp; Property Maintenance
                    </motion.p>

                    <h1 className="font-display text-[16vw] font-extrabold uppercase leading-[0.86] tracking-tight text-ink sm:text-[12vw] lg:text-[8.5vw]">
                        <MaskedLines
                            delay={0.25}
                            lines={[
                                <span key="a">Prepared.</span>,
                                <span key="b">Painted.</span>,
                                <span key="c" className="text-outline-ink">
                                    Protected.
                                </span>,
                            ]}
                            testIdPrefix="hero-headline"
                        />
                    </h1>

                    <motion.p
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 1 }}
                        className="mt-8 max-w-md text-base font-medium leading-relaxed text-ink/80 sm:text-lg"
                    >
                        {`Flawless finishes and honest upkeep for homes and businesses — by TMN
                        Decorating & Maintenance, based in Plymouth, UK.`}
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 1.15 }}
                        className="mt-10 flex flex-wrap items-center gap-4"
                    >
                        <a
                            href={waLink(
                                "Hi TMN Decorating & Maintenance — I'd like a quote for a project."
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="hero-cta-quote-button"
                            className="rounded-full bg-ink px-7 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.05] active:scale-95"
                        >
                            Get a quote
                        </a>
                        <a
                            href="#work"
                            data-testid="hero-cta-work-button"
                            onClick={(e) => {
                                e.preventDefault();
                                scrollToHash("#work");
                            }}
                            className="rounded-full border border-ink/30 px-7 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:border-ink hover:bg-ink/5"
                        >
                            See our work
                        </a>
                    </motion.div>
                </motion.div>

                <motion.div
                    style={{ y: badgeY }}
                    className="flex justify-center lg:justify-end lg:pr-6"
                >
                    <motion.img
                        data-testid="hero-logo-badge"
                        src="/logo-badge.png"
                        alt="TMN Decorating & Maintenance logo"
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1, y: [0, -16, 0] }}
                        transition={{
                            opacity: { duration: 1, delay: 0.6 },
                            scale: { duration: 1, delay: 0.6 },
                            y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
                        }}
                        className="h-56 w-auto object-contain drop-shadow-[0_35px_60px_rgba(10,10,10,0.18)] sm:h-72 lg:h-[420px]"
                    />
                </motion.div>
            </div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6, duration: 1 }}
                className="absolute bottom-8 right-6 hidden items-center gap-3 rotate-90 font-mono text-[10px] uppercase tracking-[0.4em] text-ink/40 lg:flex"
            >
                Scroll
                <span className="block h-px w-14 bg-ink/40" />
            </motion.div>
        </section>
    );
}
```

# FILE: frontend/src/components/Marquee.jsx
```
const ITEMS = [
    "Interior Painting",
    "Exterior Decorating",
    "Commercial Projects",
    "Property Maintenance",
];

function Sequence({ hidden }) {
    return (
        <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
            {ITEMS.map((item, i) => (
                <span key={i} className="flex items-center">
                    <span
                        className={`whitespace-nowrap px-8 font-display text-4xl font-bold uppercase tracking-tight sm:px-12 sm:text-6xl ${
                            i % 2 === 0 ? "text-ink" : "text-outline-faint"
                        }`}
                    >
                        {item}
                    </span>
                    <span className="h-2.5 w-2.5 rounded-full bg-ink/70 sm:h-3 sm:w-3" />
                </span>
            ))}
        </div>
    );
}

export default function Marquee() {
    return (
        <section
            data-testid="marquee-section"
            className="marquee-mask overflow-hidden border-y border-ink/10 py-8 sm:py-10"
        >
            <div className="animate-marquee flex w-max">
                <Sequence />
                <Sequence hidden />
            </div>
        </section>
    );
}
```

# FILE: frontend/src/components/Services.jsx
```
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ArrowUpRight } from "lucide-react";
import { SERVICES, waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

export default function Services() {
    const [open, setOpen] = useState(0);

    return (
        <section id="services" data-testid="services-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-16 flex flex-col gap-6 sm:mb-24 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                What we do — 01/04
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                                The trade,
                                <br />
                                <span className="text-outline-ink">done properly.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Four things, done to one standard. Pick a chapter — every job gets the
                            same preparation, the same finish and the same clean-up.
                        </p>
                    </FadeUp>
                </div>

                <div data-testid="service-chapters">
                    {SERVICES.map((s, i) => {
                        const isOpen = open === i;
                        return (
                            <FadeUp key={s.id} delay={i * 0.06}>
                                <div className="border-t border-ink/15 last:border-b">
                                    <button
                                        data-testid={`service-chapter-${s.id}-toggle`}
                                        onClick={() => setOpen(isOpen ? null : i)}
                                        className="group flex w-full items-center gap-5 py-7 text-left transition-colors duration-300 hover:bg-ink/[0.04] sm:gap-10 sm:py-9"
                                    >
                                        <span
                                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border font-mono text-xs tracking-[0.1em] transition-colors duration-300 ${
                                                isOpen
                                                    ? "border-ink bg-ink text-paper"
                                                    : "border-ink/25 text-ink/70 group-hover:border-ink group-hover:bg-ink group-hover:text-paper"
                                            }`}
                                        >
                                            {s.id}
                                        </span>
                                        <span
                                            className={`flex-1 font-display text-2xl font-bold uppercase tracking-tight transition-all duration-500 sm:text-4xl lg:text-5xl ${
                                                isOpen
                                                    ? "translate-x-2 text-ink"
                                                    : "text-ink group-hover:translate-x-2"
                                            }`}
                                        >
                                            {s.title}
                                        </span>
                                        <motion.span
                                            animate={{ rotate: isOpen ? 45 : 0 }}
                                            transition={{ duration: 0.4, ease: EASE }}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/25 text-ink transition-colors duration-300 group-hover:border-ink group-hover:bg-ink group-hover:text-paper"
                                        >
                                            <Plus className="h-5 w-5" strokeWidth={1.5} />
                                        </motion.span>
                                    </button>

                                    <AnimatePresence initial={false}>
                                        {isOpen && (
                                            <motion.div
                                                key="content"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.55, ease: EASE }}
                                                className="overflow-hidden"
                                                data-testid={`service-chapter-${s.id}-content`}
                                            >
                                                <div className="grid gap-8 pb-10 pl-9 pr-2 sm:grid-cols-[1fr_1.2fr] sm:gap-16 sm:pl-[4.5rem]">
                                                    <p className="max-w-md text-base font-medium leading-relaxed text-ink/80 sm:text-lg">
                                                        {s.blurb}
                                                    </p>
                                                    <div>
                                                        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                                            {s.points.map((p) => (
                                                                <li
                                                                    key={p}
                                                                    className="flex items-start gap-3 text-[15px] font-medium leading-relaxed text-ink/85"
                                                                >
                                                                    <span className="mt-[9px] block h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />
                                                                    {p}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <a
                                                            href={waLink(
                                                                `Hi TMN — I'd like a quote for ${s.title.toLowerCase()}.`
                                                            )}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            data-testid={`service-chapter-${s.id}-quote-link`}
                                                            className="mt-8 inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ink underline-offset-4 hover:underline"
                                                        >
                                                            Quote this on WhatsApp
                                                            <ArrowUpRight className="h-4 w-4" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </FadeUp>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
```

# FILE: frontend/src/components/Work.jsx
```
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { PROJECTS, waLink } from "@/constants/site";
import { FadeUp, EASE } from "@/components/Reveal";

const ASPECTS = ["aspect-[4/5]", "aspect-[3/4]", "aspect-[3/4]", "aspect-[4/5]"];

function WorkCard({ project, index }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    });
    const y = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 1, ease: EASE, delay: (index % 2) * 0.12 }}
            className={index % 2 === 1 ? "sm:mt-28" : ""}
        >
            <a
                href={waLink(
                    `Hi TMN — I saw your work and I'd like something like "${project.title}".`
                )}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`work-card-${index + 1}`}
                className="group block"
            >
                <div
                    ref={ref}
                    className={`relative overflow-hidden bg-ink/5 shadow-[0_30px_80px_rgba(10,10,10,0.14)] ${ASPECTS[index]}`}
                >
                    <motion.div style={{ y }} className="h-full w-full">
                        <motion.img
                            src={project.img}
                            alt={project.title}
                            loading="lazy"
                            initial={{ scale: 1.3 }}
                            whileInView={{ scale: 1.18 }}
                            viewport={{ once: true, amount: 0.15 }}
                            transition={{ duration: 1.4, ease: EASE }}
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.24]"
                        />
                    </motion.div>

                    <span className="absolute left-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-paper/95 font-display text-sm font-extrabold tracking-wide text-ink shadow-[0_8px_24px_rgba(10,10,10,0.18)] transition-transform duration-500 group-hover:scale-110">
                        {String(index + 1).padStart(2, "0")}
                    </span>

                    <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-between gap-3 bg-ink/90 px-5 py-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-paper backdrop-blur transition-transform duration-500 ease-out group-hover:translate-y-0">
                        <span>Like this finish?</span>
                        <span>Tap — quote on WhatsApp</span>
                    </div>
                </div>

                <div className="mt-5 flex items-baseline justify-between gap-4 border-b-2 border-ink/15 pb-4 transition-colors duration-500 group-hover:border-ink">
                    <span className="font-display text-xl font-bold uppercase tracking-tight text-ink sm:text-2xl">
                        {project.title}
                    </span>
                    <span className="whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/65">
                        {project.label}
                    </span>
                </div>
            </a>
        </motion.div>
    );
}

export default function Work() {
    return (
        <section id="work" data-testid="work-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="mb-16 flex flex-col gap-6 sm:mb-20 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                                Recent work — 04 projects, more on request
                            </p>
                        </FadeUp>
                        <FadeUp delay={0.1}>
                            <h2 className="font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl lg:text-7xl">
                                Fresh coats,
                                <br />
                                <span className="text-outline-ink">clean lines.</span>
                            </h2>
                        </FadeUp>
                    </div>
                    <FadeUp delay={0.2} className="max-w-sm">
                        <p className="text-base font-medium leading-relaxed text-ink/80">
                            Every photo is a finish we're proud of. Tap one and tell us what
                            you'd like on WhatsApp.
                        </p>
                    </FadeUp>
                </div>

                <div className="grid grid-cols-1 gap-x-10 gap-y-16 sm:grid-cols-2 sm:gap-y-8">
                    {PROJECTS.map((p, i) => (
                        <WorkCard key={i} project={p} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
```

# FILE: frontend/src/components/About.jsx
```
import { FadeUp, MaskedLines } from "@/components/Reveal";

const CHAPTERS = [
    {
        id: "01",
        title: "Preparation",
        body: "We prep like it shows — because it does. Filling, sanding and sealing long before a tin is opened.",
    },
    {
        id: "02",
        title: "Precision",
        body: "Clean lines, even coverage, no drips and no missed corners. The details are the job, not the extra.",
    },
    {
        id: "03",
        title: "Aftercare",
        body: "We leave the place spotless and the finish protected — and we're one call away if you ever need us.",
    },
];

export default function About() {
    return (
        <section
            id="about"
            data-testid="about-section"
            className="relative overflow-hidden py-24 text-ink sm:py-36"
        >
            <div className="absolute inset-0 bg-white/40" />

            <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <FadeUp>
                            <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/70 sm:text-xs">
                                The TMN standard — Plymouth, UK
                            </p>
                        </FadeUp>
                        <h2 className="max-w-3xl font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                            <MaskedLines
                                inView
                                lines={[
                                    <span key="a">A finish is only</span>,
                                    <span key="b">
                                        as good as <span className="text-outline-ink">the prep</span>
                                    </span>,
                                    <span key="c">beneath it.</span>,
                                ]}
                                testIdPrefix="about-headline"
                            />
                        </h2>
                    </div>

                    <FadeUp delay={0.25} className="shrink-0">
                        <div
                            data-cursor
                            className="flex h-40 w-40 items-center justify-center rounded-full bg-white ring-1 ring-ink/10 shadow-[0_20px_60px_rgba(10,10,10,0.14)] sm:h-52 sm:w-52"
                        >
                            <img
                                src="/logo-dark.png"
                                alt="TMN Decorating & Maintenance logo"
                                className="h-32 w-32 object-contain sm:h-40 sm:w-40"
                            />
                        </div>
                    </FadeUp>
                </div>

                <div className="mt-16 grid gap-10 sm:mt-28 md:grid-cols-3 md:gap-14">
                    {CHAPTERS.map((c, i) => (
                        <FadeUp key={c.id} delay={i * 0.12}>
                            <div
                                data-testid={`about-chapter-${c.id}`}
                                className="border-t-2 border-ink/80 pt-6"
                            >
                                <span className="font-mono text-xs font-medium tracking-[0.3em] text-ink/60">
                                    {c.id}
                                </span>
                                <h3 className="mt-4 font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl">
                                    {c.title}
                                </h3>
                                <p className="mt-4 max-w-xs text-base font-medium leading-relaxed text-ink/85">
                                    {c.body}
                                </p>
                            </div>
                        </FadeUp>
                    ))}
                </div>
            </div>
        </section>
    );
}
```

# FILE: frontend/src/components/Contact.jsx
```
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, MessageCircle, Phone, Mail } from "lucide-react";
import { SITE, waLink } from "@/constants/site";
import { FadeUp, MaskedLines, EASE } from "@/components/Reveal";

const CHANNELS = [
    {
        id: "whatsapp",
        label: "WhatsApp us",
        value: SITE.phoneDisplay,
        href: waLink("Hi TMN Decorating & Maintenance — I'd like a quote."),
        icon: MessageCircle,
        testid: "contact-whatsapp-direct-link",
    },
    {
        id: "phone",
        label: "Call us",
        value: SITE.phoneDisplay,
        href: SITE.phoneHref,
        icon: Phone,
        testid: "contact-phone-direct-link",
    },
    {
        id: "email",
        label: "Email us",
        value: SITE.email,
        href: SITE.emailHref,
        icon: Mail,
        testid: "contact-email-direct-link",
    },
];

const QUICK_SERVICES = ["Interior", "Exterior", "Commercial", "Maintenance"];

export default function Contact() {
    const [service, setService] = useState(null);
    const [note, setNote] = useState("");

    const message = `Hi TMN Decorating & Maintenance — I'd like a quote for ${
        (service || "a project").toLowerCase()
    }.${note ? ` ${note}` : ""}`;

    const send = () => {
        window.open(waLink(message), "_blank", "noopener,noreferrer");
    };

    return (
        <section id="contact" data-testid="contact-section" className="relative py-24 sm:py-36">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <FadeUp>
                    <p className="mb-6 font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/65 sm:text-xs">
                        Get in touch
                    </p>
                </FadeUp>

                <h2 className="mb-16 font-display text-4xl font-extrabold uppercase leading-[0.95] tracking-tight text-ink sm:mb-24 sm:text-6xl lg:text-8xl">
                    <MaskedLines
                        inView
                        lines={[
                            <span key="a">Have a project</span>,
                            <span key="b" className="text-outline-ink">
                                in mind?
                            </span>,
                        ]}
                        testIdPrefix="contact-headline"
                    />
                </h2>

                <div className="grid gap-16 lg:grid-cols-[1.2fr_1fr] lg:gap-24">
                    <div>
                        {CHANNELS.map((c, i) => (
                            <FadeUp key={c.id} delay={i * 0.08}>
                                <a
                                    href={c.href}
                                    target={c.id === "phone" ? undefined : "_blank"}
                                    rel="noopener noreferrer"
                                    data-testid={c.testid}
                                    className="group flex items-center justify-between gap-6 border-t border-ink/15 py-7 transition-colors duration-300 last:border-b hover:bg-ink/[0.04] sm:py-9"
                                >
                                    <span className="flex items-center gap-5 sm:gap-8">
                                        <c.icon
                                            className="h-6 w-6 text-ink/75 transition-colors group-hover:text-ink"
                                            strokeWidth={1.5}
                                        />
                                        <span className="flex flex-col">
                                            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/65">
                                                {c.label}
                                            </span>
                                            <span className="mt-1 font-display text-xl font-bold tracking-tight text-ink sm:text-3xl">
                                                {c.value}
                                            </span>
                                        </span>
                                    </span>
                                    <ArrowUpRight className="h-7 w-7 shrink-0 text-ink/50 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-ink" />
                                </a>
                            </FadeUp>
                        ))}
                    </div>

                    <FadeUp delay={0.15}>
                        <div
                            data-testid="quick-quote-card"
                            className="rounded-3xl border border-ink/10 bg-white/80 p-7 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl sm:p-10"
                        >
                            <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-ink sm:text-3xl">
                                Quick quote
                            </h3>
                            <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                Pick a service, add a line about the job, and we'll open WhatsApp
                                with your message ready to send.
                            </p>

                            <div className="mt-7 flex flex-wrap gap-2.5">
                                {QUICK_SERVICES.map((s) => {
                                    const active = service === s;
                                    return (
                                        <button
                                            key={s}
                                            data-testid={`quote-service-pill-${s.toLowerCase()}`}
                                            onClick={() => setService(active ? null : s)}
                                            className={`rounded-full border px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] transition-all duration-300 ${
                                                active
                                                    ? "border-ink bg-ink text-paper"
                                                    : "border-ink/30 text-ink/85 hover:border-ink hover:text-ink"
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>

                            <textarea
                                data-testid="quote-message-input"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Tell us about the job — rooms, walls, timings, anything."
                                rows={3}
                                className="mt-5 w-full resize-none rounded-2xl border border-ink/20 bg-transparent p-4 text-sm font-medium text-ink placeholder:text-ink/50 focus:border-ink/60 focus:outline-none"
                            />

                            <p
                                data-testid="quote-message-preview"
                                className="mt-4 min-h-[2.5rem] rounded-xl bg-ink/5 p-3 font-mono text-[11px] font-medium leading-relaxed text-ink/80"
                            >
                                {message}
                            </p>

                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.25, ease: EASE }}
                                onClick={send}
                                data-testid="quote-whatsapp-submit"
                                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper"
                            >
                                <MessageCircle className="h-4 w-4" />
                                Send on WhatsApp
                            </motion.button>
                        </div>
                    </FadeUp>
                </div>
            </div>
        </section>
    );
}
```

# FILE: frontend/src/components/Footer.jsx
```
import { SITE } from "@/constants/site";

export default function Footer() {
    return (
        <footer data-testid="footer" className="relative border-t border-ink/10 pb-24 pt-14 sm:pb-10">
            <div className="mx-auto max-w-[1600px] px-5 sm:px-8 lg:px-12">
                <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
                    <a href="#top" data-testid="footer-brand-logo" className="flex items-center gap-4">
                        <img
                            src="/logo-dark.png"
                            alt="TMN Decorating & Maintenance logo"
                            className="h-16 w-16 object-contain"
                        />
                        <span className="font-display text-sm font-bold uppercase tracking-[0.18em] text-ink">
                            TMN
                            <span className="block text-ink/65">Decorating &amp; Maintenance</span>
                        </span>
                    </a>

                    <div className="flex flex-col gap-2 font-mono text-xs font-medium uppercase tracking-[0.2em] text-ink/80 sm:items-end">
                        <span className="text-ink/60">Based in Plymouth, UK</span>
                        <a href={SITE.phoneHref} data-testid="footer-phone-link" className="transition-colors hover:text-ink">
                            {SITE.phoneDisplay}
                        </a>
                        <a href={SITE.emailHref} data-testid="footer-email-link" className="transition-colors hover:text-ink">
                            {SITE.email}
                        </a>
                        <a
                            href={`https://wa.me/${SITE.whatsappNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="footer-whatsapp-link"
                            className="transition-colors hover:text-ink"
                        >
                            WhatsApp
                        </a>
                    </div>
                </div>

                <p className="mt-12 border-t border-ink/10 pt-6 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                    © {new Date().getFullYear()} {SITE.name} — Domestic &amp; commercial painting,
                    decorating &amp; property maintenance
                </p>
            </div>
        </footer>
    );
}
```

# FILE: frontend/src/components/FloatingWhatsApp.jsx
```
import { motion } from "framer-motion";
import { waLink } from "@/constants/site";

export default function FloatingWhatsApp() {
    return (
        <motion.a
            href={waLink("Hi TMN Decorating & Maintenance — I'd like a quote.")}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="floating-whatsapp-button"
            aria-label="Chat with TMN on WhatsApp"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, type: "spring", stiffness: 260, damping: 18 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="fixed bottom-5 right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-[0_12px_30px_rgba(10,10,10,0.28)] sm:bottom-7 sm:right-7"
        >
            <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-25" />
            <svg viewBox="0 0 24 24" fill="currentColor" className="relative h-7 w-7 text-white" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
            </svg>
        </motion.a>
    );
}
```

# FILE: frontend/src/components/AiChat.jsx
```
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Send } from "lucide-react";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

function sessionId() {
    let id = localStorage.getItem("tmn-ai-session");
    if (!id) {
        id = `ai-${crypto.randomUUID()}`;
        localStorage.setItem("tmn-ai-session", id);
    }
    return id;
}

export default function AiChat() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            text: "Hi! I'm the TMN assistant. Ask me anything about painting, decorating or property upkeep — I'm great with quick guidance.",
        },
    ]);
    const [draft, setDraft] = useState("");
    const [streaming, setStreaming] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || streaming) return;
        setDraft("");
        const userMsg = { role: "user", text };
        setMessages((m) => [...m, userMsg, { role: "assistant", text: "" }]);
        setStreaming(true);
        try {
            const res = await fetch(`${API_BASE}/ai/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ session_id: sessionId(), message: text }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop();
                for (const part of parts) {
                    if (!part.startsWith("data: ")) continue;
                    const payload = JSON.parse(part.slice(6));
                    if (payload.delta) {
                        setMessages((m) => {
                            const copy = [...m];
                            copy[copy.length - 1] = {
                                role: "assistant",
                                text: copy[copy.length - 1].text + payload.delta,
                            };
                            return copy;
                        });
                    }
                    if (payload.error) {
                        setMessages((m) => {
                            const copy = [...m];
                            copy[copy.length - 1] = { role: "assistant", text: payload.error };
                            return copy;
                        });
                    }
                }
            }
        } catch (err) {
            setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                    role: "assistant",
                    text: "Connection hiccup — please try again, or WhatsApp us on 07736 325643.",
                };
                return copy;
            });
        } finally {
            setStreaming(false);
        }
    };

    const renderBold = (text) =>
        text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
            i % 2 === 1 ? (
                <strong key={i} className="font-bold">
                    {part}
                </strong>
            ) : (
                part
            )
        );

    return (
        <>
            <AnimatePresence>
                {open && (
                    <motion.div
                        data-testid="ai-chat-panel"
                        initial={{ opacity: 0, y: 24, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.96 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed bottom-[104px] right-5 z-[85] flex h-[480px] w-[calc(100vw-40px)] max-w-[360px] flex-col overflow-hidden rounded-3xl border border-ink/15 bg-white shadow-[0_30px_80px_rgba(10,10,10,0.25)] sm:right-7"
                    >
                        <div className="flex items-center justify-between bg-ink px-5 py-4 text-paper">
                            <div>
                                <p className="font-display text-sm font-bold uppercase tracking-tight">
                                    TMN Assistant
                                </p>
                                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper/60">
                                    AI · minor guidance
                                </p>
                            </div>
                            <button
                                data-testid="ai-chat-close"
                                onClick={() => setOpen(false)}
                                aria-label="Close assistant"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-paper/30 transition-colors hover:bg-paper hover:text-ink"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div
                            ref={scrollRef}
                            data-testid="ai-chat-messages"
                            className="flex-1 space-y-3 overflow-y-auto bg-paper/60 px-4 py-4"
                        >
                            {messages.map((m, i) => (
                                <div
                                    key={i}
                                    data-testid={`ai-chat-message-${m.role}`}
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed ${
                                        m.role === "user"
                                            ? "ml-auto bg-ink text-paper"
                                            : "bg-white text-ink shadow-[0_6px_18px_rgba(10,10,10,0.07)]"
                                    }`}
                                >
                                    {renderBold(m.text)}
                                </div>
                            ))}
                            {streaming && (
                                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink/40">
                                    TMN Assistant is typing…
                                </p>
                            )}
                        </div>

                        <form
                            onSubmit={send}
                            className="flex items-center gap-2 border-t border-ink/10 bg-white px-4 py-3"
                        >
                            <input
                                data-testid="ai-chat-input"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="Ask for quick advice…"
                                className="flex-1 rounded-full border border-ink/20 bg-transparent px-4 py-2.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            <button
                                type="submit"
                                data-testid="ai-chat-send"
                                disabled={!draft.trim() || streaming}
                                aria-label="Send message"
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {!open && (
                <motion.button
                    data-testid="ai-chat-button"
                    onClick={() => setOpen((o) => !o)}
                    aria-label="Open AI assistant"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 1.05, type: "spring", stiffness: 260, damping: 18 }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.94 }}
                    className="fixed bottom-[104px] right-5 z-[80] flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-[0_12px_30px_rgba(10,10,10,0.28)] sm:bottom-[108px] sm:right-7"
                >
                    <Sparkles className="h-5 w-5" />
                    <span className="absolute -left-1 -top-1 flex h-5 items-center rounded-full bg-white px-2 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-ink shadow">
                        AI
                    </span>
                </motion.button>
            )}
        </>
    );
}
```

# FILE: frontend/src/components/admin/shared.jsx
```
const STYLES = {
    scheduled: "border border-ink/30 text-ink/70",
    "in progress": "bg-ink text-paper",
    completed: "bg-ink/10 text-ink",
    draft: "border border-ink/30 text-ink/70",
    sent: "bg-ink/10 text-ink",
    paid: "bg-ink text-paper",
};

export function StatusBadge({ value }) {
    return (
        <span
            className={`inline-block rounded-full px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${
                STYLES[value] || "border border-ink/30 text-ink/70"
            }`}
        >
            {value}
        </span>
    );
}

export const fmtDate = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

export const fmtDay = (value) => {
    if (!value) return "—";
    const d = new Date(`${value}T00:00:00`);
    return isNaN(d) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export const fmtMoney = (n) =>
    `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
```

# FILE: frontend/src/components/admin/ChatTab.jsx
```
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/context/AuthContext";

const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

export default function ChatTab({ customer }) {
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState("");
    const bottomRef = useRef(null);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/messages?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setMessages(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setMessages([]);
        load();
        const id = setInterval(load, 4000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || !customer) return;
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/messages`,
                { customer_id: customer.id, text },
                { withCredentials: true }
            );
            setMessages((m) => [...m, data]);
            setDraft("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="flex h-[calc(65vh-64px)] flex-col">
            <div
                data-testid="admin-chat-thread"
                className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
            >
                {messages.length === 0 && (
                    <p className="pt-16 text-center text-sm font-medium text-ink/55">
                        No messages in this thread yet.
                    </p>
                )}
                {messages.map((m) => (
                    <div
                        key={m.id}
                        data-testid={`admin-chat-message-${m.sender}`}
                        className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                            m.sender === "admin"
                                ? "ml-auto bg-ink text-paper"
                                : "bg-white text-ink shadow-[0_8px_24px_rgba(10,10,10,0.08)]"
                        }`}
                    >
                        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                            {m.text}
                        </p>
                        <p
                            className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
                                m.sender === "admin" ? "text-paper/60" : "text-ink/45"
                            }`}
                        >
                            {m.sender === "admin" ? "You (TMN)" : "Customer"} · {fmt(m.created_at)}
                        </p>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {error && <p className="px-6 pb-2 text-sm font-medium text-red-700">{error}</p>}

            <form
                onSubmit={send}
                className="flex items-center gap-3 border-t border-ink/10 px-6 py-4"
            >
                <input
                    data-testid="admin-reply-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply…"
                    className="flex-1 rounded-full border border-ink/20 bg-transparent px-5 py-3.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={!draft.trim()}
                    data-testid="admin-send-button"
                    className="rounded-full bg-ink px-6 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                >
                    Reply
                </button>
            </form>
        </div>
    );
}
```

# FILE: frontend/src/components/admin/JobsTab.jsx
```
import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDay } from "@/components/admin/shared";

export default function JobsTab({ customer }) {
    const [jobs, setJobs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState("");
    const [status, setStatus] = useState("scheduled");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/jobs?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setJobs(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setJobs([]);
        setShowForm(false);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const create = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await axios.post(
                `${API_BASE}/admin/jobs`,
                { customer_id: customer.id, title, description, scheduled_date: date, status },
                { withCredentials: true }
            );
            setTitle("");
            setDescription("");
            setDate("");
            setStatus("scheduled");
            setShowForm(false);
            load();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const setStatusFor = async (job, value) => {
        setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, status: value } : j)));
        try {
            await axios.patch(
                `${API_BASE}/admin/jobs/${job.id}`,
                { status: value },
                { withCredentials: true }
            );
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            load();
        }
    };

    const remove = async (job) => {
        try {
            await axios.delete(`${API_BASE}/admin/jobs/${job.id}`, { withCredentials: true });
            setJobs((js) => js.filter((j) => j.id !== job.id));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <div className="mb-5 flex items-center justify-between">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                    {jobs.length} job{jobs.length === 1 ? "" : "s"} on file
                </p>
                <button
                    data-testid="admin-job-new-button"
                    onClick={() => setShowForm((s) => !s)}
                    className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                >
                    {showForm ? "Cancel" : "+ New job"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={create}
                    data-testid="admin-job-form"
                    className="mb-6 space-y-3 rounded-2xl border border-ink/15 bg-white/80 p-5"
                >
                    <input
                        data-testid="admin-job-title-input"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Job title — e.g. Hallway repaint"
                        required
                        minLength={2}
                        className="w-full rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                    <textarea
                        data-testid="admin-job-description-input"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What's involved? Rooms, colours, access…"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            data-testid="admin-job-date-input"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        />
                        <select
                            data-testid="admin-job-status-select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        >
                            <option value="scheduled">Scheduled</option>
                            <option value="in progress">In progress</option>
                            <option value="completed">Completed</option>
                        </select>
                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="admin-job-create-button"
                            className="ml-auto rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                        >
                            Save job
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {jobs.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No jobs tracked yet. Create one to start this customer's history.
                    </p>
                )}
                {jobs.map((job) => (
                    <div
                        key={job.id}
                        data-testid={`admin-job-card-${job.id}`}
                        className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="font-display text-base font-bold uppercase tracking-tight">
                                    {job.title}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                    {fmtDay(job.scheduled_date)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <select
                                    data-testid={`admin-job-status-${job.id}`}
                                    value={job.status}
                                    onChange={(e) => setStatusFor(job, e.target.value)}
                                    className="rounded-full border border-ink/20 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
                                >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in progress">In progress</option>
                                    <option value="completed">Completed</option>
                                </select>
                                <button
                                    data-testid={`admin-job-delete-${job.id}`}
                                    onClick={() => remove(job)}
                                    aria-label="Delete job"
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-ink/60 transition-colors hover:border-red-400 hover:text-red-600"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        {job.description && (
                            <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                {job.description}
                            </p>
                        )}
                        <div className="mt-3">
                            <StatusBadge value={job.status} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

# FILE: frontend/src/components/admin/NotesTab.jsx
```
import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2 } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { fmtDate } from "@/components/admin/shared";

export default function NotesTab({ customer }) {
    const [notes, setNotes] = useState([]);
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/notes?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setNotes(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setNotes([]);
        setText("");
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const add = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        try {
            const { data } = await axios.post(
                `${API_BASE}/admin/notes`,
                { customer_id: customer.id, text },
                { withCredentials: true }
            );
            setNotes((n) => [data, ...n]);
            setText("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const remove = async (note) => {
        try {
            await axios.delete(`${API_BASE}/admin/notes/${note.id}`, { withCredentials: true });
            setNotes((n) => n.filter((x) => x.id !== note.id));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <form onSubmit={add} className="mb-6 space-y-3">
                <textarea
                    data-testid="admin-note-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Private note about this customer — colours used, keys collected, follow-ups…"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-ink/20 bg-transparent p-4 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                />
                <button
                    type="submit"
                    data-testid="admin-note-add-button"
                    disabled={!text.trim()}
                    className="rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                >
                    Add note
                </button>
            </form>

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {notes.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No notes yet. Anything worth remembering about this customer lives here.
                    </p>
                )}
                {notes.map((n) => (
                    <div
                        key={n.id}
                        data-testid={`admin-note-card-${n.id}`}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div>
                            <p className="text-sm font-medium leading-relaxed text-ink/85">
                                {n.text}
                            </p>
                            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                {fmtDate(n.created_at)}
                            </p>
                        </div>
                        <button
                            data-testid={`admin-note-delete-${n.id}`}
                            onClick={() => remove(n)}
                            aria-label="Delete note"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/20 text-ink/60 transition-colors hover:border-red-400 hover:text-red-600"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

# FILE: frontend/src/components/admin/InvoicesTab.jsx
```
import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDay, fmtMoney } from "@/components/admin/shared";
import { downloadInvoicePdf } from "@/utils/invoicePdf";

export default function InvoicesTab({ customer }) {
    const [invoices, setInvoices] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [items, setItems] = useState([{ description: "", amount: "" }]);
    const [dueDate, setDueDate] = useState("");
    const [status, setStatus] = useState("draft");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const load = async () => {
        if (!customer) return;
        try {
            const { data } = await axios.get(
                `${API_BASE}/admin/invoices?customer_id=${customer.id}`,
                { withCredentials: true }
            );
            setInvoices(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        setInvoices([]);
        setShowForm(false);
        setItems([{ description: "", amount: "" }]);
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer?.id]);

    const total = items.reduce(
        (sum, i) => sum + (parseFloat(i.amount) || 0),
        0
    );

    const create = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await axios.post(
                `${API_BASE}/admin/invoices`,
                {
                    customer_id: customer.id,
                    items: items.map((i) => ({
                        description: i.description,
                        amount: parseFloat(i.amount) || 0,
                    })),
                    due_date: dueDate,
                    status,
                },
                { withCredentials: true }
            );
            setItems([{ description: "", amount: "" }]);
            setDueDate("");
            setStatus("draft");
            setShowForm(false);
            load();
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    const setStatusFor = async (invoice, value) => {
        setInvoices((inv) => inv.map((x) => (x.id === invoice.id ? { ...x, status: value } : x)));
        try {
            await axios.patch(
                `${API_BASE}/admin/invoices/${invoice.id}`,
                { status: value },
                { withCredentials: true }
            );
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            load();
        }
    };

    return (
        <div className="h-[calc(65vh-64px)] overflow-y-auto px-6 py-5">
            <div className="mb-5 flex items-center justify-between">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/55">
                    {invoices.length} invoice{invoices.length === 1 ? "" : "s"} on file
                </p>
                <button
                    data-testid="admin-invoice-new-button"
                    onClick={() => setShowForm((s) => !s)}
                    className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95"
                >
                    {showForm ? "Cancel" : "+ New invoice"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={create}
                    data-testid="admin-invoice-form"
                    className="mb-6 space-y-4 rounded-2xl border border-ink/15 bg-white/80 p-5"
                >
                    {items.map((item, i) => (
                        <div key={i} className="flex flex-wrap gap-3">
                            <input
                                data-testid={`admin-invoice-item-desc-${i}`}
                                value={item.description}
                                onChange={(e) =>
                                    setItems((arr) =>
                                        arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x))
                                    )
                                }
                                placeholder="Line item — e.g. Living room repaint (walls + ceiling)"
                                required
                                minLength={1}
                                className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            <input
                                data-testid={`admin-invoice-item-amount-${i}`}
                                value={item.amount}
                                onChange={(e) =>
                                    setItems((arr) =>
                                        arr.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))
                                    )
                                }
                                placeholder="£ 0.00"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                className="w-32 rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => setItems((arr) => arr.filter((_, j) => j !== i))}
                                    className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-red-600"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        data-testid="admin-invoice-add-line"
                        onClick={() => setItems((arr) => [...arr, { description: "", amount: "" }])}
                        className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink/60 hover:text-ink"
                    >
                        + Add line item
                    </button>
                    <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
                        <input
                            data-testid="admin-invoice-due-input"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            required
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        />
                        <select
                            data-testid="admin-invoice-status-select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="rounded-xl border border-ink/20 bg-transparent px-4 py-3 text-sm font-medium focus:border-ink focus:outline-none"
                        >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                        </select>
                        <span className="ml-auto font-display text-lg font-bold">
                            Total: {fmtMoney(total)}
                        </span>
                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="admin-invoice-create-button"
                            className="rounded-full bg-ink px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper disabled:opacity-40"
                        >
                            Create invoice
                        </button>
                    </div>
                </form>
            )}

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-3">
                {invoices.length === 0 && (
                    <p className="pt-10 text-center text-sm font-medium text-ink/55">
                        No invoices yet. Create one and the customer sees it in their account.
                    </p>
                )}
                {invoices.map((inv) => (
                    <div
                        key={inv.id}
                        data-testid={`admin-invoice-card-${inv.id}`}
                        className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <span className="font-display text-base font-bold uppercase tracking-tight">
                                    {inv.number}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                    Due {fmtDay(inv.due_date)}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-display text-lg font-bold">
                                    {fmtMoney(inv.total)}
                                </span>
                                <select
                                    data-testid={`admin-invoice-status-${inv.id}`}
                                    value={inv.status}
                                    onChange={(e) => setStatusFor(inv, e.target.value)}
                                    className="rounded-full border border-ink/20 bg-transparent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] focus:border-ink focus:outline-none"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="sent">Sent</option>
                                    <option value="paid">Paid</option>
                                </select>
                            </div>
                        </div>
                        <ul className="mt-3 space-y-1">
                            {inv.items.map((i, j) => (
                                <li
                                    key={j}
                                    className="flex justify-between text-sm font-medium text-ink/75"
                                >
                                    <span>{i.description}</span>
                                    <span>{fmtMoney(i.amount)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-3 flex items-center gap-3">
                            <StatusBadge value={inv.status} />
                            <button
                                data-testid={`admin-invoice-pdf-${inv.id}`}
                                onClick={() => downloadInvoicePdf(inv, customer?.name, customer?.email)}
                                className="rounded-full border border-ink/25 px-4 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                            >
                                PDF
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

# FILE: frontend/src/components/admin/ClientsView.jsx
```
import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Pencil, Search, X } from "lucide-react";
import { API_BASE, formatApiError } from "@/context/AuthContext";
import { StatusBadge, fmtDate, fmtDay, fmtMoney } from "@/components/admin/shared";

function ClientRecord({ client, onRename }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(client.name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const save = async () => {
        if (name.trim().length < 2) return;
        setBusy(true);
        try {
            await axios.patch(
                `${API_BASE}/admin/customers/${client.id}`,
                { name: name.trim() },
                { withCredentials: true }
            );
            onRename(client.id, name.trim());
            setEditing(false);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-3xl border border-ink/12 bg-white/80 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 pb-5">
                <div>
                    {editing ? (
                        <div className="flex items-center gap-2">
                            <input
                                data-testid="admin-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="rounded-xl border border-ink/25 bg-transparent px-4 py-2 font-display text-lg font-bold uppercase tracking-tight focus:border-ink focus:outline-none"
                            />
                            <button
                                data-testid="admin-name-save"
                                onClick={save}
                                disabled={busy}
                                aria-label="Save name"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-paper disabled:opacity-40"
                            >
                                <Check className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setEditing(false);
                                    setName(client.name);
                                }}
                                aria-label="Cancel"
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/25 text-ink/60"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <h3
                                data-testid={`client-record-name-${client.email}`}
                                className="font-display text-2xl font-extrabold uppercase tracking-tight"
                            >
                                {client.name}
                            </h3>
                            <button
                                data-testid={`admin-edit-name-button-${client.email}`}
                                onClick={() => setEditing(true)}
                                aria-label="Edit customer name"
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                    <p className="mt-1 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                        {client.email} · customer since{" "}
                        {client.created_at
                            ? new Date(client.created_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                              })
                            : "—"}
                    </p>
                    {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
                </div>
                <div className="grid grid-cols-3 gap-4 text-center font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{client.jobs.length}</p>
                        jobs
                    </div>
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{fmtMoney(client.total_invoiced)}</p>
                        invoiced
                    </div>
                    <div>
                        <p className="font-display text-xl font-extrabold text-ink">{fmtMoney(client.total_unpaid)}</p>
                        unpaid
                    </div>
                </div>
            </div>

            <div className="grid gap-8 pt-6 lg:grid-cols-2">
                {/* jobs */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Jobs ({client.jobs.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.jobs.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No jobs on file.</p>
                        )}
                        {client.jobs.map((j) => (
                            <div key={j.id} className="rounded-xl border border-ink/12 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold">{j.title}</span>
                                    <StatusBadge value={j.status} />
                                </div>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                    {fmtDay(j.scheduled_date)}
                                </p>
                                {j.description && (
                                    <p className="mt-2 text-sm font-medium text-ink/70">{j.description}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* invoices */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Invoices ({client.invoices.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.invoices.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No invoices on file.</p>
                        )}
                        {client.invoices.map((i) => (
                            <div key={i.id} className="rounded-xl border border-ink/12 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-bold">{i.number}</span>
                                    <StatusBadge value={i.status} />
                                </div>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                    Due {fmtDay(i.due_date)} · {fmtMoney(i.total)}
                                </p>
                                <ul className="mt-2 space-y-0.5">
                                    {i.items.map((it, j) => (
                                        <li key={j} className="flex justify-between text-xs font-medium text-ink/65">
                                            <span>{it.description}</span>
                                            <span>{fmtMoney(it.amount)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* notes */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Notes ({client.notes.length})
                    </h4>
                    <div className="space-y-2.5">
                        {client.notes.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No notes on file.</p>
                        )}
                        {client.notes.map((n) => (
                            <div key={n.id} className="rounded-xl border border-ink/12 p-4">
                                <p className="text-sm font-medium text-ink/80">{n.text}</p>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                    {fmtDate(n.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* messages */}
                <section>
                    <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink/60">
                        Messages ({client.messages.length})
                    </h4>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                        {client.messages.length === 0 && (
                            <p className="text-sm font-medium text-ink/45">No messages on file.</p>
                        )}
                        {client.messages.map((m) => (
                            <div key={m.id} className="rounded-xl border border-ink/12 p-3.5">
                                <p className="text-sm font-medium text-ink/80">
                                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                                        {m.sender === "admin" ? "TMN" : "Customer"} ·{" "}
                                    </span>
                                    {m.text}
                                </p>
                                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                                    {fmtDate(m.created_at)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

export default function ClientsView() {
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState("");
    const [openId, setOpenId] = useState(null);
    const [error, setError] = useState("");

    const load = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/clients`, {
                withCredentials: true,
            });
            setClients(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        load();
    }, []);

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

    const exportCsv = () => {
        const rows = [];
        rows.push("CLIENTS");
        rows.push("Name,Email,Joined,Jobs,Total invoiced GBP,Unpaid GBP");
        clients.forEach((c) =>
            rows.push(
                [
                    esc(c.name),
                    esc(c.email),
                    esc(c.created_at?.slice(0, 10)),
                    c.jobs.length,
                    c.total_invoiced,
                    c.total_unpaid,
                ].join(",")
            )
        );
        rows.push("");
        rows.push("JOBS");
        rows.push("Client,Title,Scheduled,Status,Description");
        clients.forEach((c) =>
            c.jobs.forEach((j) =>
                rows.push(
                    [esc(c.name), esc(j.title), esc(j.scheduled_date), esc(j.status), esc(j.description)].join(",")
                )
            )
        );
        rows.push("");
        rows.push("INVOICES");
        rows.push("Client,Number,Due,Status,Line item,Amount GBP");
        clients.forEach((c) =>
            c.invoices.forEach((i) =>
                i.items.forEach((it) =>
                    rows.push([esc(c.name), esc(i.number), esc(i.due_date), esc(i.status), esc(it.description), it.amount].join(","))
                )
            )
        );
        rows.push("");
        rows.push("MESSAGES");
        rows.push("Client,Sender,Date,Text");
        clients.forEach((c) =>
            c.messages.forEach((m) =>
                rows.push([esc(c.name), esc(m.sender), esc(m.created_at), esc(m.text)].join(","))
            )
        );
        const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `tmn-clients-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const q = search.trim().toLowerCase();
    const matches = (c) => {
        if (!q) return true;
        if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) return true;
        return (
            c.jobs.some((j) => `${j.title} ${j.description}`.toLowerCase().includes(q)) ||
            c.notes.some((n) => n.text.toLowerCase().includes(q)) ||
            c.messages.some((m) => m.text.toLowerCase().includes(q)) ||
            c.invoices.some((i) => i.number.toLowerCase().includes(q))
        );
    };
    const visible = clients.filter(matches);

    const rename = (id, name) => {
        setClients((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
    };

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
                    <input
                        data-testid="admin-clients-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search customers, jobs, notes, messages, invoices…"
                        className="w-full rounded-full border border-ink/20 bg-white/70 py-3.5 pl-11 pr-5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                    />
                </div>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-ink/50">
                    {visible.length} of {clients.length} shown
                </span>
                <button
                    data-testid="admin-export-csv"
                    onClick={exportCsv}
                    disabled={clients.length === 0}
                    className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                >
                    Export CSV
                </button>
            </div>

            {error && <p className="mb-4 text-sm font-medium text-red-700">{error}</p>}

            <div className="space-y-4">
                {visible.length === 0 && (
                    <p className="py-16 text-center text-sm font-medium text-ink/55">
                        {clients.length === 0
                            ? "No clients yet — records appear here once customers register."
                            : `Nothing matches "${search}".`}
                    </p>
                )}
                {visible.map((c) => (
                    <div
                        key={c.id}
                        data-testid={`client-record-card-${c.email}`}
                        className="rounded-3xl border border-ink/12 bg-white/60 backdrop-blur-xl"
                    >
                        <button
                            onClick={() => setOpenId(openId === c.id ? null : c.id)}
                            className="flex w-full flex-wrap items-center justify-between gap-4 p-6 text-left"
                        >
                            <div>
                                <span className="font-display text-lg font-extrabold uppercase tracking-tight">
                                    {c.name}
                                </span>
                                <span className="ml-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/50">
                                    {c.email}
                                </span>
                            </div>
                            <div className="flex items-center gap-5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-ink/60">
                                <span>{c.jobs.length} jobs</span>
                                <span>{fmtMoney(c.total_invoiced)} invoiced</span>
                                {c.total_unpaid > 0 && (
                                    <span className="rounded-full bg-ink px-3 py-1 text-paper">
                                        {fmtMoney(c.total_unpaid)} unpaid
                                    </span>
                                )}
                                <span
                                    className={`inline-block transition-transform duration-300 ${
                                        openId === c.id ? "rotate-180" : ""
                                    }`}
                                >
                                    ▾
                                </span>
                            </div>
                        </button>
                        {openId === c.id && (
                            <div className="px-6 pb-6">
                                <ClientRecord client={c} onRename={rename} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

# FILE: frontend/src/context/AuthContext.jsx
```
import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

export function formatApiError(detail) {
    if (detail == null) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail
            .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
            .filter(Boolean)
            .join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
}

export function AuthProvider({ children }) {
    // null = checking session, false = logged out, object = logged in
    const [user, setUser] = useState(null);

    useEffect(() => {
        axios
            .get(`${API}/auth/me`, { withCredentials: true })
            .then(({ data }) => setUser(data))
            .catch(() => setUser(false));

        // auto-refresh: on any 401 (except auth endpoints), retry via refresh cookie
        const id = axios.interceptors.response.use(null, async (err) => {
            const cfg = err.config || {};
            if (
                err.response?.status === 401 &&
                !cfg.__retried &&
                !(cfg.url || "").includes("/auth/")
            ) {
                cfg.__retried = true;
                try {
                    await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
                    return axios(cfg);
                } catch (e2) {
                    setUser(false);
                }
            }
            return Promise.reject(err);
        });
        return () => axios.interceptors.response.eject(id);
    }, []);

    const login = async (email, password) => {
        const { data } = await axios.post(
            `${API}/auth/login`,
            { email, password },
            { withCredentials: true }
        );
        setUser(data);
        return data;
    };

    const register = async (name, email, password) => {
        const { data } = await axios.post(
            `${API}/auth/register`,
            { name, email, password },
            { withCredentials: true }
        );
        setUser(data);
        return data;
    };

    const logout = async () => {
        try {
            await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
        } finally {
            setUser(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, setUser, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
export { API as API_BASE };
```

# FILE: frontend/src/utils/invoicePdf.js
```
import { jsPDF } from "jspdf";

const money = (n) =>
  `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function logoBase64() {
  const res = await fetch("/logo-white.png");
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

const day = (value) => {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d)
    ? new Date(value).toLocaleDateString("en-GB")
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export async function downloadInvoicePdf(invoice, customerName = "", customerEmail = "") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595;

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, W, 120, "F");
  try {
    doc.addImage(await logoBase64(), "PNG", 40, 28, 64, 64);
  } catch (e) {
    /* logo is decorative — skip on failure */
  }
  doc.setTextColor(245, 244, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("TMN Decorating & Maintenance", 120, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(190, 190, 190);
  doc.text("Plymouth, UK  ·  info@tmndecorating.co.uk  ·  07736 325643", 120, 76);

  doc.setTextColor(10, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text(`Invoice ${invoice.number}`, 40, 175);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(95, 95, 95);
  doc.text(`Issued: ${day(invoice.created_at?.slice(0, 10))}`, 40, 198);
  doc.text(`Due: ${day(invoice.due_date)}`, 40, 216);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 10, 10);
  doc.text("Billed to:", 380, 175);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(95, 95, 95);
  doc.text(customerName || "-", 380, 193);
  doc.text(customerEmail || "", 380, 209);

  let y = 265;
  doc.setFillColor(10, 10, 10);
  doc.rect(40, y - 16, W - 80, 26, "F");
  doc.setTextColor(245, 244, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", 52, y);
  doc.text("Amount", W - 52, y, { align: "right" });

  y += 42;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(10, 10, 10);
  for (const item of invoice.items || []) {
    doc.setFontSize(10);
    doc.text(item.description, 52, y);
    doc.text(money(item.amount), W - 52, y, { align: "right" });
    doc.setDrawColor(220, 220, 220);
    doc.line(40, y + 10, W - 40, y + 10);
    y += 36;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Total", 52, y + 8);
  doc.text(money(invoice.total), W - 52, y + 8, { align: "right" });

  y += 44;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Status: ${String(invoice.status).toUpperCase()}`, 52, y);

  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(
    "Thank you for your business — TMN Decorating & Maintenance, Plymouth UK.",
    40,
    780
  );

  doc.save(`${invoice.number}.pdf`);
}
```

# FILE: frontend/src/pages/Login.jsx
```
import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { formatApiError, useAuth } from "@/context/AuthContext";
import { EASE } from "@/components/Reveal";

export default function Login() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
            const user =
                mode === "login"
                    ? await login(email, password)
                    : await register(name, email, password);
            navigate(user.role === "admin" ? "/admin" : "/account");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-paper font-body text-ink">
            {/* brand panel */}
            <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-ink p-16 lg:flex">
                <div className="max-w-md">
                    <img
                        src="/logo-white.png"
                        alt="TMN logo"
                        className="h-24 w-24 object-contain"
                    />
                    <h1 className="mt-10 font-display text-5xl font-extrabold uppercase leading-[0.9] tracking-tight text-white">
                        Welcome
                        <br />
                        <span className="text-outline">back.</span>
                    </h1>
                    <p className="mt-6 text-base leading-relaxed text-white/70">
                        Track your history, chat with us about a job and keep every message in
                        one place — all your TMN conversations live here.
                    </p>
                </div>
            </div>

            {/* form panel */}
            <div className="flex w-full items-center justify-center p-6 sm:p-12 lg:w-1/2">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="w-full max-w-md"
                >
                    <a
                        href="/"
                        data-testid="login-back-link"
                        className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/50 hover:text-ink"
                    >
                        ← Back to site
                    </a>

                    <div className="mt-8 flex gap-2">
                        {["login", "register"].map((m) => (
                            <button
                                key={m}
                                data-testid={`login-mode-${m}`}
                                onClick={() => {
                                    setMode(m);
                                    setError("");
                                }}
                                className={`rounded-full border px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                                    mode === m
                                        ? "border-ink bg-ink text-paper"
                                        : "border-ink/25 text-ink/70 hover:border-ink"
                                }`}
                            >
                                {m === "login" ? "Log in" : "Create account"}
                            </button>
                        ))}
                    </div>

                    <h2 className="mt-8 font-display text-3xl font-extrabold uppercase tracking-tight">
                        {mode === "login" ? "Customer login" : "Join TMN"}
                    </h2>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-ink/70">
                        {mode === "login"
                            ? "Log in to see your message history and chat with us."
                            : "Create an account to chat with us and keep your project history."}
                    </p>

                    <form onSubmit={submit} className="mt-8 space-y-4">
                        {mode === "register" && (
                            <input
                                data-testid="login-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                required
                                minLength={2}
                                className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                            />
                        )}
                        <input
                            data-testid="login-email-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Email address"
                            required
                            className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                        />
                        <input
                            data-testid="login-password-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            required
                            minLength={8}
                            className="w-full rounded-2xl border border-ink/20 bg-white/70 p-4 text-sm font-medium text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                        />

                        {error && (
                            <p
                                data-testid="login-error"
                                className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700"
                            >
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            data-testid="login-submit-button"
                            className="w-full rounded-full bg-ink px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-paper transition-transform duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                            {busy
                                ? "One moment…"
                                : mode === "login"
                                ? "Log in"
                                : "Create my account"}
                        </button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}
```

# FILE: frontend/src/pages/Account.jsx
```
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";
import { StatusBadge, fmtDay, fmtMoney } from "@/components/admin/shared";
import { downloadInvoicePdf } from "@/utils/invoicePdf";

const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

const TABS = ["Chat", "My jobs", "My invoices"];

export default function Account() {
    const { user, logout } = useAuth();
    const [tab, setTab] = useState("Chat");
    const [messages, setMessages] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [paying, setPaying] = useState(null);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);
    const bottomRef = useRef(null);

    const loadMessages = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/messages`, {
                withCredentials: true,
            });
            setMessages(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const loadHistory = async () => {
        try {
            const [jobsRes, invRes] = await Promise.all([
                axios.get(`${API_BASE}/my/jobs`, { withCredentials: true }),
                axios.get(`${API_BASE}/my/invoices`, { withCredentials: true }),
            ]);
            setJobs(jobsRes.data);
            setInvoices(invRes.data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get("payment");
        const sessionId = params.get("session_id");
        if (payment === "success" && sessionId) {
            setBanner("pending");
            let tries = 0;
            const poll = setInterval(async () => {
                tries += 1;
                try {
                    const { data } = await axios.get(
                        `${API_BASE}/payments/status/${sessionId}`,
                        { withCredentials: true }
                    );
                    if (data.payment_status === "paid") {
                        clearInterval(poll);
                        setBanner("success");
                        loadHistory();
                    } else if (tries > 8) {
                        clearInterval(poll);
                        setBanner("pending");
                    }
                } catch (e) {
                    if (tries > 8) {
                        clearInterval(poll);
                        setBanner("pending");
                    }
                }
            }, 2000);
            window.history.replaceState({}, "", "/account");
            return () => clearInterval(poll);
        }
        if (payment === "cancelled") {
            setBanner("cancelled");
            window.history.replaceState({}, "", "/account");
        }
    }, []);

    useEffect(() => {
        loadMessages();
        loadHistory();
        const id = setInterval(loadMessages, 4000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length]);

    const send = async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text) return;
        setSending(true);
        try {
            const { data } = await axios.post(
                `${API_BASE}/messages`,
                { text },
                { withCredentials: true }
            );
            setMessages((m) => [...m, data]);
            setDraft("");
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        } finally {
            setSending(false);
        }
    };

    const pay = async (invoice) => {
        setPaying(invoice.id);
        setError("");
        try {
            const { data } = await axios.post(
                `${API_BASE}/invoices/${invoice.id}/checkout`,
                { origin_url: window.location.origin },
                { withCredentials: true }
            );
            window.location.href = data.checkout_url;
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
            setPaying(null);
        }
    };

    const memberSince = user?.created_at
        ? new Date(user.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : "—";

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
                <div className="mx-auto flex h-24 max-w-[1400px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="account-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            My account
                        </span>
                    </a>
                    <button
                        data-testid="account-logout-button"
                        onClick={logout}
                        className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                    >
                        Log out
                    </button>
                </div>
            </header>

            <main className="mx-auto grid max-w-[1400px] gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:py-16">
                {/* details */}
                <div className="space-y-6">
                    <div>
                        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                            My details
                        </p>
                        <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-tight">
                            Hello, {user?.name?.split(" ")[0]}
                        </h1>
                    </div>

                    <div className="rounded-3xl border border-ink/10 bg-white/70 p-7 shadow-[0_20px_50px_rgba(10,10,10,0.08)] backdrop-blur-xl">
                        <dl className="space-y-4 text-sm font-medium">
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Name
                                </dt>
                                <dd className="mt-1">{user?.name}</dd>
                            </div>
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Email
                                </dt>
                                <dd className="mt-1">{user?.email}</dd>
                            </div>
                            <div>
                                <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55">
                                    Customer since
                                </dt>
                                <dd className="mt-1">{memberSince}</dd>
                            </div>
                        </dl>
                    </div>

                    <div className="rounded-3xl border border-ink/10 bg-ink p-7 text-paper">
                        <p className="font-display text-xl font-bold uppercase tracking-tight">
                            Your history, one place
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-paper/75">
                            Chat with us, see every job we've scheduled for you, download your
                            invoices and pay them online — all saved to your account.
                        </p>
                    </div>
                </div>

                {/* workspace */}
                <div className="flex flex-col rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-7 py-4">
                        <div className="flex gap-2">
                            {TABS.map((t) => (
                                <button
                                    key={t}
                                    data-testid={`account-tab-${t.toLowerCase().replace(" ", "-")}`}
                                    onClick={() => setTab(t)}
                                    className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                        tab === t
                                            ? "bg-ink text-paper"
                                            : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                        {tab === "Chat" && (
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                {messages.length} messages
                            </span>
                        )}
                    </div>

                    {banner && (
                        <div
                            data-testid={`payment-banner-${banner}`}
                            className={`mx-7 mt-5 rounded-2xl p-4 text-sm font-medium ${
                                banner === "success"
                                    ? "bg-green-50 text-green-800"
                                    : banner === "cancelled"
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-ink/5 text-ink/75"
                            }`}
                        >
                            {banner === "success"
                                ? "Payment received — thank you! Your invoice is marked as paid below."
                                : banner === "cancelled"
                                ? "Payment cancelled — no money was taken. You can pay any time below."
                                : "Finishing up your payment confirmation…"}
                        </div>
                    )}

                    {error && <p className="px-7 pt-4 text-sm font-medium text-red-700">{error}</p>}

                    {/* CHAT */}
                    {tab === "Chat" && (
                        <>
                            <div
                                data-testid="account-chat-thread"
                                className="h-[60vh] flex-1 space-y-4 overflow-y-auto px-7 py-6"
                            >
                                {messages.length === 0 && (
                                    <p className="mx-auto max-w-xs pt-16 text-center text-sm font-medium leading-relaxed text-ink/55">
                                        No messages yet. Say hello or tell us about a job — we'll
                                        reply as fast as we can.
                                    </p>
                                )}
                                {messages.map((m) => (
                                    <div
                                        key={m.id}
                                        data-testid={`chat-message-${m.sender}`}
                                        className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                                            m.sender === "customer"
                                                ? "ml-auto bg-ink text-paper"
                                                : "bg-white text-ink shadow-[0_8px_24px_rgba(10,10,10,0.08)]"
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed">
                                            {m.text}
                                        </p>
                                        <p
                                            className={`mt-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
                                                m.sender === "customer" ? "text-paper/60" : "text-ink/45"
                                            }`}
                                        >
                                            {m.sender === "customer" ? "You" : "TMN"} · {fmt(m.created_at)}
                                        </p>
                                    </div>
                                ))}
                                <div ref={bottomRef} />
                            </div>

                            <form
                                onSubmit={send}
                                className="flex items-center gap-3 border-t border-ink/10 px-7 py-5"
                            >
                                <input
                                    data-testid="account-chat-input"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Write a message…"
                                    className="flex-1 rounded-full border border-ink/20 bg-transparent px-5 py-3.5 text-sm font-medium placeholder:text-ink/40 focus:border-ink focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !draft.trim()}
                                    data-testid="account-chat-send"
                                    className="rounded-full bg-ink px-6 py-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                                >
                                    Send
                                </button>
                            </form>
                        </>
                    )}

                    {/* JOBS */}
                    {tab === "My jobs" && (
                        <div
                            data-testid="account-jobs-list"
                            className="h-[60vh] space-y-3 overflow-y-auto px-7 py-6"
                        >
                            {jobs.length === 0 && (
                                <p className="pt-16 text-center text-sm font-medium text-ink/55">
                                    No jobs on your file yet. Once we schedule work with you,
                                    it appears here with dates and progress.
                                </p>
                            )}
                            {jobs.map((job) => (
                                <div
                                    key={job.id}
                                    data-testid={`account-job-card-${job.id}`}
                                    className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="font-display text-base font-bold uppercase tracking-tight">
                                            {job.title}
                                        </span>
                                        <StatusBadge value={job.status} />
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                        {fmtDay(job.scheduled_date)}
                                    </p>
                                    {job.description && (
                                        <p className="mt-3 text-sm font-medium leading-relaxed text-ink/75">
                                            {job.description}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* INVOICES */}
                    {tab === "My invoices" && (
                        <div
                            data-testid="account-invoices-list"
                            className="h-[60vh] space-y-3 overflow-y-auto px-7 py-6"
                        >
                            {invoices.length === 0 && (
                                <p className="pt-16 text-center text-sm font-medium text-ink/55">
                                    No invoices yet. Any invoice we raise for your jobs shows
                                    here with its status.
                                </p>
                            )}
                            {invoices.map((inv) => (
                                <div
                                    key={inv.id}
                                    data-testid={`account-invoice-card-${inv.id}`}
                                    className="rounded-2xl border border-ink/12 bg-white/80 p-5"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <span className="font-display text-base font-bold uppercase tracking-tight">
                                            Invoice {inv.number}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <span className="font-display text-lg font-bold">
                                                {fmtMoney(inv.total)}
                                            </span>
                                            <StatusBadge value={inv.status} />
                                        </div>
                                    </div>
                                    <p className="mt-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-ink/55">
                                        Due {fmtDay(inv.due_date)}
                                    </p>
                                    <ul className="mt-3 space-y-1">
                                        {inv.items.map((i, j) => (
                                            <li
                                                key={j}
                                                className="flex justify-between text-sm font-medium text-ink/75"
                                            >
                                                <span>{i.description}</span>
                                                <span>{fmtMoney(i.amount)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {inv.status === "sent" && (
                                            <button
                                                data-testid={`account-pay-button-${inv.id}`}
                                                onClick={() => pay(inv)}
                                                disabled={paying === inv.id}
                                                className="rounded-full bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
                                            >
                                                {paying === inv.id ? "Opening Stripe…" : "Pay with card"}
                                            </button>
                                        )}
                                        <button
                                            data-testid={`account-invoice-pdf-${inv.id}`}
                                            onClick={() =>
                                                downloadInvoicePdf(inv, user?.name, user?.email)
                                            }
                                            className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                                        >
                                            Download PDF
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
```

# FILE: frontend/src/pages/Admin.jsx
```
import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Pencil, X } from "lucide-react";
import { API_BASE, formatApiError, useAuth } from "@/context/AuthContext";
import ChatTab from "@/components/admin/ChatTab";
import JobsTab from "@/components/admin/JobsTab";
import NotesTab from "@/components/admin/NotesTab";
import InvoicesTab from "@/components/admin/InvoicesTab";
import ClientsView from "@/components/admin/ClientsView";

const TABS = ["Chat", "Jobs", "Notes", "Invoices"];

export default function Admin() {
    const { user, logout } = useAuth();
    const [view, setView] = useState("inbox");
    const [customers, setCustomers] = useState([]);
    const [stats, setStats] = useState(null);
    const [activeId, setActiveId] = useState(null);
    const [tab, setTab] = useState("Chat");
    const [error, setError] = useState("");
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");

    const loadCustomers = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/customers`, {
                withCredentials: true,
            });
            setCustomers(data);
            setActiveId((cur) => cur || (data[0] ? data[0].id : null));
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    const loadStats = async () => {
        try {
            const { data } = await axios.get(`${API_BASE}/admin/stats`, {
                withCredentials: true,
            });
            setStats(data);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    useEffect(() => {
        loadCustomers();
        loadStats();
        const id = setInterval(() => {
            loadCustomers();
            loadStats();
        }, 4000);
        return () => clearInterval(id);
    }, []);

    const active = customers.find((c) => c.id === activeId);

    const renameCustomer = async () => {
        const name = nameDraft.trim();
        if (!active || name.length < 2) return;
        try {
            await axios.patch(
                `${API_BASE}/admin/customers/${active.id}`,
                { name },
                { withCredentials: true }
            );
            setCustomers((cs) => cs.map((c) => (c.id === active.id ? { ...c, name } : c)));
            setEditingName(false);
        } catch (err) {
            setError(formatApiError(err.response?.data?.detail));
        }
    };

    return (
        <div className="min-h-screen bg-paper font-body text-ink">
            <header className="border-b border-ink/10 bg-paper/85 backdrop-blur-xl">
                <div className="mx-auto flex h-24 max-w-[1500px] items-center justify-between px-5 sm:px-8">
                    <a href="/" data-testid="admin-home-link" className="flex items-center gap-3">
                        <img src="/logo-dark.png" alt="TMN logo" className="h-14 w-14 object-contain" />
                        <span className="hidden font-display text-sm font-bold uppercase tracking-[0.18em] sm:block">
                            Admin console
                        </span>
                    </a>
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                            <button
                                data-testid="admin-view-inbox"
                                onClick={() => setView("inbox")}
                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                    view === "inbox"
                                        ? "bg-ink text-paper"
                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                Inbox
                            </button>
                            <button
                                data-testid="admin-view-records"
                                onClick={() => setView("records")}
                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                    view === "records"
                                        ? "bg-ink text-paper"
                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                }`}
                            >
                                Client records
                            </button>
                        </div>
                        <button
                            data-testid="admin-logout-button"
                            onClick={logout}
                            className="rounded-full border border-ink/25 px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                        >
                            Log out
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1500px] px-5 py-10 sm:px-8 lg:py-14">
                {view === "records" ? (
                    <>
                        <div className="mb-8">
                            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                                Full record &amp; history
                            </p>
                            <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                                Client records
                            </h1>
                        </div>
                        <ClientsView />
                    </>
                ) : (
                    <>
                        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
                            <div>
                                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.3em] text-ink/60">
                                    Signed in as {user?.email}
                                </p>
                                <h1 className="mt-2 font-display text-4xl font-extrabold uppercase tracking-tight">
                                    Jobs, notes &amp; invoices
                                </h1>
                            </div>
                            <div className="flex gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
                                <span className="rounded-full border border-ink/20 px-4 py-2" data-testid="stat-customers">
                                    {stats ? `${stats.customers} customers` : "—"}
                                </span>
                                <span className="rounded-full border border-ink/20 px-4 py-2" data-testid="stat-messages">
                                    {stats ? `${stats.messages} messages` : "—"}
                                </span>
                                <span className="rounded-full bg-ink px-4 py-2 text-paper" data-testid="stat-unread">
                                    {stats ? `${stats.unread} unread` : "—"}
                                </span>
                            </div>
                        </div>

                        {error && <p className="mb-6 text-sm font-medium text-red-700">{error}</p>}

                        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                            {/* customer list */}
                            <div className="max-h-[65vh] space-y-3 overflow-y-auto rounded-3xl border border-ink/10 bg-white/60 p-4 backdrop-blur-xl">
                                {customers.length === 0 && (
                                    <p className="p-6 text-center text-sm font-medium text-ink/55">
                                        No customers have registered yet.
                                    </p>
                                )}
                                {customers.map((c) => (
                                    <button
                                        key={c.id}
                                        data-testid={`admin-customer-item-${c.email}`}
                                        onClick={() => setActiveId(c.id)}
                                        className={`w-full rounded-2xl border p-4 text-left transition-colors duration-300 ${
                                            activeId === c.id
                                                ? "border-ink bg-white shadow-[0_10px_30px_rgba(10,10,10,0.08)]"
                                                : "border-transparent hover:border-ink/20"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-display text-base font-bold uppercase tracking-tight">
                                                {c.name}
                                            </span>
                                            {c.unread > 0 && (
                                                <span
                                                    data-testid={`admin-unread-badge-${c.email}`}
                                                    className="rounded-full bg-ink px-2.5 py-1 font-mono text-[9px] font-bold text-paper"
                                                >
                                                    {c.unread} new
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs font-medium text-ink/55">{c.email}</p>
                                        <p className="mt-2 truncate text-xs font-medium text-ink/70">
                                            {c.last_message
                                                ? `${c.last_message.sender === "customer" ? "Them" : "You"}: ${c.last_message.text}`
                                                : "No messages yet"}
                                        </p>
                                    </button>
                                ))}
                            </div>

                            {/* workspace */}
                            <div className="rounded-3xl border border-ink/10 bg-white/70 shadow-[0_24px_70px_rgba(10,10,10,0.10)] backdrop-blur-xl">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-6 py-4">
                                    <div>
                                        {editingName && active ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    data-testid="admin-workspace-name-input"
                                                    value={nameDraft}
                                                    onChange={(e) => setNameDraft(e.target.value)}
                                                    className="rounded-xl border border-ink/25 bg-transparent px-3 py-1.5 font-display text-lg font-bold uppercase tracking-tight focus:border-ink focus:outline-none"
                                                />
                                                <button
                                                    data-testid="admin-workspace-name-save"
                                                    onClick={renameCustomer}
                                                    aria-label="Save name"
                                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper"
                                                >
                                                    <Check className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingName(false)}
                                                    aria-label="Cancel"
                                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3">
                                                <span className="font-display text-lg font-bold uppercase tracking-tight">
                                                    {active ? active.name : "Select a customer"}
                                                </span>
                                                {active && (
                                                    <button
                                                        data-testid="admin-workspace-name-edit"
                                                        onClick={() => {
                                                            setNameDraft(active.name);
                                                            setEditingName(true);
                                                        }}
                                                        aria-label="Edit customer name"
                                                        className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {active && (
                                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                                {active.email}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {TABS.map((t) => (
                                            <button
                                                key={t}
                                                data-testid={`admin-tab-${t.toLowerCase()}`}
                                                onClick={() => setTab(t)}
                                                className={`rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] transition-all duration-300 ${
                                                    tab === t
                                                        ? "bg-ink text-paper"
                                                        : "border border-ink/25 text-ink/70 hover:border-ink hover:text-ink"
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="px-6 pt-1">
                                    <p className="border-b-2 border-ink/80 pb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-ink/50">
                                        {tab === "Chat" && "Conversation — replies go straight to the customer"}
                                        {tab === "Jobs" && "Track and date every job for this customer"}
                                        {tab === "Notes" && "Private notes — the customer never sees these"}
                                        {tab === "Invoices" && "Create invoices — the customer sees them in their account"}
                                    </p>
                                </div>

                                {!active ? (
                                    <p className="py-24 text-center text-sm font-medium text-ink/55">
                                        Pick a customer to get started.
                                    </p>
                                ) : (
                                    <>
                                        {tab === "Chat" && <ChatTab customer={active} />}
                                        {tab === "Jobs" && <JobsTab customer={active} />}
                                        {tab === "Notes" && <NotesTab customer={active} />}
                                        {tab === "Invoices" && <InvoicesTab customer={active} />}
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
```

# FILE: frontend/src/lib/utils.js
```
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

# FILE: frontend/src/hooks/use-toast.js
```
"use client";
// Inspired by react-hot-toast library
import * as React from "react"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST"
}

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString();
}

const toastTimeouts = new Map()

const addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state, action) => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
}

const listeners = []

let memoryState = { toasts: [] }

function dispatch(action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function toast({
  ...props
}) {
  const id = genId()

  const update = (props) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    };
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast }
```

