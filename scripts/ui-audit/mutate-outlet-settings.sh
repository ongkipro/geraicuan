#!/usr/bin/env bash
# Round 14 review found tests/outlet-settings-page.integration.test.ts's
# aria-current guard - added by this task's own T-77 commit to fix a real
# double-"aria-current=page" defect on /app/pengaturan - had zero mutation
# coverage, unlike every other guard this task touched. The guard itself was
# proven live to catch a break; only the permanent mutation-suite proof was
# missing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/ui-audit/env.integration.sh
F=src/app/app/pengaturan/outlet-settings-workspace.tsx
B="$(mktemp)"
cp "$F" "$B"; trap 'cp "$B" "$F"' EXIT
fails=0
run() { pnpm exec vitest run --config vitest.integration.config.mts tests/outlet-settings-page.integration.test.ts >/dev/null 2>&1; }
check() { if run; then echo "SURVIVED: $1"; fails=$((fails+1)); else echo "killed:   $1"; fi; cp "$B" "$F"; }

sed -i 's/aria-current={active ? "true" : undefined}/aria-current={active ? "page" : undefined}/' "$F"
check 'r14: outlet selector reintroduces the second aria-current="page"'

if run; then echo "baseline: PASS"; else echo "baseline: FAIL"; fails=$((fails+1)); fi
exit $fails
