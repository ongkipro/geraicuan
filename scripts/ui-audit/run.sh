#!/usr/bin/env bash
set -euo pipefail
# Full T-77 browser-based UI audit: contrast, focus rings, headings, layout,
# sticky columns, loading skeletons, and every scenario/viewport pair the
# repository declares. Requires a running dev server (see README.md's "Local
# development", or set UI_AUDIT_ORIGIN to point elsewhere) and POSTGRES_PASSWORD
# exported. Chrome is started automatically if not already reachable.
cd "$(git rev-parse --show-toplevel)"
UIA=scripts/ui-audit

"$UIA/start-chrome.sh"

if ! curl -s -o /dev/null "${UI_AUDIT_ORIGIN:-http://localhost:3000}"; then
  echo "Dev server not reachable at ${UI_AUDIT_ORIGIN:-http://localhost:3000}." >&2
  echo "Start it per README.md's Local development section first." >&2
  exit 1
fi

# The integration suite tears the demo data down, so a UI sweep run after it
# would screen empty states and call them clean. Re-seed first, always.
source "$UIA/env.dev.sh"
pnpm db:seed-local >/dev/null

# The probe must be runnable before anything else: a backtick or a single
# backslash inside its template makes it silently different or fatal.
node "$UIA/probe-lint.mjs"

# The probe must prove it binds before its verdict counts for anything.
node "$UIA/contrast-selftest.mjs" | tee /dev/stderr | grep -q "SELFTEST PASS"
node "$UIA/probe-coverage-selftest.mjs" | tee /dev/stderr | grep -q "PROBE COVERAGE SELFTEST PASS"

out=$(node "$UIA/sweep.mjs")
echo "$out"
# Coverage and result are asserted separately. A single grep for both numbers
# reads as a failing sweep when only the count moved: excluding nine
# unreachable scenarios changed 312 to 303 and this gate reported "STATE
# FINDINGS" for a sweep that had found none.
route_pairs=$(echo "$out" | sed -n 's/^route sweep: \([0-9]*\) .*/\1/p')
state_pairs=$(echo "$out" | sed -n 's/^state sweep: \([0-9]*\) .*/\1/p')
# T-188 split /app/kontak into /app/kontak/pengirim and /app/kontak/penerima: 23 routes x 3 viewports.
[ "$route_pairs" = "69" ] || { echo "ROUTE COVERAGE CHANGED: $route_pairs pairs, expected 69"; exit 1; }
[ "$state_pairs" -ge 300 ] 2>/dev/null || { echo "STATE COVERAGE SHRANK: $state_pairs pairs"; exit 1; }
echo "$out" | grep -q "^route sweep: .*; 0 with findings" || { echo "ROUTE FINDINGS"; exit 1; }
echo "$out" | grep -q "^state sweep: .*; 0 with findings" || { echo "STATE FINDINGS"; exit 1; }
echo "$out" | grep -q "console errors: none" || { echo "CONSOLE ERRORS"; exit 1; }
if echo "$out" | grep -q "INSPECTED ALMOST NOTHING"; then echo "VACUOUS CONTRAST PASS"; exit 1; fi
if echo "$out" | grep -q "REDIRECTED"; then echo "PAGES NOT ACTUALLY SCREENED"; exit 1; fi

# The a11y script now asserts its own measurements and carries them in its exit
# code; gating only on console errors let every one of them regress silently.
a=$(node "$UIA/rts-a11y.mjs") || { echo "$a"; echo "RTS A11Y ASSERTIONS FAILED"; exit 1; }
echo "$a"
echo "$a" | grep -q "A11Y ASSERTIONS PASS" || { echo "RTS A11Y ASSERTIONS DID NOT RUN"; exit 1; }

# A scenario that renders exactly its base route did not take effect.
echo "$out" | grep -q "scenario pairs indistinguishable from their base route: 0" \
  || { echo "SCENARIOS THAT DID NOT TAKE EFFECT"; exit 1; }
exit 0
