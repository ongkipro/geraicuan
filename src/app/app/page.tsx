import { and, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ShipmentDraftForm } from "@/app/app/shipment-draft-form";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
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
          .select({ id: shipments.id })
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
              eq(shipments.status, "DRAFT"),
            ),
          )
          .limit(1)
      : [];

    return { configuredOutlets, savedDraft: savedDraft[0] };
  });

  return (
    <main className="ship-shell">
      <a className="sales-skip" href="#form-kiriman">Lewati ke formulir</a>
      <header className="ship-header">
        <p className="ship-wordmark">GeraiCUAN</p>
        <p>{principal.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator"}</p>
      </header>
      <section className="ship-intro">
        <p className="sales-eyebrow">KIRIMAN BARU</p>
        <h1>Buat draf kiriman</h1>
        <p>Simpan detail pengiriman sebelum perkiraan layanan dan biaya tersedia.</p>
      </section>

      {data.savedDraft ? (
        <FocusRegion className="ship-success" role="status">
          <h2>Draf kiriman tersimpan.</h2>
          <p>Nomor draf: {data.savedDraft.id.slice(0, 8).toUpperCase()} · <strong>DRAFT</strong></p>
          <p>Perkiraan layanan dan biaya belum tersedia pada tahap ini.</p>
          <a className="sales-secondary" href="/app">Buat draf berikutnya</a>
        </FocusRegion>
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
