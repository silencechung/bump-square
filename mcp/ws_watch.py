#!/usr/bin/env python3
"""Block on the bump-square SSE stream; print PENDING and exit cleanly the
instant a pending agentRequest appears. Used by the webpage worker agent as a
reliable watch (no lingering process, unlike `curl -sN | grep`)."""
import sys
import urllib.request

URL = "http://localhost:4399/api/events"

try:
    resp = urllib.request.urlopen(URL, timeout=3600)
    for raw in resp:
        line = raw.decode("utf-8", "replace")
        if line.startswith("data:") and '"status":"pending"' in line:
            print("PENDING")
            break
    resp.close()
except Exception as e:  # noqa: BLE001 - watcher must fail loud, not hang
    print(f"WATCH_ERROR {e}", file=sys.stderr)
    sys.exit(1)
