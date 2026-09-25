import type { Metadata } from "next";
import { CircleAlert, Clock3, Printer } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ShipmentIssuancePanel,
  type ShipmentEstimateOption,
} from "@/app/app/pengiriman/[shipmentId]/issuance-panel";
import { BackLink } from "@/components/cms/back-link";
import { HelpHint } from "@/components/cms/help-hint";
import { ShipmentUnpaidRecoveryPanel } from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-panel";
import { ShipmentReconciliationPanel } from "@/app/app/pengiriman/[shipmentId]/reconciliation-panel";
import { ShipmentLifecycleTimeline } from "@/app/app/pengiriman/[shipmentId]/shipment-lifecycle-timeline";
import { ShipmentStaleOperationPanel } from "@/app/app/pengiriman/[shipmentId]/stale-operation-panel";
import { CopyPhoneButton } from "@/app/app/kontak/contact-ui";
import { resolveShipmentRoute } from "@/app/app/shipment-route";
import { CourierLogo } from "@/components/cms/courier-logo";
import { DataFreshnessControl } from "@/components/cms/data-freshness-control";
import { DetailLayout, PageAside } from "@/components/cms/cms-layouts";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { ShipmentStatusBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db/client";
import { shipmentCodFormulaRetired } from "@/db/cod-totals-repository";
import { buildShipmentEstimateOptions } from "@/lib/shipment-estimate-options";
import { loadShipmentDetail } from "@/db/shipment-queue-repository";
import { shipmentLabelHref } from "@/lib/shipment-number";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { isDataStale } from "@/lib/data-freshness";
import { deliveryEstimateLabel, serviceDisplayName } from "@/lib/labels/courier";
import {
  PROVIDER_BATCH_STATUS_LABELS,
  PROVIDER_ORDER_STATUS_LABELS,
  providerResponseLabel,
} from "@/lib/labels/provider";
import { PAYMENT_AMOUNT_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/payment-method";
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

export const metadata: Metadata = { title: "Detail kiriman · GeraiCUAN", robots: { index: false } };

type ShipmentDetailPageProps = {
  params: Promise<{ shipmentId: string }>;
  /** The queue's own URL state, replayed by "Kembali ke histori kiriman" (PR-53). */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  searchParams,
}: ShipmentDetailPageProps) {
  const principal = await requireTenantPrincipal();
  const { shipmentId: routeKey } = await params;
  // Only the range keys travel back, and only as the single values the queue
  // wrote — never an arbitrary query string echoed into a link.
  const requested = new URLSearchParams(
    Object.entries((await searchParams) ?? {})
      .filter(([name, value]) => ["rentang", "dari", "sampai", "tz"].includes(name) && typeof value === "string" && value !== "")
      .map(([name, value]) => [name, value as string]),
  ).toString();
  const queueHref = `/app/pengiriman${requested ? `?${requested}` : ""}`;
  const shipmentId = await resolveShipmentRoute(principal, routeKey, "/app/pengiriman");

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
    async (tx, context) => {
      const loaded = await loadShipmentDetail(tx, context, shipmentId);
      // T-199: a version 1 COD totals row that was never submitted is refused on
      // confirmation, so the detail says so before the operator tries.
      return loaded
        ? {
            ...loaded,
            codFormulaRetired: loaded.status === "ESTIMATED"
              && loaded.isCod
              && await shipmentCodFormulaRetired(tx, context, shipmentId),
          }
        : null;
    },
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
  } else if (auditScenario === "shipment-detail-cod-formula-retired") {
    // T-199: an estimated COD shipment holding a never-submitted version 1 row.
    detail = {
      ...detail,
      codFormulaRetired: true,
      estimate: detail.estimate ?? {
        isCodRequested: true,
        retrievedAt: detail.generatedAt,
        services: [{
          codEligible: true,
          codFeeIdr: null,
          currency: "IDR",
          deliveryEstimate: "1-2 hari",
          discountIdr: null,
          estimateServiceId: "00000000-0000-4199-8000-000000000001",
          insuranceAmountIdr: null,
          insuranceSourceField: null,
          normalPriceIdr: 14_000,
          providerService: "JNE REG",
          shippingAmountIdr: 14_000,
          shippingSourceField: "price",
          specialPriceIdr: null,
        }],
        snapshotId: "00000000-0000-4199-8000-000000000002",
      },
      isCod: true,
      paymentMethod: "COD",
      provider: null,
      status: "ESTIMATED",
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
  // One filled primary per page (spec 10): when the issuance panel is on the page its
  // confirm button is the primary, so the next-action links stay outline.
  const issuancePanelShown = detail.status === "ESTIMATED" && Boolean(detail.estimate);
  const actions = shipmentLifecycleActions(
    detail.status,
    principal.role,
    detail.shipmentId,
  ).filter((action) => !(recoveryNeedsReconciliation && action.id === "recover-unpaid"))
    // PR-44: the label link uses the canonical number rather than the UUID the builder receives.
    .map((action) => action.id === "open-label" ? { ...action, href: shipmentLabelHref(detail.publicReference) } : action);
  const dimensions = formatDimensions(
    detail.package.lengthCm,
    detail.package.widthCm,
    detail.package.heightCm,
  );
  const estimateOptions: ShipmentEstimateOption[] = detail.estimate
    ? buildShipmentEstimateOptions({
        codFormulaRetired: detail.codFormulaRetired,
        declaredValueIdr: detail.package.declaredValueIdr,
        paymentMethod: detail.paymentMethod,
        services: detail.estimate.services,
      })
    : [];

  // Spec 10 §1.6: nothing inside a card is framed, so an empty region is plain text.
  const emptyNote = "text-sm text-muted-foreground";

  return (
    <PageContainer>
      {/* T-206 (owner reference detail-kiriman.html): back link above the eyebrow, status beside the title. */}
      <div className="grid gap-1">
        <BackLink href={queueHref}>Kembali ke histori kiriman</BackLink>
        <PageHeader
          actions={<span className="flex items-center"><ShipmentStatusBadge label={status.label} tone={status.tone} /></span>}
          description="Status, tindakan berikutnya, pihak, paket, dan biaya satu kiriman."
          eyebrow="Pengiriman"
          focusTargetId="shipment-detail-heading"
          title={<>Kiriman <span className="font-mono">{detail.publicReference}</span></>}
        />
      </div>

      <DetailLayout
        asideFirst
        aside={(
          // V-10: the rail (status and the next action) leads in the DOM, so it comes first on
          // mobile and in focus order at every width (spec 10 §9). V-11: the rail scrolls with the
          // page instead of owning a nested, clipped scroll area.
          <PageAside
            className="@4xl/page:static @4xl/page:max-h-none @4xl/page:overflow-visible"
            label="Status kiriman"
          >
            <Card>
              <CardHeader>
                <CardTitle id="status-lifecycle-heading">Status paket</CardTitle>
                <CardAction><ShipmentStatusBadge label={status.label} tone={status.tone} /></CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm font-medium leading-6">{status.guidance}</p>
                <dl className="grid gap-1 border-t pt-3 text-sm text-muted-foreground">
                  <div className="flex items-baseline justify-between gap-3"><dt>Dibuat</dt><dd>{formatWibDateTime(detail.createdAt)}</dd></div>
                  <div className="flex items-baseline justify-between gap-3"><dt>Aktivitas terakhir</dt><dd>{formatWibDateTime(detail.updatedAt)}</dd></div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle id="tindakan-heading">Tindakan berikutnya</CardTitle></CardHeader>
              <CardContent>
                {actions.length > 0 ? (
                  <ul className="grid gap-3" aria-labelledby="tindakan-heading">
                    {actions.map((action, index) => (
                      <li className="grid gap-2" key={action.id}>
                        {action.kind === "link" && action.href ? (
                          // The button names the action; its longer description is its accessible description.
                          <Button asChild className="min-h-11 w-full md:min-h-10" variant={index === 0 && !issuancePanelShown ? "default" : "outline"}>
                            <Link aria-describedby={`tindakan-${action.id}`} href={action.href}>{action.id === "open-label" ? <Printer aria-hidden="true" /> : null}{action.label}</Link>
                          </Button>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{action.label}</p>
                            <Badge className="shrink-0" variant="outline">Belum tersedia</Badge>
                          </div>
                        )}
                        {/* T-206: a link button says what it does; its sentence stays for screen readers only. */}
                        <p className={action.kind === "link" && action.href ? "sr-only" : "text-sm text-muted-foreground"} id={`tindakan-${action.id}`}>{action.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={emptyNote} role="status">{noActionMessage(detail.status, principal.role)}</p>
                )}
              </CardContent>
            </Card>

            {/* PR-45 detail pattern (T-151): recovery actions sit on the rail with
                the status they act on; the warnings that explain them stay at the
                top of the main column. */}
            {operationCanBeChecked ? (
              <ShipmentStaleOperationPanel shipmentId={detail.shipmentId} />
            ) : null}

            {detail.status === "SUBMISSION_UNKNOWN" && principal.role === "TENANT_ADMIN" ? (
              <ShipmentReconciliationPanel fixtureEnabled={isSanctionedReconciliationFixtureEnabled()} shipmentId={detail.shipmentId} />
            ) : null}

            {detail.status === "AWAITING_UPSTREAM_PAYMENT"
            && principal.role === "TENANT_ADMIN"
            && !recoveryNeedsReconciliation ? (
              <ShipmentUnpaidRecoveryPanel
                fixtureEnabled={isSanctionedUnpaidRecoveryFixtureEnabled()}
                shipmentId={detail.shipmentId}
              />
            ) : null}

            <ShipmentLifecycleTimeline status={detail.status} />
          </PageAside>
        )}
      >
        <DataFreshnessControl
          formattedGeneratedAt={formatWibDateTime(detail.generatedAt)}
          generatedAtIso={detail.generatedAt.toISOString()}
          initiallyStale={isDataStale(detail.generatedAt, new Date())}
        />

        {operationCanBeChecked ? (
          <Alert>
            <Clock3 aria-hidden="true" />
            <AlertTitle>Upaya penyedia masih tercatat berjalan</AlertTitle>
            <AlertDescription>Gunakan pemeriksaan status aman di panel Status jika proses tidak berubah setelah beberapa menit. Pemeriksaan ini tidak mengulang pengiriman atau pembayaran.</AlertDescription>
          </Alert>
        ) : null}

        {detail.status === "SUBMISSION_UNKNOWN" ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Jangan kirim ulang</AlertTitle>
            <AlertDescription>{principal.role === "TENANT_ADMIN" ? "Hasil penyedia belum pasti. Gunakan rekonsiliasi satu kali di panel Status untuk memeriksa referensi yang sudah tersimpan tanpa mengirim ulang pesanan." : "Hasil penyedia belum pasti. Jangan mengirim ulang; minta Tenant Admin menjalankan rekonsiliasi berdasarkan referensi yang sudah tersimpan."}</AlertDescription>
          </Alert>
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
                ? "Kiriman non-COD ini menunggu pelunasan Mengantar. Danai saldo terlebih dahulu, lalu gunakan konfirmasi pemulihan satu kali di panel Status."
                : "Kiriman non-COD ini menunggu pelunasan Mengantar. Jangan membuat kiriman pengganti; minta Tenant Admin menjalankan pemulihan."}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* T-206: the resi is the page's key fact, so it leads the main column as in the owner
            reference — courier logo and service beside a large AWB. The label link stays the one
            "Tindakan berikutnya" action (V-23). */}
        <Card aria-labelledby="riwayat-label-heading" role="region">
          <CardHeader className="border-b">
            <CardTitle id="riwayat-label-heading">Resi dan label</CardTitle>
            <CardAction className="self-center text-sm text-muted-foreground">
              {detail.printCount === 0 ? "Belum dicetak" : `Dicetak ${detail.printCount}×`}
            </CardAction>
          </CardHeader>
          <CardContent>
            {detail.provider?.awb ? (
              <div className="flex min-w-0 flex-col gap-4 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid min-w-0 gap-1">
                  <p className="text-sm text-muted-foreground">Kurir dan layanan</p>
                  <p className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold">
                    <span aria-hidden="true" className="inline-flex"><CourierLogo courier={detail.provider.courier ?? detail.provider.providerService ?? ""} /></span>
                    {serviceDisplayName(detail.provider.providerService)}
                  </p>
                </div>
                <div className="grid min-w-0 justify-items-start gap-1 sm:justify-items-end sm:text-right">
                  <p className="text-sm text-muted-foreground">Nomor resi</p>
                  <p className="font-mono text-xl font-bold break-all">{detail.provider.awb}</p>
                  <CopyPhoneButton label="Salin nomor resi" name={detail.provider.awb} phone={detail.provider.awb} showLabel />
                </div>
              </div>
            ) : (
              <p className={emptyNote}>Belum ada resi. Resi dan riwayat cetak tersedia setelah Mengantar menerbitkan AWB.</p>
            )}
          </CardContent>
        </Card>

        <Card aria-labelledby="konteks-heading" role="region">
          <CardHeader className="border-b">
            <CardTitle id="konteks-heading">Konteks operasional</CardTitle>
          </CardHeader>
          <CardContent>
            <DefinitionGrid items={[
              { label: "Outlet", value: detail.outlet.name },
              { label: "Tujuan", value: detail.destinationAreaLabel },
              { label: "Isi paket", value: detail.package.content },
              { label: "Berat / jumlah", value: `${formatWeight(detail.package.weightGrams)} · ${detail.package.quantity} koli` },
              { label: "Dimensi", value: dimensions ?? "Tidak dicatat" },
              { label: "Nilai barang", value: formatIdr(detail.package.declaredValueIdr) },
              { label: "Pembayaran", value: PAYMENT_METHOD_LABELS[detail.paymentMethod] },
            ]} />
          </CardContent>
        </Card>

        <Card aria-labelledby="snapshot-pihak-heading" role="region">
          <CardHeader className="border-b">
            <CardTitle id="snapshot-pihak-heading">Data pihak saat kiriman dibuat</CardTitle>
            <CardAction className="-my-2">
              <HelpHint label="Tentang data pihak">Data ini disalin saat kiriman dibuat dan tidak berubah ketika direktori kontak diperbarui.</HelpHint>
            </CardAction>
          </CardHeader>
          <CardContent>
            {detail.sender && detail.recipient ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {[
                  { label: "Pengirim", party: detail.sender },
                  { label: "Penerima", party: detail.recipient },
                ].map(({ label, party }) => (
                  <article className="grid min-w-0 content-start gap-1.5 text-sm" key={label}>
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</h3>
                    <p className="text-base font-semibold wrap-anywhere">{party.name}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">{party.phone}</p>
                    <p className="leading-6 wrap-anywhere">{party.address}</p>
                  </article>
                ))}
              </div>
            ) : (
              <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>Data pihak kiriman tidak lengkap</AlertTitle></Alert>
            )}
          </CardContent>
        </Card>

        {detail.status === "ESTIMATED" && detail.estimate ? (
          <ShipmentIssuancePanel
            codFormulaRetired={detail.codFormulaRetired}
            fixtureEnabled={isSanctionedOrderFixtureEnabled()}
            isCod={detail.isCod}
            options={estimateOptions}
            paymentMethod={detail.paymentMethod}
            shipmentId={detail.shipmentId}
            snapshotId={detail.estimate.snapshotId}
          />
        ) : (
          <Card aria-labelledby="estimasi-heading" role="region">
            <CardHeader className="border-b">
              <CardTitle id="estimasi-heading">Estimasi tersimpan</CardTitle>
              {detail.estimate ? (
                <CardDescription>
                  Diambil {formatWibDateTime(detail.estimate.retrievedAt)} · {detail.estimate.isCodRequested ? "COD diminta" : "Non-COD"}
                </CardDescription>
              ) : null}
              {detail.estimate ? (
                <CardAction className="-my-2">
                  <HelpHint label="Tentang estimasi tersimpan">Daftar ini hanya-baca; belum ada konfirmasi layanan dari halaman detail.</HelpHint>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent>
              {detail.estimate ? (
                detail.estimate.services.length > 0 ? (
                  <Table
                    containerClassName="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    containerProps={{ "aria-label": "Daftar estimasi tersimpan", role: "region", tabIndex: 0 }}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Layanan</TableHead>
                        <TableHead className="text-right" scope="col">Ongkir penyedia</TableHead>
                        <TableHead className="text-right" scope="col">Asuransi</TableHead>
                        <TableHead scope="col">Estimasi tiba</TableHead>
                        <TableHead scope="col">COD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.estimate.services.map((service) => (
                        <TableRow key={service.providerService}>
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              <span aria-hidden="true" className="inline-flex w-12 shrink-0 justify-center"><CourierLogo className="h-5 max-w-12" courier={service.providerService} /></span>
                              {serviceDisplayName(service.providerService)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatIdr(service.shippingAmountIdr)}</TableCell>
                          {/* V-12: the same money cells as the issuance table; a missing value is a dash, not mono prose. */}
                          <TableCell className="text-right tabular-nums">
                            {service.insuranceAmountIdr === null ? "—" : formatIdr(service.insuranceAmountIdr)}
                          </TableCell>
                          <TableCell>{deliveryEstimateLabel(service.deliveryEstimate)}</TableCell>
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
          <CardHeader className="border-b">
            <CardTitle id="hasil-penyedia-heading">Hasil penyedia</CardTitle>
            <CardDescription>Nilai tersimpan dari respons Mengantar.</CardDescription>
          </CardHeader>
          <CardContent>
            {detail.provider ? (
              <DefinitionGrid items={[
                { label: "Status pesanan", value: PROVIDER_ORDER_STATUS_LABELS[detail.provider.orderStatus] },
                { label: "Referensi pesanan", value: detail.provider.orderId ? <span className="font-mono">{detail.provider.orderId}</span> : "Belum tersedia" },
                {
                  label: "Status pengiriman ke Mengantar",
                  value: detail.provider.batchStatus ? PROVIDER_BATCH_STATUS_LABELS[detail.provider.batchStatus] : "Belum tersedia",
                },
                { label: "Layanan", value: serviceDisplayName(detail.provider.providerService) },
                { label: "AWB Mengantar", value: detail.provider.awb ? <span className="font-mono">{detail.provider.awb}</span> : "Belum tersedia" },
                {
                  label: "Ongkir / asuransi",
                  value: `${formatIdr(detail.provider.shippingAmountIdr)} · ${detail.provider.insuranceAmountIdr === null ? "asuransi tidak dikembalikan" : formatIdr(detail.provider.insuranceAmountIdr)}`,
                },
                ...(detail.provider.providerCodAmountIdr === null ? [] : [{
                  label: PAYMENT_AMOUNT_LABELS[detail.paymentMethod],
                  value: <span className="text-base font-semibold">{formatIdr(detail.provider.providerCodAmountIdr)}</span>,
                }]),
                {
                  label: "Status pembayaran",
                  value: detail.provider.isPaid === null ? "Belum diketahui" : detail.provider.isPaid ? "Lunas menurut penyedia" : "Belum lunas menurut penyedia",
                },
                { label: "Keterangan respons", value: providerResponseLabel(detail.provider.safeResponseCode ?? detail.provider.batchSafeErrorCode) },
              ]} />
            ) : (
              <p className={emptyNote} role="status">Belum ada hasil pesanan penyedia untuk kiriman ini.</p>
            )}
          </CardContent>
        </Card>

      </DetailLayout>
    </PageContainer>
  );
}
