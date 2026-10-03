"""
SSCI ASGI entry (server:app) for the platform's supervisor.

The platform's supervisor is read-only and expects:
    uvicorn server:app --host 0.0.0.0 --port 8001

The real SSCI backend is a Node.js + Express + Mongoose server. To honor the
supervisor contract without rewriting the backend, this module:

  1. Spawns the Node Express server as a child process on port 8002.
  2. Exposes an ASGI `app` that reverse-proxies every HTTP request from
     uvicorn:8001 to the Node server on 127.0.0.1:8002.

All inbound requests from the preview URL / platform ingress (/api/*)
flow: Ingress -> uvicorn:8001 (this module) -> Node Express:8002.
"""
from __future__ import annotations

import asyncio
import atexit
import logging
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import Response

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

NODE_PORT = int(os.environ.get("NODE_BACKEND_PORT", "8002"))
NODE_HOST = "127.0.0.1"
NODE_UPSTREAM = f"http://{NODE_HOST}:{NODE_PORT}"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [asgi-proxy] %(levelname)s: %(message)s",
)
log = logging.getLogger("ssci.proxy")

_node_proc: Optional[subprocess.Popen] = None


def _node_env() -> dict:
    env = os.environ.copy()
    env["PORT"] = str(NODE_PORT)
    # The Node server reads MONGO_URL, DB_NAME, JWT_SECRET from env (.env also loaded by Node)
    return env


def _spawn_node() -> subprocess.Popen:
    log.info("Spawning Node Express backend on port %s ...", NODE_PORT)
    proc = subprocess.Popen(
        ["node", "server/index.js"],
        cwd=str(BASE_DIR),
        env=_node_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        preexec_fn=os.setsid,
    )

    def _pump_logs() -> None:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            line = line.rstrip()
            if line:
                print(f"[node] {line}", flush=True)

    import threading

    threading.Thread(target=_pump_logs, daemon=True).start()
    return proc


def _wait_for_node(timeout: float = 25.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with httpx.Client(timeout=1.5) as c:
                r = c.get(f"{NODE_UPSTREAM}/health")
                if r.status_code in (200, 503):
                    log.info("Node backend reachable at %s (status=%s)", NODE_UPSTREAM, r.status_code)
                    return True
        except Exception:
            time.sleep(0.4)
    log.error("Node backend did not become reachable within %.1fs", timeout)
    return False


def _ensure_node_running() -> None:
    global _node_proc
    if _node_proc is not None and _node_proc.poll() is None:
        return
    _node_proc = _spawn_node()


def _shutdown_node() -> None:
    global _node_proc
    if _node_proc is None:
        return
    try:
        os.killpg(os.getpgid(_node_proc.pid), signal.SIGTERM)
        try:
            _node_proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(os.getpgid(_node_proc.pid), signal.SIGKILL)
    except Exception as exc:  # pragma: no cover
        log.warning("Error shutting down Node backend: %s", exc)


atexit.register(_shutdown_node)


app = FastAPI(title="SSCI ASGI Proxy", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
async def _on_startup() -> None:
    _ensure_node_running()
    await asyncio.to_thread(_wait_for_node, 25.0)


@app.on_event("shutdown")
async def _on_shutdown() -> None:
    _shutdown_node()


# Hop-by-hop headers that must not be forwarded.
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
}


_async_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _async_client
    if _async_client is None:
        _async_client = httpx.AsyncClient(
            base_url=NODE_UPSTREAM,
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=5.0),
        )
    return _async_client


async def _proxy(request: Request, path: str) -> Response:
    _ensure_node_running()

    url_path = "/" + path if not path.startswith("/") else path
    query = request.url.query
    full_path = f"{url_path}?{query}" if query else url_path

    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    client_ip = request.client.host if request.client else ""
    if client_ip:
        xff = headers.get("x-forwarded-for")
        headers["x-forwarded-for"] = f"{xff}, {client_ip}" if xff else client_ip
    headers.setdefault("x-forwarded-proto", request.url.scheme)

    body = await request.body()

    client = _get_client()
    try:
        upstream = await client.request(
            request.method,
            full_path,
            headers=headers,
            content=body,
        )
    except httpx.ConnectError:
        return Response(
            content=b'{"success":false,"message":"Backend service is starting up. Please retry in a moment."}',
            status_code=503,
            media_type="application/json",
        )
    except httpx.ReadTimeout:
        return Response(
            content=b'{"success":false,"message":"Backend request timed out."}',
            status_code=504,
            media_type="application/json",
        )

    response_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )


# Catch-all proxy route. Covers /api/*, /health, and anything else the Node server exposes.
@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def catch_all(request: Request, path: str) -> Response:
    return await _proxy(request, path)
