import { and, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BulkIntakeForm } from "@/app/app/impor/bulk-intake-form";
import { FocusRegion } from "@/app/app/focus-region";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { outlets } from "@/db/schema";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

export const metadata: Metadata = { robots: { index: false } };

type BulkImportPageProps = { searchParams: Promise<{ dibuat?: string }> };

export default async function BulkImportPage({ searchParams }: BulkImportPageProps) {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const configuredOutlets = await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) =>
    tx
      .select({ id: outlets.id, name: outlets.name })
      .from(outlets)
      .where(
        and(
          eq(outlets.tenantId, context.tenantId),
          isNotNull(outlets.defaultOriginAreaId),
          isNotNull(outlets.defaultPickupAddressId),
        ),
      )
      .orderBy(outlets.name),
  );
  const created = Number((await searchParams).dibuat);
  const createdCount = Number.isInteger(created) && created >= 1 && created <= 100 ? created : null;

  return (
    <main className="ship-shell">
      <a className="sales-skip" href="#form-impor">Lewati ke formulir impor</a>
      <header className="ship-header"><p className="ship-wordmark">GeraiCUAN</p><a href="/app">Kembali ke draf tunggal</a></header>
      <section className="ship-intro"><p className="sales-eyebrow">KIRIMAN MASSAL</p><h1>Impor kiriman massal</h1><p>Periksa CSV sebelum membuat draf kiriman tenant Anda.</p><a className="sales-secondary" href="/app/impor/template.csv">Unduh template CSV</a></section>
      {createdCount ? <FocusRegion className="ship-success" role="status"><h2>{createdCount} draf kiriman tersimpan.</h2><p>Status: <strong>DRAFT</strong>. Perkiraan layanan dan biaya belum tersedia pada tahap ini.</p></FocusRegion> : null}
      {configuredOutlets.length === 0 ? <section className="ship-blocked" role="status"><h2>Outlet belum dikonfigurasi.</h2><p>{principal.role === "TENANT_ADMIN" ? "Lengkapi alamat pickup dan area asal outlet sebelum mengimpor draf." : "Hubungi Tenant Admin untuk mengatur alamat pickup outlet."}</p></section> : <BulkIntakeForm outlets={configuredOutlets} />}
    </main>
  );
}
