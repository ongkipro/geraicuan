#!/usr/bin/env bash
# The sticky probe must reject every way a sticky column can stop being opaque,
# not one utility spelling. Uses python for the edits: the baseline class
# contains brackets, and sed treats them as a character range and silently
# applies nothing — which reads as a surviving mutation.
#
# Requires a dev server already running (see scripts/ui-audit/env.dev.sh and
# README.md) and CDP Chrome reachable (see scripts/ui-audit/run.sh).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
UIA=scripts/ui-audit
# The integration suite tears down the demo seed. Chained right after it (as
# recording this check does), the RTS table has too few rows to scroll at all,
# every mutation reads as a silent "no sticky table found" pass, and the
# recorded evidence FAILs for a reason with nothing to do with the code.
source "$UIA/env.dev.sh" && pnpm db:seed-local >/dev/null
F=src/app/app/pengiriman/rts/page.tsx
B="$(mktemp)"
CSS=src/app/globals.css
CSSB="$(mktemp)"
KF=src/app/app/kontak/contact-directory-browser.tsx
KB="$(mktemp)"
cp "$F" "$B"; cp "$CSS" "$CSSB"; cp "$KF" "$KB"
trap 'cp "$B" "$F"; cp "$CSSB" "$CSS"; cp "$KB" "$KF"; sleep 3' EXIT
fails=0
OPAQUE='group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]'

apply() { python3 -c "
import sys
p=sys.argv[1]; old=sys.argv[2]; new=sys.argv[3]
s=open(p).read()
assert old in s, 'mutation target missing: ' + old[:40]
open(p,'w').write(s.replace(old,new,1))
" "$F" "$2" "$3" || { echo "MUTATION DID NOT APPLY: $1"; return 1; }; }

check() {
  sleep 4
  local out; out=$(node "$UIA/sticky-check.mjs" 2>&1)
  if [ -z "$out" ]; then echo "VACUOUS (no sticky table observed): $1"; fails=$((fails+1));
  elif echo "$out" | grep -q "not sticky\|not opaque\|translucent\|transparent stop"; then echo "killed:   $1";
  else echo "SURVIVED: $1 | $out"; fails=$((fails+1)); fi
  cp "$B" "$F"
}

for spelling in "group-hover:bg-muted/50|fractional opacity utility" \
                "group-hover:bg-transparent|bg-transparent on hover" \
                "group-hover:bg-muted/[40%]|arbitrary percentage opacity" \
                "group-hover:bg-[rgba(0,0,0,0.3)]|arbitrary rgba value"; do
  value="${spelling%%|*}"; label="${spelling##*|}"
  apply "$label" "$OPAQUE" "$value" && check "$label"
done

# T-172: the pinned cell inherits its row's fill instead of repainting `bg-card`,
# so the class this mutation drops `sticky` from moved with it.
apply 'column no longer sticky' 'sticky left-0 z-10 max-w-40 whitespace-normal bg-inherit' 'z-10 max-w-40 whitespace-normal bg-inherit' && check 'column no longer sticky'

apply 'background-image gradient fading to transparent on hover' \
  "$OPAQUE" 'group-hover:bg-[image:linear-gradient(var(--muted),transparent)]' && \
  check 'r5: background-image gradient fading to transparent on hover'

# --- round 6 review broke -------------------------------------------------
# A transparent gradient stop expressed through a var() indirection, not the
# literal keyword: `parse()` cannot read var(), so the stop has to be resolved
# through the cell's own cascade rather than matched as text. The token lives
# in globals.css, not the page - it is its own file with its own backup.
printf '\n:root { --review-ghost: rgba(0,0,0,0); }\n' >> "$CSS"
apply 'gradient stop hidden behind a var() indirection' \
  "$OPAQUE" 'group-hover:bg-[image:linear-gradient(var(--muted),var(--review-ghost))]' && \
  check 'r6: gradient stop hidden behind a var() indirection'
cp "$CSSB" "$CSS"

# --- round 8 review broke --------------------------------------------------
# The sticky check gated entry on `min-width >= 600px`, so /app/kontak's table
# (min-w-[34rem] = 544px) was silently never examined at any viewport, despite
# BUILD-LOG claiming the round-3/4 fix applied uniformly to all four tables.
# This table has its own file, not the RTS page, so it needs its own mutation.
apply_kontak() { python3 -c "
import sys
p=sys.argv[1]; old=sys.argv[2]; new=sys.argv[3]
s=open(p).read()
assert old in s, 'mutation target missing: ' + old[:40]
open(p,'w').write(s.replace(old,new,1))
" "$KF" "$2" "$3" || { echo \"MUTATION DID NOT APPLY: $1\"; return 1; }; }

check_kontak() {
  sleep 4
  local out; out=$(node "$UIA/kontak-check.mjs" 2>&1)
  if echo "$out" | grep -q "ok=1"; then echo "SURVIVED: $1 | $out"; fails=$((fails+1));
  elif echo "$out" | grep -q "ok=0"; then echo "killed:   $1";
  else echo "VACUOUS (kontak table not observed): $1 | $out"; fails=$((fails+1)); fi
  cp "$KB" "$KF"
}

apply_kontak 'r8: kontak sticky column no longer opaque on hover' \
  'group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]' 'group-hover:bg-transparent' && \
  check_kontak 'r8: kontak sticky column no longer opaque on hover'

sleep 4
out=$(node "$UIA/sticky-check.mjs" 2>&1)
if [ -z "$out" ]; then echo "baseline: VACUOUS (no sticky table observed at all)"; fails=$((fails+1));
elif echo "$out" | grep -q "not sticky\|not opaque\|translucent\|transparent stop"; then echo "baseline: FAIL | $out"; fails=$((fails+1));
else echo "baseline: PASS | $out"; fi

out=$(node "$UIA/kontak-check.mjs" 2>&1)
# T-188: kontak-check prints one line per role list; baseline needs both clean.
if echo "$out" | grep -q "ok=1" && ! echo "$out" | grep -q "ok=0"; then echo "baseline (kontak): PASS | $out";
else echo "baseline (kontak): FAIL | $out"; fails=$((fails+1)); fi

exit $fails
