import type { Metadata } from "next";
import { CourierAwbStack, RecipientStack, StackedDateTime } from "@/components/cms/shipment-table-cells";
import { shipmentLabelHref } from "@/lib/shipment-number";
import { Check, CircleAlert, Printer, Search } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertRegion } from "@/app/_components/alert-region";
import { DataTableFacetFilter } from "@/components/cms/data-table-facet-filter";
import { DataTableToolbar } from "@/components/cms/data-table-toolbar";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { RangeFilterForm } from "@/components/cms/range-filter-form";
import { StateSummaryPanel } from "@/components/cms/state-summary-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { db } from "@/db/client";
import { loadLabelIndexPage, type LabelPrintStateFilter } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseAnalyticsRange, serializeAnalyticsRange } from "@/lib/analytics-range";
import { formatIdr } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type LabelIndexPageProps = {
  searchParams: Promise<Record<string, SearchValue>>;
};

/** PR-52 print-state entries; the label of each is the vocabulary the table column already uses. */
const PRINT_STATE_ENTRIES = [
  { description: "Seluruh kiriman pada tampilan status ini.", label: "Semua resi", metricId: "LBL-ALL", value: "semua" },
  { description: "Belum pernah tercatat dicetak sekali pun.", label: "Belum dicetak", metricId: "LBL-UNPRINTED", value: "belum" },
  { description: "Sudah punya minimal satu permintaan cetak berhasil.", label: "Sudah dicetak", metricId: "LBL-PRINTED", value: "sudah" },
] as const satisfies readonly { description: string; label: string; metricId: string; value: LabelPrintStateFilter }[];

function parsePrintState(value: string | undefined): LabelPrintStateFilter {
  return value === "belum" || value === "sudah" ? value : "semua";
}

const AWB_SUFFIX_PATTERN = /^[a-z0-9]{3,24}$/i;

function labelIndexHref(
  status: "issued" | "unpaid",
  awbSuffix: string,
  printState: LabelPrintStateFilter = "semua",
  /** The PR-53 range URL state, kept across a facet change. */
  carry?: Readonly<Record<string, string>>,
) {
  const params = new URLSearchParams(carry ?? {});
  params.delete("status");
  params.delete("q");
  params.delete("cetak");
  if (status === "unpaid") params.set("status", "unpaid");
  if (awbSuffix) params.set("q", awbSuffix);
  if (printState !== "semua") params.set("cetak", printState);
  const query = params.toString();
  return query ? `/app/label?${query}` : "/app/label";
}

function firstQueryValue(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

export default async function LabelIndexPage({
  searchParams,
}: LabelIndexPageProps) {
  const principal = await requireTenantPrincipal();
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/label")
    : null;
  if (auditScenario === "label-index-error") throw new Error("Intentional development-only label index failure.");
  const query = await searchParams;
  const status = firstQueryValue(query.status) === "unpaid" ? "unpaid" : "issued";
  const awbSuffix = (firstQueryValue(query.q) ?? "").trim();
  const printState = parsePrintState(firstQueryValue(query.cetak));
  const now = new Date();
  const range = parseAnalyticsRange(query, now);
  const carry = Object.fromEntries(serializeAnalyticsRange(range));
  const queryError = awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)
    ? "Masukkan 3–24 huruf atau angka terakhir dari nomor resi."
    : null;

  const emptyPage = { rows: [], summary: { "LBL-ALL": 0, "LBL-PRINTED": 0, "LBL-UNPRINTED": 0 } };
  let pagePromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => queryError
      ? Promise.resolve(emptyPage)
      : loadLabelIndexPage(tx, context, {
          status,
          awbSuffix: awbSuffix || undefined,
          printState,
          range,
        }),
  );
  if (auditScenario === "label-index-stream") {
    pagePromise = pagePromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const loadedPage = await pagePromise;
  const page = auditScenario === "label-index-empty" ? emptyPage : loadedPage;
  const rows = page.rows;
  const selectedCount = page.summary[
    PRINT_STATE_ENTRIES.find((entry) => entry.value === printState)!.metricId
  ];

  return (
    <PageContainer>
      <PageHeader description="Label tersedia setelah nomor resi resmi terbit dari Mengantar." eyebrow="Pengiriman" focusTargetId="label-index-heading" title="Label & riwayat cetak" />

      {/* One GET form (search) owned by this page; the status facet is a
          DataTableFacetFilter whose options keep the current suffix. */}
      <RangeFilterForm
        action="/app/label"
        idPrefix="label-index"
        now={now}
        preserved={{ cetak: printState === "semua" ? undefined : printState, q: awbSuffix || undefined, status: status === "unpaid" ? "unpaid" : undefined }}
        range={range}
      />

      <div className="grid gap-2">
        <DataTableToolbar isFiltered={Boolean(awbSuffix) || status !== "issued" || printState !== "semua"} resetHref={labelIndexHref("issued", "", "semua", carry)}>
          <form className="relative flex items-center" method="get" role="search">
            {status === "unpaid" ? <input name="status" type="hidden" value="unpaid" /> : null}
            {printState !== "semua" ? <input name="cetak" type="hidden" value={printState} /> : null}
            {Object.entries(carry).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
            <label className="sr-only" htmlFor="q-label">Akhiran nomor resi</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2 size-4 text-muted-foreground" />
            <Input
              aria-describedby={queryError ? "q-label-help q-label-error" : "q-label-help"}
              aria-invalid={Boolean(queryError)}
              className="h-8 w-[150px] pl-8 max-md:min-h-11 lg:w-[250px]"
              defaultValue={awbSuffix}
              id="q-label"
              inputMode="text"
              maxLength={24}
              minLength={3}
              name="q"
              pattern="[A-Za-z0-9]{3,24}"
              placeholder="Akhiran resi, mis. 123ABC"
              type="search"
            />
            {/* Enter submits; the button exists for implicit submission only, so it is kept out of the tab order rather than taking an invisible focus stop. */}
            <button className="sr-only" tabIndex={-1} type="submit">Terapkan filter</button>
          </form>
          <DataTableFacetFilter
            clearHref={status !== "issued" ? labelIndexHref("issued", awbSuffix, printState, carry) : undefined}
            options={[
              { href: labelIndexHref("issued", awbSuffix, printState, carry), label: "Resi sudah terbit", selected: status === "issued" },
              { href: labelIndexHref("unpaid", awbSuffix, printState, carry), label: "Menunggu pelunasan", selected: status === "unpaid" },
            ]}
            title="Status kiriman"
          />
        </DataTableToolbar>
        {/* The facet popover needs JavaScript. Without it the same two status
            views stay reachable as plain links that keep the current suffix. */}
        <noscript>
          <nav aria-label="Status kiriman" className="flex flex-wrap items-center gap-2">
            {([["issued", "Resi sudah terbit"], ["unpaid", "Menunggu pelunasan"]] as const).map(([value, label]) => (
              <Button asChild className="h-8 max-md:min-h-11" key={value} size="sm" variant={status === value ? "secondary" : "outline"}>
                <Link aria-current={status === value ? "true" : undefined} href={labelIndexHref(value, awbSuffix, printState, carry)} prefetch={false}>
                  {status === value ? <Check aria-hidden="true" /> : null}
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
        </noscript>
        <p className="text-xs text-muted-foreground" id="q-label-help">
          Gunakan 3–24 huruf atau angka terakhir, tanpa data penerima.
        </p>
      </div>

    {queryError ? (
      <AlertRegion className="rounded-lg" id="q-label-error"><Alert role="presentation" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Filter tidak dapat diproses</AlertTitle><AlertDescription><Button asChild className="h-auto min-h-11 justify-start whitespace-normal px-0 text-left" variant="link"><a href="#q-label">{queryError}</a></Button></AlertDescription></Alert></AlertRegion>
    ) : null}

    <section aria-labelledby="hasil-label-title" className="grid min-w-0 gap-3 overflow-hidden" id="hasil-label">
      <h2 className="sr-only" id="hasil-label-title">Hasil label</h2>
      {/* PR-52: the print state is this page's own `cetak` URL state; the counts
          keep the status facet and the AWB suffix already applied. */}
      <StateSummaryPanel
        action="/app/label"
        entries={PRINT_STATE_ENTRIES.map((entry) => ({
          count: page.summary[entry.metricId],
          description: entry.description,
          label: entry.label,
          metricId: entry.metricId,
          value: entry.value,
        }))}
        label="Ringkasan status cetak resi"
        param="cetak"
        preserved={{ ...carry, q: awbSuffix || undefined, status: status === "unpaid" ? "unpaid" : undefined }}
        selected={printState}
      />
      {/* The list is capped at 100 newest rows and has no pagination, so the
          panel's count can legitimately exceed what is listed. Say so rather
          than letting the two numbers disagree silently. */}
      {selectedCount > rows.length ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          Menampilkan {rows.length} dari {selectedCount} kiriman terbaru. Persempit dengan akhiran nomor resi untuk melihat sisanya.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          description={awbSuffix
            ? "Tidak ada nomor resi yang cocok dengan filter ini."
            : status === "unpaid"
              ? "Kiriman non-COD yang belum lunas akan muncul di sini."
              : "Label muncul setelah Mengantar menerbitkan nomor resi."}
          icon={Printer}
          title={status === "unpaid"
            ? "Tidak ada kiriman menunggu pelunasan."
            : "Belum ada label yang dapat dicetak."}
        />
      ) : (
          // The standard PageContainer is 64rem and the scroll container adds a
          // 1px border on each side, so a 64rem minimum overflowed its own
          // region by 2px at desktop widths. Keep the minimum below the
          // container and let the destination wrap instead of forcing width.
          <Table
            className="min-w-[56rem]"
            containerClassName="rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            containerProps={{ "aria-label": "Daftar label kiriman; geser horizontal untuk melihat seluruh kolom", role: "region", tabIndex: 0 }}
          >
            <TableCaption className="sr-only">
              {status === "issued"
                ? "Kiriman dengan resi terbit"
                : "Kiriman menunggu pelunasan Mengantar"}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-background">Ekspedisi / Resi</TableHead>
                <TableHead>Terbit</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead>Pembayaran</TableHead>
                <TableHead className="text-right">Permintaan cetak</TableHead>
                <TableHead>Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.shipmentId}>
                  <TableCell className="sticky left-0 z-10 max-w-56 whitespace-normal bg-inherit">
                    <CourierAwbStack awb={row.awb} courier={row.courier} service={row.providerService} />
                  </TableCell>
                  <TableCell>
                    <StackedDateTime value={row.issuedAt} />
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <RecipientStack areaLabel={row.destinationAreaLabel} name={row.recipientName} phone={row.recipientPhone} />
                  </TableCell>
                  <TableCell>
                    {row.isCod && row.providerCodAmountIdr !== null
                      ? `COD ${formatIdr(row.providerCodAmountIdr)}`
                      : "Non-COD"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.printCount}×</TableCell>
                  <TableCell>
                    <Button asChild className="min-h-11" variant="ghost">
                      <Link href={shipmentLabelHref(row.publicReference)}>
                      {row.status === "ISSUED" ? "Buka label" : "Lihat status"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      )}
    </section>
    </PageContainer>
  );
}
