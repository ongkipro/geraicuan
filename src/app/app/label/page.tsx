import type { Metadata } from "next";
import { CircleAlert, Printer } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertRegion } from "@/app/_components/alert-region";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
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
      <PageHeader description="Cetak hanya kiriman yang sudah memperoleh AWB resmi dari Mengantar." eyebrow="Pengiriman" focusTargetId="label-index-heading" title="Label & riwayat cetak" />

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Filter label</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get">
            <FieldSet>
              <FieldGroup className="grid min-w-0 items-end lg:grid-cols-[minmax(13rem,0.8fr)_minmax(15rem,1fr)_auto]">
                <Field>
                  <FieldLabel htmlFor="status-label">Status kiriman</FieldLabel>
                  <select
                    className="flex min-h-11 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    defaultValue={status}
                    id="status-label"
                    name="status"
                  >
                    <option value="issued">Resi sudah terbit</option>
                    <option value="unpaid">Menunggu pelunasan</option>
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="q-label">Akhiran nomor resi</FieldLabel>
                  <Input
                    aria-describedby={queryError ? "q-label-help q-label-error" : "q-label-help"}
                    aria-invalid={Boolean(queryError)}
                    className="min-h-11"
                    defaultValue={awbSuffix}
                    id="q-label"
                    inputMode="text"
                    maxLength={24}
                    minLength={3}
                    name="q"
                    pattern="[A-Za-z0-9]{3,24}"
                    placeholder="Contoh: 123ABC"
                    type="search"
                  />
                  <FieldDescription id="q-label-help">
                    Gunakan 3–24 huruf atau angka terakhir, tanpa data penerima.
                  </FieldDescription>
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-11" type="submit">Terapkan filter</Button>
                  {awbSuffix || status !== "issued" ? (
                    <Button asChild className="min-h-11" variant="outline">
                      <Link href="/app/label">Hapus filter</Link>
                    </Button>
                  ) : null}
                </div>
              </FieldGroup>
            </FieldSet>
          </form>
        </CardContent>
      </Card>

    {queryError ? (
      <AlertRegion className="rounded-lg" id="q-label-error"><Alert role="presentation" variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Filter tidak dapat diproses</AlertTitle><AlertDescription><a href="#q-label">{queryError}</a></AlertDescription></Alert></AlertRegion>
    ) : null}

    <section aria-labelledby="hasil-label-title" className="grid min-w-0 gap-3 overflow-hidden" id="hasil-label">
      <h2 className="font-heading text-lg font-medium" id="hasil-label-title">Hasil label</h2>
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
          <Table
            className="min-w-[64rem]"
            containerClassName="rounded-lg border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
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
                  <TableCell>
                    {row.recipientName}
                    <span className="text-xs text-muted-foreground">
                      <br />
                      {row.recipientPhoneMasked}
                    </span>
                  </TableCell>
                  <TableCell>{row.destinationAreaLabel}</TableCell>
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
