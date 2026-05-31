#!/usr/bin/env bash
# Health report for the bump-square environment + project-dir detection.
# Location-agnostic: works whether this skill is installed at user or project level.
set -u

status() { curl -sf -o /dev/null --max-time 2 "$1" && echo up || echo DOWN; }

echo "dev(:4399):      $(status http://localhost:4399/)"
echo "fakechat(:8787): $(status http://localhost:8787/)"
echo "cdp(:9222):      $(curl -sf -o /dev/null --max-time 2 http://localhost:9222/json/version && echo up || echo down)"

# Locate the bump-square project dir (so the caller knows where to run pnpm dev).
found=""
for d in "${CLAUDE_PROJECT_DIR:-}" "$PWD" "$HOME/Documents/Projects/bump-square"; do
  [ -n "$d" ] || continue
  if [ -f "$d/package.json" ] && grep -q '"name": *"bump-square"' "$d/package.json" 2>/dev/null; then
    found="$d"; break
  fi
done
if [ -n "$found" ]; then echo "project:         $found"; else echo "project:         NOT FOUND (cd into the bump-square repo)"; fi
