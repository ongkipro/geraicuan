import { randomUUID } from "node:crypto";

import { ArrowLeft, CircleAlert, Printer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LabelSheet } from "@/app/app/label/[shipmentId]/label-sheet";
import { loadBatchPrint } from "@/app/app/label/cetak/batch-data";
import { BatchPrintPanel } from "@/app/app/label/cetak/batch-print-panel";
import { IssueBatchInvoicesButton } from "@/app/app/label/cetak/issue-batch-invoices-button";
import { BATCH_CONTENT_LABELS, includesInvoices, includesLabels, parseBatchPrintQuery } from "@/app/app/label/cetak/batch-query";
import { requireTenantPrincipal } from "@/app/app/pengiriman/_list/tenant-page";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { loadTenantLabelFields } from "@/db/tenant-settings-repository";
import { LABEL_SIZES } from "@/lib/label-size";

export const metadata: Metadata = { title: "Pratinjau cetak", robots: { index: false } };

function BackToList() {
  return (
    <Link className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary hover:underline md:min-h-6" href="/app/label">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Kembali ke daftar cetak resi
    </Link>
  );
}

export default async function BatchPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await requireTenantPrincipal();
  const query = parseBatchPrintQuery(await searchParams);
  const { fields, items } = query.numbers.length === 0
    ? { fields: undefined, items: [] }
    : await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => ({
      // PR-86: every sheet applies the gerai's Informasi label choice for the batch size.
      fields: await loadTenantLabelFields(tx, context),
      items: await loadBatchPrint(tx, context, query),
    }));

  const ready = items.flatMap((item) => (item.kind === "ready" ? [item] : []));
  const skipped = items.flatMap((item) => (item.kind === "skipped" ? [item] : []));
  const labels = includesLabels(query.content) ? ready : [];
  const invoices = includesInvoices(query.content) ? ready.flatMap((item) => (item.invoice ? [item.invoice] : [])) : [];
  const withoutInvoice = includesInvoices(query.content) ? ready.filter((item) => !item.invoice) : [];

  const header = (
    <div className="label-hide">
      <PageHeader
        back={<BackToList />}
        description={`${BATCH_CONTENT_LABELS[query.content]} · ${LABEL_SIZES[query.size].name} · ${ready.length} kiriman`}
        eyebrow="Pengiriman"
        title="Pratinjau cetak"
      />
    </div>
  );

  const pendingInvoices = withoutInvoice.length > 0 ? (
    <Alert className="label-hide" role="status">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{withoutInvoice.length} invoice belum diterbitkan</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>Invoice diterbitkan sekali per kiriman dan tidak berubah saat dicetak ulang.</p>
        <IssueBatchInvoicesButton numbers={withoutInvoice.map((item) => item.tenantNumber)} />
      </AlertDescription>
    </Alert>
  ) : null;

  if (labels.length === 0 && invoices.length === 0) {
    return (
      <>
        {header}
        {pendingInvoices}
        <DataCard>
          <EmptyState
            action={
              <Button asChild variant="outline">
                <Link href="/app/label">Pilih resi di daftar cetak resi</Link>
              </Button>
            }
            description={skipped.length > 0 ? "Kiriman yang dipilih belum punya resi atau tidak ditemukan." : undefined}
            icon={Printer}
            title="Tidak ada yang dapat dicetak"
          />
        </DataCard>
      </>
    );
  }

  return (
    <>
      {header}
      {pendingInvoices}
      {skipped.length > 0 || query.invalid.length > 0 ? (
        <Alert className="label-hide" role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{skipped.length + query.invalid.length} kiriman dilewati</AlertTitle>
          <AlertDescription>
            <ul className="grid gap-1">
              {skipped.map((item) => (
                <li key={item.tenantNumber}>
                  <span className="font-mono">{item.tenantNumber}</span>
                  {item.reason === "NOT_ISSUED" ? " — resi belum terbit" : " — tidak ditemukan"}
                </li>
              ))}
              {query.invalid.map((entry) => (
                <li key={`bad-${entry}`}><span className="font-mono">{entry}</span> — bukan nomor kiriman</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <BatchPrintPanel
        attempts={labels.map((item) => ({ attemptId: randomUUID(), shipmentId: item.label.shipmentId }))}
        invoices={invoices}
        labels={labels.length > 0 ? labels.map((item) => <LabelSheet fields={fields} key={item.label.shipmentId} label={item.label} />) : null}
        size={query.size}
      />
    </>
  );
}
