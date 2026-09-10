#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
source scripts/ui-audit/env.integration.sh
F=src/app/app/pengiriman/rts/page.tsx
B="$(mktemp)"
cp "$F" "$B"; trap 'cp "$B" "$F"' EXIT
fails=0
run() { pnpm exec vitest run --config vitest.integration.config.mts tests/rts-presentation.integration.test.ts tests/shipment-status-copy.integration.test.ts >/dev/null 2>&1; }
check() { if run; then echo "SURVIVED: $1"; fails=$((fails+1)); else echo "killed:   $1"; fi; cp "$B" "$F"; }

# --- round 1's four ----------------------------------------------------------
sed -i 's/aria-current={active ? "true" : undefined}/aria-current={active ? "page" : undefined}/' "$F"
check 'r1: aria-current="page" on filter chips'
sed -i 's/aria-label="Filter status retur"/aria-label="Filter"/' "$F"
check 'r1: nav label changed'
sed -i 's/role: "region",/role: "presentation",/' "$F"
check 'r1: scroll region role removed'
sed -i 's/tabIndex: 0,//' "$F"
check 'r1: scroll region tabIndex removed'
sed -i '0,/SHIPMENT_STATUS_PRESENTATION.RTS_QUEUED.label/s//"Antre Retur"/' "$F"
check 'r1: hardcoded retired label reintroduced'

# --- the three review broke in round 1 ---------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
kpi = '''      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border p-4"><p className="text-sm">Antre retur</p><strong className="text-3xl">{data.summary.queuedCount}</strong></div>
        <div className="rounded-xl border p-4"><p className="text-sm">Retur dalam perjalanan</p><strong className="text-3xl">{data.summary.inTransitCount}</strong></div>
        <div className="rounded-xl border p-4"><p className="text-sm">Retur diterima</p><strong className="text-3xl">{data.summary.receivedCount}</strong></div>
        <div className="rounded-xl border p-4"><p className="text-sm">Bermasalah</p><strong className="text-3xl">{data.summary.problemCount}</strong></div>
      </div>
'''
m='      <Card className="rounded-lg shadow-none">'
assert m in s
open(p,'w').write(s.replace(m, kpi+m, 1))
PY
check 'r1: KPI tiles as divs reading data.summary'
sed -i 's|<nav aria-label="Filter status retur"|<div aria-label="Filter status retur"|; s|</nav>|</div>|' "$F"
check 'r1: nav landmark downgraded to a labelled div'
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old='''                          </Link>
'''
new='''                          </Link>
                          <div className="text-muted-foreground">{`ID: ${row.shipmentId.slice(0, 8).toUpperCase()}`}</div>
'''
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r1: ID line as a template literal'

# --- the four review broke in round 2 ----------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
kpi = '''      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {filterTabs.slice(0, 4).map((tab) => (
          <div key={tab.key} className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{tab.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{tab.count}</p>
          </div>
        ))}
      </div>
'''
m='      <Card className="rounded-lg shadow-none">'
assert m in s
open(p,'w').write(s.replace(m, kpi+m, 1))
PY
check 'r2: KPI row rebuilt from filterTabs, reading no data.summary'

sed -i 's|<nav aria-label="Filter status retur"|<nav role={"tablist"} aria-label="Filter status retur"|' "$F"
check 'r2: role={"tablist"} in brace spelling'

python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
helper='''function shortRowId(row: { shipmentId: string }): string {
  return row.shipmentId.slice(0, 8).toUpperCase();
}

'''
anchor='export const metadata: Metadata = {'
assert anchor in s
s=s.replace(anchor, helper+anchor, 1)
old='''                          </Link>
'''
new='''                          </Link>
                          <div className="text-muted-foreground">ID: {shortRowId(row)}</div>
'''
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r2: ID line via a helper taking the row'

sed -i 's|containerClassName="focus-visible|className={"overflow-x-auto"} containerClassName="focus-visible|' "$F"
check 'r2: brace-spelled overflow-x-auto on the table'

# --- the three review broke in round 3 ---------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
kpi = '''      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {filterTabs.slice(0, 4).map((tab) => (
          <div key={tab.key} className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{tab.label}</p>
            <p className="text-2xl font-semibold">{tab.count} kiriman</p>
          </div>
        ))}
      </div>
'''
m='      <Card className="rounded-lg shadow-none">'
assert m in s
open(p,'w').write(s.replace(m, kpi+m, 1))
PY
check 'r3: KPI tiles printing "{count} kiriman" rather than a bare number'

python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old='''                          </Link>
'''
new='''                          </Link>
                          <div className="text-muted-foreground">Ref {row.shipmentId.slice(0, 7).toUpperCase()}</div>
'''
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r3: second identifier as "Ref" with a 7-character slice'

python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
m='          <nav aria-label="Filter status retur"'
extra='          <div className="overflow-auto whitespace-nowrap"><span className="min-w-[70rem] inline-block">Ringkasan retur</span></div>\n'
assert m in s
open(p,'w').write(s.replace(m, extra+m, 1))
PY
check 'r3: unlabelled overflow-auto strip beside the filter'

# --- the round 4 review broke -------------------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
kpi = '''          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {filterTabs.slice(0, 4).map((tab) => (
              <div key={tab.key} className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">{tab.label}</p>
                <p className="text-2xl font-semibold">{tab.count} kiriman</p>
              </div>
            ))}
          </div>
'''
m='          <nav aria-label="Filter status retur"'
assert m in s
open(p,'w').write(s.replace(m, kpi+m, 1))
PY
check 'r4: KPI tiles moved INSIDE the nav element'

# --- round 5 review broke -----------------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old = """                          </Link>
"""
new = """                          </Link>
                          <span className="block text-[10px] text-muted-foreground">Ref {row.shipmentId.slice(9, 17).toUpperCase()}</span>
"""
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r5: second identifier as a middle slice of the UUID'

# --- round 6 review broke -------------------------------------------------
python3 - "$F" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
old = """                          </Link>
"""
new = """                          </Link>
                          <span className="block text-[10px] text-muted-foreground">{row.shipmentId.slice(9, 14)}</span>
"""
assert old in s
open(p,'w').write(s.replace(old,new,1))
PY
check 'r6: second identifier as a 5-character middle slice'

# --- round 13 review broke -------------------------------------------------
# The "keeps the wide table scrollable rather than clipped" assertion had
# never been mutated across 12 rounds, even though the guard itself, tested
# live, correctly catches a shrunk table width.
sed -i 's/min-w-\[70rem\]/min-w-[40rem]/' "$F"
check 'r13: wide table shrunk below its declared min-width, so it would clip instead of scroll'

if run; then echo "baseline: PASS"; else echo "baseline: FAIL"; fails=$((fails+1)); fi
exit $fails
