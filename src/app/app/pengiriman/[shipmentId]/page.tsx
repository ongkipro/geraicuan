import type { Metadata } from "next";
import { ArrowLeft, CircleAlert, Clock3 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ShipmentIssuancePanel,
  type ShipmentEstimateOption,
} from "@/app/app/pengiriman/[shipmentId]/issuance-panel";
import { ShipmentUnpaidRecoveryPanel } from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-panel";
import { ShipmentReconciliationPanel } from "@/app/app/pengiriman/[shipmentId]/reconciliation-panel";
import { ShipmentLifecycleTimeline } from "@/app/app/pengiriman/[shipmentId]/shipment-lifecycle-timeline";
import { ShipmentStaleOperationPanel } from "@/app/app/pengiriman/[shipmentId]/stale-operation-panel";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db/client";
import { calculateCodAmounts } from "@/db/cod-totals-repository";
import { loadShipmentDetail } from "@/db/shipment-queue-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { isDataStale } from "@/lib/data-freshness";
import {
  formatDimensions,
  formatIdr,
  formatWibDateTime,
  formatWeight,
} from "@/lib/label-format";
import {
  SHIPMENT_STATUS_PRESENTATION,
  shipmentLifecycleActions,
} from "@/lib/shipment-queue";
import { isSanctionedOrderFixtureEnabled } from "@/lib/sanctioned-order-fixture";
import { isSanctionedUnpaidRecoveryFixtureEnabled } from "@/lib/sanctioned-unpaid-recovery-fixture";
import { isSanctionedReconciliationFixtureEnabled } from "@/lib/sanctioned-reconciliation-fixture";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = { robots: { index: false } };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ShipmentDetailPageProps = {
  params: Promise<{ shipmentId: string }>;
};

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


function delayResult<T>(promise: Promise<T>, delayMs: number) {
  return promise.then((value) => new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), delayMs);
  }));
}

function noActionMessage(
  status: Parameters<typeof shipmentLifecycleActions>[0],
  role: Parameters<typeof shipmentLifecycleActions>[1],
) {
  if (status === "SUBMISSION_QUEUED") {
    return "Tidak ada tindakan manual selama kiriman masih diproses.";
  }
  if (status === "SUBMISSION_UNKNOWN") {
    return "Pengiriman ulang tidak diizinkan sampai rekonsiliasi penyedia selesai.";
  }
  if (status === "AWAITING_UPSTREAM_PAYMENT" && role === "OPERATOR") {
    return "Pemulihan pembayaran hanya dapat dilakukan oleh Tenant Admin.";
  }
  return "Tidak ada tindakan lanjutan untuk status ini.";
}

export default async function ShipmentDetailPage({
  params,
}: ShipmentDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const { shipmentId } = await params;
  if (!UUID_PATTERN.test(shipmentId)) notFound();

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute(
        (await headers()).get(UI_AUDIT_HEADER),
        "/app/pengiriman/[shipmentId]",
      )
    : null;
  if (auditScenario === "shipment-detail-error") {
    throw new Error("Intentional development-only shipment detail failure.");
  }

  let detailPromise = withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => loadShipmentDetail(tx, context, shipmentId),
  );
  if (auditScenario === "shipment-detail-stream") detailPromise = delayResult(detailPromise, 1_200);
  const loadedDetail = await detailPromise;
  if (!loadedDetail) notFound();
  let detail = auditScenario === "shipment-detail-stale"
    ? { ...loadedDetail, generatedAt: new Date(loadedDetail.generatedAt.getTime() - 7 * 60_000) }
    : loadedDetail;
  const auditProvider = detail.provider ?? {
    awb: null,
    batchId: "00000000-0000-0000-0000-000000000039",
    batchSafeErrorCode: null,
    batchStatus: "COMPLETED" as const,
    courier: "JNE",
    insuranceAmountIdr: null,
    isPaid: null,
    orderId: "SANITIZED-AUDIT-ORDER",
    orderStatus: "SUBMISSION_QUEUED" as const,
    providerCodAmountIdr: null,
    providerService: "JNE REG",
    recoveryStatus: null,
    resolvedAt: null,
    safeResponseCode: null,
    shippingAmountIdr: 14_000,
  };
  if (auditScenario === "shipment-detail-submitting") {
    detail = {
      ...detail,
      provider: { ...auditProvider, batchStatus: "SUBMITTING", recoveryStatus: null },
      status: "SUBMISSION_QUEUED",
    };
  } else if (auditScenario === "shipment-detail-payment-paying") {
    detail = {
      ...detail,
      isCod: false,
      provider: {
        ...auditProvider,
        batchStatus: "COMPLETED",
        isPaid: false,
        orderStatus: "AWAITING_UPSTREAM_PAYMENT",
        recoveryStatus: "PAYING",
      },
      status: "AWAITING_UPSTREAM_PAYMENT",
    };
  }

  const status = SHIPMENT_STATUS_PRESENTATION[detail.status];
  const recoveryNeedsReconciliation = detail.provider?.recoveryStatus === "PAYING"
    || detail.provider?.recoveryStatus === "PAYMENT_UNKNOWN";
  const operationCanBeChecked = detail.provider?.batchStatus === "SUBMITTING"
    || (detail.provider?.recoveryStatus === "PAYING"
      && principal.role === "TENANT_ADMIN");
  const actions = shipmentLifecycleActions(
    detail.status,
    principal.role,
    detail.shipmentId,
  ).filter((action) => !(recoveryNeedsReconciliation && action.id === "recover-unpaid"));
  const dimensions = formatDimensions(
    detail.package.lengthCm,
    detail.package.widthCm,
    detail.package.heightCm,
  );
  const estimateOptions: ShipmentEstimateOption[] =
    detail.estimate?.services.map((service) => ({
      codBreakdown:
        detail.isCod && service.codEligible
          ? calculateCodAmounts(
              detail.package.declaredValueIdr,
              service.shippingAmountIdr,
            )
          : null,
      codEligible: service.codEligible,
      deliveryEstimate: service.deliveryEstimate,
      estimateServiceId: service.estimateServiceId,
      insuranceAmountIdr: service.insuranceAmountIdr,
      providerService: service.providerService,
      shippingAmountIdr: service.shippingAmountIdr,
    })) ?? [];

  const emptyNote = "rounded-lg border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground";

  return (
    <PageContainer>
      <PageHeader
        actions={
          <Button asChild className="min-h-11 max-md:w-full md:min-h-8" size="sm" variant="outline">
            <Link href="/app/pengiriman"><ArrowLeft aria-hidden="true" /> Kembali ke antrean</Link>
          </Button>
        }
        description="Snapshot operasional kiriman di dalam tenant aktif."
        eyebrow="Detail pengiriman"
        focusTargetId="shipment-detail-heading"
        title={<>Kiriman <span className="font-mono">{detail.publicReference}</span></>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle id="status-lifecycle-heading">Status lifecycle</CardTitle>
            <CardDescription className="leading-6">{status.guidance}</CardDescription>
            <CardAction><ShipmentStatusBadge label={status.label} tone={status.tone} /></CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3.5" /> Dibuat {formatWibDateTime(detail.createdAt)} · aktivitas terakhir {formatWibDateTime(detail.updatedAt)}
            </p>
            <Separator />
            <section aria-labelledby="tindakan-heading" className="grid gap-3">
              <h3 className="text-sm font-medium" id="tindakan-heading">Tindakan berikutnya</h3>
              {actions.length > 0 ? (
                <ul className="grid gap-3">
                  {actions.map((action, index) => (
                    <li className="flex flex-col items-start gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" key={action.id}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{action.label}</p>
                        <p className="max-w-2xl text-sm text-muted-foreground">{action.description}</p>
                      </div>
                      {action.kind === "link" && action.href ? (
                        <Button asChild className="min-h-11 shrink-0 max-md:w-full md:min-h-8" size="sm" variant={index === 0 ? "default" : "outline"}><Link href={action.href}>{action.label}</Link></Button>
                      ) : (
                        <Badge variant="outline">Belum tersedia</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={emptyNote} role="status">{noActionMessage(detail.status, principal.role)}</p>
              )}
            </section>
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <ShipmentLifecycleTimeline status={detail.status} />
        </div>
      </div>

      <DataFreshnessControl
        formattedGeneratedAt={formatWibDateTime(detail.generatedAt)}
        generatedAtIso={detail.generatedAt.toISOString()}
        initiallyStale={isDataStale(detail.generatedAt, new Date())}
      />

      {operationCanBeChecked ? (
        <Alert>
          <Clock3 aria-hidden="true" />
          <AlertTitle>Upaya penyedia masih tercatat berjalan</AlertTitle>
          <AlertDescription>Gunakan pemeriksaan state aman di bawah jika proses tidak berubah setelah beberapa menit. Pemeriksaan ini tidak mengulang pengiriman atau pembayaran.</AlertDescription>
        </Alert>
      ) : null}

      {operationCanBeChecked ? (
        <ShipmentStaleOperationPanel shipmentId={detail.shipmentId} />
      ) : null}

      {detail.status === "SUBMISSION_UNKNOWN" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Jangan kirim ulang</AlertTitle>
          <AlertDescription>{principal.role === "TENANT_ADMIN" ? "Hasil penyedia belum pasti. Gunakan rekonsiliasi satu kali di bawah untuk memeriksa identifier yang sudah tersimpan tanpa mengirim ulang pesanan." : "Hasil penyedia belum pasti. Jangan mengirim ulang; minta Tenant Admin menjalankan rekonsiliasi berdasarkan identifier yang sudah tersimpan."}</AlertDescription>
        </Alert>
      ) : null}

      {detail.status === "SUBMISSION_UNKNOWN" && principal.role === "TENANT_ADMIN" ? (
        <ShipmentReconciliationPanel fixtureEnabled={isSanctionedReconciliationFixtureEnabled()} shipmentId={detail.shipmentId} />
      ) : null}

      {detail.status === "AWAITING_UPSTREAM_PAYMENT" && recoveryNeedsReconciliation ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Pembayaran perlu direkonsiliasi</AlertTitle>
          <AlertDescription>Upaya pembayaran sebelumnya belum memiliki hasil pasti. Jangan jalankan pemulihan ulang; pastikan status penyedia secara manual sebelum tindakan lanjutan.</AlertDescription>
        </Alert>
      ) : detail.status === "AWAITING_UPSTREAM_PAYMENT" ? (
        <Alert>
          <Clock3 aria-hidden="true" />
          <AlertTitle>AWB belum tersedia</AlertTitle>
          <AlertDescription>
            {principal.role === "TENANT_ADMIN"
              ? "Kiriman non-COD ini menunggu pelunasan Mengantar. Danai saldo terlebih dahulu, lalu gunakan konfirmasi pemulihan satu kali di bawah."
              : "Kiriman non-COD ini menunggu pelunasan Mengantar. Jangan membuat kiriman pengganti; minta Tenant Admin menjalankan pemulihan."}
          </AlertDescription>
        </Alert>
      ) : null}

      {detail.status === "AWAITING_UPSTREAM_PAYMENT"
      && principal.role === "TENANT_ADMIN"
      && !recoveryNeedsReconciliation ? (
        <ShipmentUnpaidRecoveryPanel
          fixtureEnabled={isSanctionedUnpaidRecoveryFixtureEnabled()}
          shipmentId={detail.shipmentId}
        />
      ) : null}

      <Card aria-labelledby="konteks-heading" role="region">
        <CardHeader>
          <CardTitle id="konteks-heading">Konteks operasional</CardTitle>
          <CardDescription>Outlet, tujuan, dan paket yang tersimpan pada kiriman ini.</CardDescription>
        </CardHeader>
        <CardContent>
          <DefinitionGrid items={[
            { label: "Outlet", value: detail.outlet.name },
            { label: "Tujuan", value: detail.destinationAreaLabel },
            { label: "Isi paket", value: detail.package.content },
            { label: "Berat / jumlah", value: `${formatWeight(detail.package.weightGrams)} · ${detail.package.quantity} koli` },
            { label: "Dimensi", value: dimensions ?? "Tidak dicatat" },
            { label: "Nilai barang", value: formatIdr(detail.package.declaredValueIdr) },
            { label: "Pembayaran", value: detail.isCod ? "COD" : "Non-COD" },
          ]} />
        </CardContent>
      </Card>

      <Card aria-labelledby="snapshot-pihak-heading" role="region">
        <CardHeader>
          <CardTitle id="snapshot-pihak-heading">Snapshot pihak kiriman</CardTitle>
          <CardDescription>Snapshot ini tidak berubah ketika direktori kontak diperbarui.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.sender && detail.recipient ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Pengirim", party: detail.sender },
                { label: "Penerima", party: detail.recipient },
              ].map(({ label, party }) => (
                <article className="grid min-w-0 content-start gap-1.5 rounded-lg border p-4 text-sm" key={label}>
                  <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
                  <p className="font-medium wrap-anywhere">{party.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{party.phone}</p>
                  <p className="leading-6 text-muted-foreground wrap-anywhere">{party.address}</p>
                </article>
              ))}
            </div>
          ) : (
            <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Snapshot pihak kiriman tidak lengkap</AlertTitle></Alert>
          )}
        </CardContent>
      </Card>

      {detail.status === "ESTIMATED" && detail.estimate ? (
        <ShipmentIssuancePanel
          fixtureEnabled={isSanctionedOrderFixtureEnabled()}
          isCod={detail.isCod}
          options={estimateOptions}
          shipmentId={detail.shipmentId}
          snapshotId={detail.estimate.snapshotId}
        />
      ) : (
        <Card aria-labelledby="estimasi-heading" role="region">
          <CardHeader>
            <CardTitle id="estimasi-heading">Estimasi tersimpan</CardTitle>
            {detail.estimate ? (
              <CardDescription className="max-w-2xl leading-6">
                Diambil {formatWibDateTime(detail.estimate.retrievedAt)} · {" "}
                {detail.estimate.isCodRequested ? "COD diminta" : "Non-COD"}.
                Daftar ini hanya-baca; belum ada konfirmasi layanan dari halaman
                detail.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {detail.estimate ? (
              detail.estimate.services.length > 0 ? (
                <Table
                  containerClassName="rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  containerProps={{ "aria-label": "Daftar estimasi tersimpan", role: "region", tabIndex: 0 }}
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Layanan</TableHead>
                      <TableHead scope="col">Ongkir penyedia</TableHead>
                      <TableHead scope="col">Asuransi</TableHead>
                      <TableHead scope="col">Estimasi tiba</TableHead>
                      <TableHead scope="col">COD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.estimate.services.map((service) => (
                      <TableRow key={service.providerService}>
                        <TableCell className="font-medium">{service.providerService}</TableCell>
                        <TableCell className="font-mono tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
                        <TableCell className="font-mono tabular-nums">
                          {service.insuranceAmountIdr === null
                            ? "Tidak dikembalikan"
                            : formatIdr(service.insuranceAmountIdr)}
                        </TableCell>
                        <TableCell>{service.deliveryEstimate}</TableCell>
                        <TableCell><Badge variant={service.codEligible ? "secondary" : "outline"}>{service.codEligible ? "Didukung" : "Tidak"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className={emptyNote} role="status">Tidak ada layanan yang didukung pada estimasi terakhir.</p>
              )
            ) : (
              <p className={emptyNote} role="status">Belum ada estimasi yang tersimpan untuk kiriman ini.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card aria-labelledby="hasil-penyedia-heading" role="region">
        <CardHeader>
          <CardTitle id="hasil-penyedia-heading">Hasil penyedia</CardTitle>
          <CardDescription>Nilai tersimpan dari respons Mengantar.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.provider ? (
            <DefinitionGrid items={[
              { label: "Status pesanan", value: detail.provider.orderStatus },
              { label: "Referensi pesanan", value: detail.provider.orderId ?? "Belum tersedia" },
              { label: "Status batch", value: detail.provider.batchStatus ?? "Belum tersedia" },
              { label: "Kurir / layanan", value: `${detail.provider.courier ?? "—"} · ${detail.provider.providerService}` },
              { label: "AWB Mengantar", value: detail.provider.awb ?? "Belum tersedia" },
              {
                label: "Ongkir / asuransi",
                value: `${formatIdr(detail.provider.shippingAmountIdr)} · ${detail.provider.insuranceAmountIdr === null ? "asuransi tidak dikembalikan" : formatIdr(detail.provider.insuranceAmountIdr)}`,
              },
              ...(detail.provider.providerCodAmountIdr === null ? [] : [{ label: "Total COD penyedia", value: formatIdr(detail.provider.providerCodAmountIdr) }]),
              {
                label: "Status pembayaran",
                value: detail.provider.isPaid === null ? "Belum diketahui" : detail.provider.isPaid ? "Lunas menurut penyedia" : "Belum lunas menurut penyedia",
              },
              { label: "Respons aman", value: detail.provider.safeResponseCode ?? detail.provider.batchSafeErrorCode ?? "Tidak ada kode aman" },
            ]} />
          ) : (
            <p className={emptyNote} role="status">Belum ada hasil pesanan penyedia untuk kiriman ini.</p>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="riwayat-label-heading" role="region">
        <CardHeader>
          <CardTitle id="riwayat-label-heading">Label dan riwayat cetak</CardTitle>
          <CardDescription>
            {detail.printCount === 0
              ? "Belum ada cetak label tercatat."
              : `Label sudah dicetak ${detail.printCount}×.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.status === "ISSUED" ? (
            <Button asChild className="min-h-11 max-md:w-full md:min-h-8" size="sm" variant="outline">
              <Link href={`/app/label/${encodeURIComponent(detail.shipmentId)}`}>Buka label dan riwayat cetak</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Riwayat cetak tersedia setelah Mengantar menerbitkan AWB.
            </p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
