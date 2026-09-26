import type { Metadata } from "next";
import { headers } from "next/headers";

import type { TrackingLookupState } from "@/app/app/cek-resi/actions";
import { TrackingLookup } from "@/app/app/cek-resi/tracking-lookup";
import { requireContactPagePrincipal } from "@/app/app/kontak/contact-page-guard";
import { DataCard } from "@/components/app/data-card";
import { PageHeader } from "@/components/app/page-header";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false }, title: "Cek resi" };

/** Development-only audit states (spec 19 scenarios T-161/T-190); the action never sees them. */
const AUDIT_STATES: Partial<Record<string, TrackingLookupState>> = {
  "resi-lookup-found": {
    kind: "found",
    query: "GC-10013",
    result: {
      awb: "SANITIZED-AUDIT-AWB",
      courier: "JNE",
      declaredValueIdr: 250_000,
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      // T-238 courier lines (sanitized), so the audit shows the full newest-first timeline.
      historyEvents: [
        { description: "Paket tiba di gudang transit JAKARTA", occurredAtIso: "2026-09-14T16:40:00Z" },
        { description: "Paket dijemput kurir dari gerai", occurredAtIso: "2026-09-14T09:10:00Z" },
      ],
      observation: { observedAtIso: "2026-09-14T17:00:00Z", providerStatus: "ON PROCESS" },
      paymentMethod: "COD",
      providerCodAmountIdr: 270_000,
      providerService: "JNE REG",
      publicReference: "GC-10013",
      returnAwb: null,
      status: "IN_TRANSIT",
      updatedAtIso: "2026-09-14T17:05:00Z",
    },
  },
  // T-190: a COD Ongkir result shows the method and the shipping charge, never goods.
  "resi-lookup-found-cod-ongkir": {
    kind: "found",
    query: "GC-10014",
    result: {
      awb: "SANITIZED-AUDIT-AWB-2",
      courier: "SAP",
      declaredValueIdr: 250_000,
      destinationAreaLabel: "KEBAYORAN BARU, JAKARTA SELATAN",
      historyEvents: [],
      observation: { observedAtIso: "2026-09-14T17:00:00Z", providerStatus: "ON PROCESS" },
      paymentMethod: "COD_ONGKIR",
      providerCodAmountIdr: 20_000,
      providerService: "SAP REG",
      publicReference: "GC-10014",
      returnAwb: null,
      status: "IN_TRANSIT",
      updatedAtIso: "2026-09-14T17:05:00Z",
    },
  },
  "resi-lookup-limited": { kind: "limited", query: "GC-10013" },
  "resi-lookup-missing": { kind: "missing", query: "GC-99999" },
};

/** The rail (ref "Tips Pencarian"), without the reference's unverified update-latency claim. */
const TIPS = [
  <><strong className="font-semibold text-foreground">Nomor kiriman GeraiCUAN</strong> (awalan <span className="font-mono">GC-</span>) paling cepat ditemukan.</>,
  <><strong className="font-semibold text-foreground">Nomor resi kurir</strong> (AWB) juga bisa, misalnya <span className="font-mono break-all">11LP1700187536</span>.</>,
  <>Perjalanan paket memuat riwayat kurir dan status terakhir dari <strong className="font-semibold text-foreground">Mengantar</strong>; sumber tiap baris tertulis di sampingnya.</>,
  <>Hanya kiriman milik gerai ini yang dapat dilacak.</>,
];

/** Spec 17 `/app/cek-resi` (ref cek-resi.html): lookup + result in the main column, tips in the rail. */
export default async function TrackingLookupPage() {
  await requireContactPagePrincipal();
  const scenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/cek-resi")
    : null;
  if (scenario === "resi-lookup-error") throw new Error("Intentional development-only tracking lookup page failure.");

  return (
    <>
      <PageHeader
        description="Lacak kiriman gerai dengan nomor kiriman atau nomor resi kurir."
        title="Cek resi"
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TrackingLookup initialState={(scenario && AUDIT_STATES[scenario]) || { kind: "idle" }} />
        </div>
        <aside aria-label="Tips pencarian">
          <DataCard title="Tips pencarian">
            <ul className="grid gap-3 text-sm text-muted-foreground">
              {TIPS.map((tip, index) => (
                <li className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2" key={index}>
                  <span aria-hidden="true" className="mt-2 size-1.5 rounded-full bg-primary" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </DataCard>
        </aside>
      </div>
    </>
  );
}
