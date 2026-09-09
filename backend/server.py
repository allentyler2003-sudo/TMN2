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
    "You are the TMN Assistant for TMN Decorating & Maintenance — a friendly company based "
    "in Plymouth, UK, serving domestic and commercial customers. Painting and decorating is "
    "their core trade, but IMPORTANT: any domestic trade job can be completed by the TMN "
    "team themselves or by their qualified tradesman friends they share work with — "
    "including plumbing, electrics, tiling, carpentry, flooring, plastering, handyman work "
    "and general domestic maintenance. If a customer asks about a trade beyond decorating, "
    "confirm TMN can handle any domestic job through themselves or trusted qualified "
    "tradespeople, with TMN as the single point of contact. You give practical, honest "
    "guidance on minor painting, decorating and home-maintenance questions: paint types, "
    "sheens, preparation, drying times, colour pairing, common repairs and upkeep. Keep "
    "answers short and clear (2-5 sentences unless steps are requested). You do not give "
    "prices, quotes, warranties or certifications — for quotes, bookings, site visits or "
    "anything needing a person, politely point the customer to WhatsApp or call 07736 "
    "325643, or email info@tmndecorating.co.uk. If a question is unrelated to property "
    "work, gently steer back to what TMN can help with."
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
