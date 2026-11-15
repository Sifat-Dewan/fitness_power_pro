"""Fitness Power K40 local connector.

Runs on a computer in the same network as the ZKTeco K40. Uses only HTTPS
outbound to Fitness Power and LAN TCP 4370 to the device. No DB credentials,
Better Auth session, inbound ports, or fingerprint templates required.

First test: python agent.py --once
Normal:     python agent.py

Permanent K40 user deletion is disabled by default; opt in ONLY after backups
and a disposable-user test. The website queues commands but never pretends
that the hardware already complied.
"""
from __future__ import annotations
import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from zk import ZK

load_dotenv(Path(__file__).with_name(".env"))

SITE = os.environ.get("SITE_URL", "").rstrip("/")
TOKEN = os.environ.get("K40_AGENT_TOKEN", "")
DEVICE_ID = os.environ.get("K40_DEVICE_ID", "gym-k40-01")
HOST = os.environ.get("K40_IP", "192.168.0.123")
PORT = int(os.environ.get("K40_PORT", "4370"))
PASSWORD = int(os.environ.get("K40_PASSWORD", "0"))
SYNC_SECONDS = max(30, int(os.environ.get("SYNC_SECONDS", "120")))
POLL_SECONDS = max(5, int(os.environ.get("POLL_SECONDS", "15")))
ALLOW_DELETE = os.environ.get("ENABLE_K40_DELETIONS", "false").strip().lower() == "true"

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger("fitness-power-k40")


def request_api(method: str, path: str, data: dict | None = None, *, allow_delete: bool = False):
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
        "Cache-Control": "no-store",
        "X-Allow-Deletion": "true" if allow_delete else "false",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = Request(SITE + path, data=payload, method=method, headers=headers)
    try:
        with urlopen(req, timeout=45) as res:
            response = json.load(res)
            return response.get("data", response)
    except HTTPError as error:
        try:
            msg = error.read(512).decode("utf-8", "replace")
        except OSError:
            msg = ""
        raise RuntimeError(f"Cloud API {error.code} at {path}: {msg}") from error
    except URLError as error:
        raise RuntimeError(f"Cloud connection error at {path}: {error.reason}") from error


def connect():
    terminal = ZK(HOST, port=PORT, timeout=30, password=PASSWORD, force_udp=False)
    return terminal.connect()


def device_inventory():
    conn = connect()
    try:
        return [{
            "userId": str(u.user_id).strip(),
            "uid": int(u.uid),
            "name": (u.name or "").strip(),
            "privilege": int(u.privilege or 0),
        } for u in conn.get_users()]
    finally:
        conn.disconnect()


def sync_inventory():
    users = device_inventory()
    result = request_api("POST", "/api/k40/agent/sync-users", {"deviceId": DEVICE_ID, "users": users})
    logger.info("K40 inventory: %s users; %s new members; %s matched", result["received"], result["imported"], result["matched"])
    if result.get("conflicts"):
        logger.warning("Name mismatches requiring review: %s", result["conflicts"])
    return result


def heartbeat_connected():
    # A successful TCP connection is checked before reporting online state.
    conn = connect()
    try:
        conn.get_time()  # Lightweight device response; full inventory runs less often.
    finally:
        conn.disconnect()
    request_api("POST", "/api/k40/agent/heartbeat", {"connected": True})


def delete_exact_user(user_id: str, uid: int):
    conn = connect()
    try:
        users = list(conn.get_users())
        matching = [u for u in users if str(u.user_id).strip() == str(user_id)]
        if not matching:
            logger.warning("K40 user %s no longer exists; treating deletion as already complete", user_id)
            return
        if len(matching) != 1:
            raise RuntimeError("Duplicate K40 User ID detected: deletion blocked")
        target = matching[0]
        if int(target.uid) != int(uid):
            raise RuntimeError(f"UID mismatch for User ID {user_id}; refusing to delete any account")
        if int(target.privilege or 0) != 0:
            raise RuntimeError("K40 administrator account deletion blocked")
        outcome = conn.delete_user(uid=int(uid), user_id=str(user_id))
        if outcome is False:
            raise RuntimeError("K40 rejected the delete command")
        remaining = list(conn.get_users())
        if any(str(u.user_id).strip() == str(user_id) for u in remaining):
            raise RuntimeError("Verification failed: K40 still lists this user")
        logger.warning("K40 confirmed removal of User ID %s (UID %s)", user_id, uid)
    finally:
        conn.disconnect()


def poll_command():
    # Without local opt-in, the server leaves physical delete commands queued.
    response = request_api("GET", "/api/k40/agent/commands", allow_delete=ALLOW_DELETE)
    command = response.get("command")
    if not command:
        return
    logger.warning("Claimed device command %s (%s)", command["id"], command["type"])
    successful = False
    error_msg = None
    try:
        if not ALLOW_DELETE or command["type"] != "delete_user":
            raise RuntimeError("Command is not enabled on this gym connector")
        delete_exact_user(str(command["userId"]), int(command["uid"]))
        successful = True
    except Exception as error:  # retain the failed operation in the cloud audit trail
        error_msg = str(error)[:500]
        logger.exception("Device command failed")
    # ACK must use the lease token from this particular claim.
    request_api("POST", "/api/k40/agent/commands/ack", {
        "id": command["id"], "leaseToken": command["leaseToken"],
        "success": successful, "error": error_msg,
    })


def main():
    parser = argparse.ArgumentParser(description="Fitness Power gym K40 connector")
    parser.add_argument("--once", action="store_true", help="Sync users once, without running device deletion commands")
    args = parser.parse_args()
    if not SITE.startswith("https://") and not SITE.startswith("http://localhost:"):
        sys.exit("SITE_URL must use HTTPS (localhost allowed only for local tests)")
    if not TOKEN or len(TOKEN) < 32 or "REPLACE" in TOKEN:
        sys.exit("K40_AGENT_TOKEN must match the secure 32+ character value on the website")
    if args.once:
        sync_inventory()
        return
    logger.info("Starting K40 agent for %s; physical deletions %s", DEVICE_ID, "ENABLED" if ALLOW_DELETE else "DISABLED")
    last_sync = 0.0
    while True:
        try:
            if time.monotonic() - last_sync >= SYNC_SECONDS:
                sync_inventory()
                last_sync = time.monotonic()
            else:
                heartbeat_connected()
            if ALLOW_DELETE:
                poll_command()
        except KeyboardInterrupt:
            logger.info("Stopping K40 agent")
            return
        except Exception as error:
            logger.exception("K40 or cloud error: %s", error)
            try:
                request_api("POST", "/api/k40/agent/heartbeat", {"connected": False, "error": str(error)[:200]})
            except Exception:
                logger.warning("Could not update offline status in cloud")
        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()
