"""Genuinely zero-cost, self-hosted AI for TMN Decorating & Maintenance.

Both AI features run open-source models INSIDE this server as short-lived
worker processes (ai_worker.py): no external AI service, no API key, no
account, no usage caps and nothing that can bill. Results are never
simulated and there is deliberately no fallback to any hosted AI.

An asyncio lock keeps exactly one heavy image generation running at a time
so the pod's 8GB memory cap is never exceeded; if the worker is ever killed
by memory pressure, the request returns an honest error and the website
itself is unaffected.
"""
import asyncio
import json
import logging
import os
import sys
import tempfile

logger = logging.getLogger(__name__)

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_worker.py")
SD_JOB_TIMEOUT = 900       # seconds — model load + 24-step CPU generation
CHAT_JOB_TIMEOUT = 300     # seconds

_sd_lock = asyncio.Lock()
_jobs = {}  # job_id -> {"status": working|done|failed, "image": bytes, "error": str}


async def start_colour_job(job_id, image_bytes, prompt, negative_prompt):
    """Kick off a generation in the background; the site polls for the result.
    Long jobs must never hold an HTTP connection open (the public edge cuts
    responses at ~60s)."""
    _jobs[job_id] = {"status": "working"}
    if len(_jobs) > 40:  # keep memory tidy
        for k in list(_jobs)[:-20]:
            _jobs.pop(k, None)

    async def run():
        try:
            img = await generate_colour_edit(image_bytes, prompt, negative_prompt)
            _jobs[job_id] = {"status": "done", "image": img}
        except Exception as e:
            logger.error("colour job %s failed: %s", job_id, e)
            _jobs[job_id] = {"status": "failed", "error": str(e)[:200]}

    asyncio.create_task(run())


def get_colour_job(job_id):
    job = _jobs.get(job_id)
    if not job:
        return {"status": "unknown"}
    if job["status"] == "done":
        import base64

        return {
            "status": "done",
            "image": "data:image/png;base64," + base64.b64encode(job["image"]).decode(),
        }
    if job["status"] == "failed":
        return {"status": "failed"}
    return {"status": "working"}


async def generate_colour_edit(image_bytes: bytes, prompt: str, negative_prompt: str = "") -> bytes:
    """Real AI repaint of an uploaded photo, generated locally. Returns PNG bytes."""
    async with _sd_lock:
        with tempfile.TemporaryDirectory() as td:
            img_path = os.path.join(td, "input.png")
            prompt_path = os.path.join(td, "prompt.txt")
            neg_path = os.path.join(td, "negative.txt")
            out_path = os.path.join(td, "output.png")
            with open(img_path, "wb") as f:
                f.write(image_bytes)
            with open(prompt_path, "w") as f:
                f.write(prompt)
            with open(neg_path, "w") as f:
                f.write(negative_prompt)

            proc = await asyncio.create_subprocess_exec(
                sys.executable, WORKER, "image", img_path, prompt_path, neg_path, out_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, err = await asyncio.wait_for(proc.communicate(), timeout=SD_JOB_TIMEOUT)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                raise RuntimeError("local image model timed out")
            if proc.returncode != 0 or not os.path.exists(out_path):
                tail = err.decode(errors="replace").strip().splitlines()[-3:] if err else []
                raise RuntimeError("local image worker failed: " + " | ".join(tail))
            with open(out_path, "rb") as f:
                return f.read()


async def stream_chat(message: str, system_prompt: str):
    """Yield text deltas from the local chat model worker."""
    with tempfile.TemporaryDirectory() as td:
        system_path = os.path.join(td, "system.txt")
        with open(system_path, "w") as f:
            f.write(system_prompt)
        err_path = os.path.join(td, "worker.err")

        with open(err_path, "wb") as err_file:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, WORKER, "chat", message, system_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=err_file,
            )
            produced = False
            try:
                async with asyncio.timeout(CHAT_JOB_TIMEOUT):
                    async for raw in proc.stdout:
                        line = raw.decode(errors="replace").strip()
                        if not line:
                            continue
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if event.get("delta"):
                            produced = True
                            yield event["delta"]
                        if event.get("done"):
                            break
            finally:
                if proc.returncode is None:
                    proc.kill()
                await proc.wait()
        if not produced:
            with open(err_path, "rb") as f:
                tail = f.read().decode(errors="replace").strip().splitlines()[-3:]
            raise RuntimeError("local chat worker failed: " + " | ".join(tail))
