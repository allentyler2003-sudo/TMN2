"""Genuinely zero-cost, self-hosted AI for the TMN assistant chat.

The chat runs an open-source model (Qwen2.5-0.5B-Instruct) INSIDE this server
as a short-lived worker process (ai_worker.py): no external AI service, no API
key, no usage caps and nothing that can bill. Replies are never simulated and
there is deliberately no fallback to any hosted AI.

(The colour visualiser is fully client-side image processing — see
frontend/src/components/ColourStudio.jsx — and needs no backend AI at all.)
"""
import asyncio
import json
import logging
import os
import sys
import tempfile

logger = logging.getLogger(__name__)

WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai_worker.py")
CHAT_JOB_TIMEOUT = 300  # seconds


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
