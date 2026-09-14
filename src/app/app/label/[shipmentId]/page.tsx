import { randomUUID } from "node:crypto";

import { CircleAlert, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { LabelPrintPanel } from "@/app/app/label/[shipmentId]/label-print-panel";
import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  LabelUnavailableError,
  listPrintEvents,
  loadPrintableLabel,
} from "@/db/label-print-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { formatWibDateTime, recipientDensity } from "@/lib/label-format";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type LabelDetailPageProps = {
  params: Promise<{ shipmentId: string }>;
};

async function requireTenantPrincipal() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  return principal;
}

export default async function LabelDetailPage({ params }: LabelDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/label/[shipmentId]")
    : null;
  if (auditScenario === "label-detail-error") throw new Error("Intentional development-only label detail failure.");
  const { shipmentId } = await params;
  if (!UUID_PATTERN.test(shipmentId)) notFound();

  let detailPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    async (tx, context) => {
      try {
        const label = await loadPrintableLabel(tx, context, shipmentId);
        const events = await listPrintEvents(tx, context, shipmentId);
        return { kind: "ready" as const, events, label };
      } catch (error) {
        if (!(error instanceof LabelUnavailableError)) throw error;
        if (error.reason === "NOT_FOUND") return { kind: "not-found" as const };
        return { kind: "blocked" as const, reason: error.reason };
      }
    },
  );
  if (auditScenario === "label-detail-stream") {
    detailPromise = detailPromise.then((value) => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1_200)));
  }
  let detail = await detailPromise;
  if (detail.kind === "ready" && auditScenario === "label-detail-over-capacity") {
    detail = { ...detail, label: { ...detail.label, recipient: { ...detail.label.recipient, address: "A".repeat(500) } } };
  }
  if (detail.kind === "ready" && auditScenario === "label-detail-inconsistent-cod") {
    detail = { ...detail, label: { ...detail.label, codBreakdown: null, isCod: true, providerCodAmountIdr: detail.label.providerCodAmountIdr ?? 1 } };
  }
  if (detail.kind === "ready" && auditScenario === "label-detail-zero-history") {
    detail = { ...detail, events: [], label: { ...detail.label, lastPrintedAt: null, printCount: 0 } };
  }

  if (detail.kind === "not-found") notFound();
  const heading = detail.kind === "ready" ? `Label ${detail.label.awb}` : "Label kiriman";

  if (detail.kind === "blocked") {
    const awaiting = detail.reason === "AWAITING_UPSTREAM_PAYMENT";
    return (
      <PageContainer className="label-page print:block print:max-w-none print:gap-0">
        <div className="label-hide">
          <PageHeader
            actions={<Button asChild className="min-h-11 max-md:w-full md:min-h-8" variant="outline"><Link href="/app/label">Kembali ke daftar label</Link></Button>}
            description="Pratinjau cetak tersedia setelah nomor resi diterbitkan."
            eyebrow="Label 100 × 150 mm"
            focusTargetId="label-detail-heading"
            title={heading}
          />
        </div>
        <Alert className="label-hide" id="status-label" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{awaiting ? "Menunggu pelunasan Mengantar" : "Label belum tersedia"}</AlertTitle>
          <AlertDescription>
            <p>{awaiting
              ? "Kiriman non-COD ini belum berstatus lunas di Mengantar, sehingga belum memiliki nomor resi. Tenant Admin perlu memulihkannya lebih dulu."
              : "Label hanya dapat dicetak setelah Mengantar mengembalikan nomor resi."}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="min-h-11 max-md:w-full md:min-h-8"><Link href={`/app/pengiriman/${shipmentId}`}>Buka detail kiriman</Link></Button>
              <Button asChild className="min-h-11" variant="outline"><Link href="/app/label">Kembali ke daftar label</Link></Button>
            </div>
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const recipientLayout = recipientDensity({
    nameLength: detail.label.recipient.name.length,
    addressLength: detail.label.recipient.address.length,
    areaLabelLength: detail.label.destinationAreaLabel.length,
  });
  const inconsistentCod = detail.label.isCod && !detail.label.codBreakdown;

  return (
    <PageContainer className="label-page print:block print:max-w-none print:gap-0">
      <div className="label-hide">
        <PageHeader
          actions={<Button asChild className="min-h-11 max-md:w-full md:min-h-8" variant="outline"><Link href="/app/label">Kembali ke daftar label</Link></Button>}
          description="Periksa data kiriman, lalu gunakan dialog cetak browser dengan ukuran kertas 100 × 150 mm."
          eyebrow="Label 100 × 150 mm"
          focusTargetId="label-detail-heading"
          title={heading}
        />
      </div>

      <LabelPrintPanel
        initialAttemptId={randomUUID()}
        lastPrintedAt={detail.label.lastPrintedAt?.toISOString() ?? null}
        printCount={detail.label.printCount}
        shipmentId={detail.label.shipmentId}
      />

      {recipientLayout.overCapacity ? (
        <Alert className="label-caution label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Alamat melebihi kapasitas label</AlertTitle>
          <AlertDescription>
            <p>Alamat penerima {detail.label.recipient.address.length} karakter melebihi kapasitas label; sebagian tidak tercetak. Verifikasi alamat sebelum menyerahkan paket.</p>
            <details className="mt-3 rounded-lg border px-3">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">Lihat alamat penerima lengkap</summary>
              <p className="min-w-0 wrap-anywhere whitespace-pre-wrap pb-3">{detail.label.recipient.address}</p>
            </details>
          </AlertDescription>
        </Alert>
      ) : null}

      {inconsistentCod ? (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Rincian COD tidak konsisten</AlertTitle>
          <AlertDescription>Total COD dari Mengantar tetap dicetak, tetapi rincian komponennya disembunyikan. Verifikasi kiriman sebelum menyerahkan paket.</AlertDescription>
        </Alert>
      ) : null}

      <div
        aria-label="Pratinjau label 100 × 150 mm"
        className="label-preview"
        id="pratinjau-label"
        role="region"
        tabIndex={0}
      >
        <LabelSheet label={detail.label} />
      </div>

      <Card aria-labelledby="riwayat-cetak-heading" className="label-hide" role="region">
        <CardHeader>
          <CardTitle id="riwayat-cetak-heading">Riwayat permintaan cetak</CardTitle>
          <CardDescription>Setiap permintaan cetak tercatat dengan waktu dan aktor.</CardDescription>
        </CardHeader>
        <CardContent>
        {detail.events.length === 0 ? (
          <EmptyState
            description="Permintaan cetak pertama akan tercatat setelah tombol cetak digunakan."
            icon={Printer}
            title="Belum ada riwayat cetak"
          />
        ) : (
            <Table
              className="min-w-[38rem]"
              containerClassName="rounded-md border focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
              containerProps={{ "aria-label": "Riwayat permintaan cetak label; geser horizontal untuk melihat seluruh kolom", role: "region", tabIndex: 0 }}
            >
              <TableCaption className="sr-only">Riwayat permintaan cetak label</TableCaption>
              <TableHeader><TableRow><TableHead className="sticky left-0 z-20 bg-card">Permintaan ke-</TableHead><TableHead>Waktu (WIB)</TableHead><TableHead>Aktor</TableHead><TableHead>Hasil</TableHead></TableRow></TableHeader>
              <TableBody>
                {detail.events.map((event, index) => (
                  <TableRow key={`${event.printedAt.toISOString()}-${index}`}>
                    <TableCell className="sticky left-0 z-10 bg-card tabular-nums">{event.sequence ?? "—"}</TableCell>
                    <TableCell>{formatWibDateTime(event.printedAt)}</TableCell>
                    <TableCell className="whitespace-normal">{event.actorRole === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"} · {event.actorNameMasked}</TableCell>
                    <TableCell className="whitespace-normal">{event.outcome === "PRINTED" ? "Tercatat" : event.reasonCode === "AWAITING_UPSTREAM_PAYMENT" ? "Diblokir: menunggu pelunasan" : "Diblokir: resi belum terbit"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
