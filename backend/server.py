from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import bcrypt
import jwt
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, APIRouter, Request, HTTPException, Depends
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response
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
