import type { Metadata } from "next";
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
import { listPrintableShipments } from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatIdr, formatWibDateTime } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

type SearchValue = string | string[] | undefined;
type LabelIndexPageProps = {
  searchParams: Promise<{ q?: SearchValue; status?: SearchValue }>;
};

const AWB_SUFFIX_PATTERN = /^[a-z0-9]{3,24}$/i;

function labelIndexHref(status: "issued" | "unpaid", awbSuffix: string) {
  const params = new URLSearchParams();
  if (status === "unpaid") params.set("status", "unpaid");
  if (awbSuffix) params.set("q", awbSuffix);
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
  const queryError = awbSuffix && !AWB_SUFFIX_PATTERN.test(awbSuffix)
    ? "Masukkan 3–24 huruf atau angka terakhir dari nomor resi."
    : null;

  let rowsPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => queryError
      ? Promise.resolve([])
      : listPrintableShipments(tx, context, {
          status,
          awbSuffix: awbSuffix || undefined,
        }),
  );
  if (auditScenario === "label-index-stream") {
    rowsPromise = rowsPromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  const loadedRows = await rowsPromise;
  const rows = auditScenario === "label-index-empty" ? [] : loadedRows;

  return (
    <PageContainer>
      <PageHeader description="Label tersedia setelah nomor resi resmi terbit dari Mengantar." eyebrow="Pengiriman" focusTargetId="label-index-heading" title="Label & riwayat cetak" />

      {/* One GET form (search) owned by this page; the status facet is a
          DataTableFacetFilter whose options keep the current suffix. */}
      <div className="grid gap-2">
        <DataTableToolbar isFiltered={Boolean(awbSuffix) || status !== "issued"} resetHref="/app/label">
          <form className="relative flex items-center" method="get" role="search">
            {status === "unpaid" ? <input name="status" type="hidden" value="unpaid" /> : null}
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
            clearHref={status !== "issued" ? labelIndexHref("issued", awbSuffix) : undefined}
            options={[
              { href: labelIndexHref("issued", awbSuffix), label: "Resi sudah terbit", selected: status === "issued" },
              { href: labelIndexHref("unpaid", awbSuffix), label: "Menunggu pelunasan", selected: status === "unpaid" },
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
                <Link aria-current={status === value ? "true" : undefined} href={labelIndexHref(value, awbSuffix)} prefetch={false}>
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
                <TableHead className="sticky left-0 z-20 bg-background">Nomor resi</TableHead>
                <TableHead>Kurir</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead>Tujuan</TableHead>
                <TableHead>Pembayaran</TableHead>
                <TableHead className="text-right">Permintaan cetak</TableHead>
                <TableHead>Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.shipmentId}>
                  <TableCell className="sticky left-0 z-10 max-w-64 whitespace-normal bg-background">
                    <strong>{row.awb ?? "Belum terbit"}</strong>
                    {row.issuedAt ? (
                      <span className="text-xs text-muted-foreground">
                        <br />
                        {formatWibDateTime(row.issuedAt)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.courier}
                    <span className="text-xs text-muted-foreground">
                      <br />
                      {row.providerService}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal wrap-anywhere">
                    {row.recipientName}
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {row.recipientPhone}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-48 max-w-72 whitespace-normal">{row.destinationAreaLabel}</TableCell>
                  <TableCell>
                    {row.isCod && row.providerCodAmountIdr !== null
                      ? `COD ${formatIdr(row.providerCodAmountIdr)}`
                      : "Non-COD"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.printCount}×</TableCell>
                  <TableCell>
                    <Button asChild className="min-h-11" variant="ghost">
                      <Link href={`/app/label/${row.shipmentId}`}>
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
