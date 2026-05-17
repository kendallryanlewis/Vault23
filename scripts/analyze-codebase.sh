#!/usr/bin/env bash
# analyze-codebase.sh
# Runs before every agent command (UserPromptSubmit hook).
# Reads stdin for the hook payload, then outputs a systemMessage
# containing a live snapshot of the project structure and key stats.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Collect directory tree (depth 4, skip noise) ──────────────────────────
TREE="$(find "$ROOT" \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.build/*' \
  -not -path '*/.gradle/*' \
  -not -path '*/__pycache__/*' \
  -not -path '*/.DS_Store' \
  -not -name '*.pyc' \
  -maxdepth 4 \
  | sort \
  | sed "s|$ROOT/||" \
  | sed 's|[^/]*/|  |g' \
  || true)"

# ── 2. Count source files by extension ────────────────────────────────────────
count_ext() {
  find "$ROOT" \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -name "*.$1" 2>/dev/null | wc -l | tr -d ' '
}

SWIFT=$(count_ext swift)
TS=$(count_ext ts)
TSX=$(count_ext tsx)
JS=$(count_ext js)
PY=$(count_ext py)
KT=$(count_ext kt)
DART=$(count_ext dart)

# ── 3. Detect framework / package manager ─────────────────────────────────────
FRAMEWORK=""
[[ -f "$ROOT/package.json" ]]       && FRAMEWORK="Node/JS (package.json detected)"
[[ -f "$ROOT/pubspec.yaml" ]]       && FRAMEWORK="Flutter/Dart (pubspec.yaml detected)"
[[ -f "$ROOT/Podfile" ]]            && FRAMEWORK="iOS/CocoaPods (Podfile detected)"
[[ -d "$ROOT/*.xcodeproj" ]]        && FRAMEWORK="Xcode project (xcodeproj detected)"
[[ -f "$ROOT/build.gradle" ]]       && FRAMEWORK="Android/Gradle (build.gradle detected)"
[[ -f "$ROOT/requirements.txt" ]]   && FRAMEWORK="Python (requirements.txt detected)"
[[ -f "$ROOT/Cargo.toml" ]]         && FRAMEWORK="Rust (Cargo.toml detected)"
[[ -z "$FRAMEWORK" ]]               && FRAMEWORK="(no known framework marker found)"

# Xcode glob needs a sub-shell with nullglob
XCODEPROJ="$(find "$ROOT" -maxdepth 2 -name "*.xcodeproj" -type d 2>/dev/null | head -1 || true)"
[[ -n "$XCODEPROJ" ]] && FRAMEWORK="Xcode project: $(basename "$XCODEPROJ")"

# ── 4. List recent changes (last 10 modified source files) ────────────────────
RECENT="$(find "$ROOT" \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -name '.DS_Store' \
  -type f \
  -newer "$ROOT/.git/index" 2>/dev/null \
  | head -10 \
  | sed "s|$ROOT/||" \
  || true)"

# ── 5. Build clean JSON output ────────────────────────────────────────────────
# Read and discard stdin (required by hook protocol)
read -r -d '' INPUT || true

python3 - <<PYEOF
import json, sys

tree     = """$TREE"""
recent   = """$RECENT"""
framework = "$FRAMEWORK"
counts = {
    "swift": $SWIFT,
    "ts": $TS,
    "tsx": $TSX,
    "js": $JS,
    "py": $PY,
    "kt": $KT,
    "dart": $DART,
}

file_summary = ", ".join(
    f"{v} .{k}" for k, v in counts.items() if int(v) > 0
) or "no source files yet"

sections = [
    "=== CODEBASE SNAPSHOT (auto-injected before this command) ===",
    f"Framework/Stack: {framework}",
    f"Source file counts: {file_summary}",
    "",
    "Directory structure (depth ≤4, excludes node_modules/.git):",
    tree.strip() or "(workspace is empty)",
]

if recent.strip():
    sections += ["", "Recently modified files:", recent.strip()]

message = "\n".join(sections)

print(json.dumps({"systemMessage": message}))
PYEOF
