import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DraftEstimatePanel } from "@/app/app/draft-estimate-panel";
import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
import { loadLatestEstimateSnapshot } from "@/db/estimate-repository";
import { withTenantContext } from "@/db/tenant-context";
import { outlets, shipmentDrafts, shipments } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TenantCmsPageProps = { searchParams: Promise<{ draft?: string }> };

export default async function TenantCmsBoundary({ searchParams }: TenantCmsPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) {
      redirect("/login/tenant");
    }
    throw error;
  }

  if (principal.scope !== "tenant") {
    redirect("/login/tenant");
  }

  const requestedDraftId = (await searchParams).draft;
  const data = await withTenantContext(db, principal.userId, principal.tenantId, async (tx, context) => {
    const configuredOutlets = await tx
      .select({ id: outlets.id, name: outlets.name })
      .from(outlets)
      .where(
        and(
          eq(outlets.tenantId, context.tenantId),
          isNotNull(outlets.defaultOriginAreaId),
          isNotNull(outlets.defaultPickupAddressId),
        ),
      )
      .orderBy(outlets.name);

    const savedDraft = requestedDraftId && UUID_PATTERN.test(requestedDraftId)
      ? await tx
          .select({ id: shipments.id, isCod: shipmentDrafts.isCod, status: shipments.status })
          .from(shipments)
          .innerJoin(
            shipmentDrafts,
            and(
              eq(shipmentDrafts.shipmentId, shipments.id),
              eq(shipmentDrafts.tenantId, shipments.tenantId),
            ),
          )
          .where(
            and(
              eq(shipments.id, requestedDraftId),
              eq(shipments.tenantId, context.tenantId),
              inArray(shipments.status, ["DRAFT", "ESTIMATED"]),
            ),
          )
          .limit(1)
      : [];

    const saved = savedDraft[0];
    const estimateSnapshot = saved
      ? await loadLatestEstimateSnapshot(tx, context, saved.id)
      : null;
    return { configuredOutlets, estimateSnapshot, savedDraft: saved };
  });

  return (
    <main className="ship-shell">
      <a className="sales-skip" href={data.savedDraft ? "#estimasi-draf" : "#form-kiriman"}>
        {data.savedDraft ? "Lewati ke estimasi" : "Lewati ke formulir"}
      </a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <p>{principal.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}</p>
      </header>
      <section className="ship-intro">
        <p className="sales-eyebrow">KIRIMAN BARU</p>
        <h1>Buat draf kiriman</h1>
        <p>Simpan detail pengiriman, lalu muat estimasi layanan dari Mengantar.</p>
        <a className="sales-secondary" href="/app/impor">Impor massal (CSV)</a>
        <Link className="sales-secondary" href="/app/kontak">Direktori kontak</Link>
        <Link className="sales-secondary" href="/app/label">Label &amp; cetak</Link>
        {principal.role === "TENANT_ADMIN" ? (
          <Link className="sales-secondary" href="/app/analitik">
            Analitik kiriman
          </Link>
        ) : null}
      </section>

      {data.savedDraft ? (
        <FocusRegion className="ship-success" role="status">
          <h2>Draf kiriman tersimpan.</h2>
          <p>Nomor draf: {data.savedDraft.id.slice(0, 8).toUpperCase()} · <strong>{data.savedDraft.status}</strong></p>
          <p>Estimasi layanan dapat dimuat di bawah tanpa membuat pesanan ke penyedia.</p>
          <a className="sales-secondary" href="/app">Buat draf berikutnya</a>
        </FocusRegion>
      ) : null}

      {data.savedDraft ? (
        <DraftEstimatePanel
          draftId={data.savedDraft.id}
          isCod={data.savedDraft.isCod}
          snapshot={
            data.estimateSnapshot
              ? {
                  retrievedAt: data.estimateSnapshot.retrievedAt.toISOString(),
                  services: data.estimateSnapshot.services,
                }
              : null
          }
        />
      ) : null}

      {data.configuredOutlets.length === 0 ? (
        <section className="ship-blocked" role="status">
          <h2>Outlet belum dikonfigurasi.</h2>
          <p>
            {principal.role === "TENANT_ADMIN"
              ? "Lengkapi alamat pickup dan area asal outlet sebelum membuat draf."
              : "Hubungi Tenant Admin untuk mengatur alamat pickup outlet."}
          </p>
        </section>
      ) : (
        <ShipmentDraftForm autoFocusFirstField={!data.savedDraft} outlets={data.configuredOutlets} />
      )}
    </main>
  );
}
