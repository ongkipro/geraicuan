import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { listTenantAnnouncements } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

import { AnnouncementFeed } from "./announcement-parts";

export const metadata: Metadata = { robots: { index: false }, title: "Info terbaru" };

/**
 * T-244 (D-31): Info terbaru — platform announcements for every gerai member (both roles, a
 * gerai awaiting approval included), pinned first then newest. Viewing the page marks the
 * shown announcements read for this member only. The default landing after login stays Dasbor.
 */
export default async function AnnouncementsPage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  const rows = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => listTenantAnnouncements(tx, context.userId),
    { allowPendingApproval: true },
  );
  const unread = rows.filter((row) => !row.read);

  return (
    <>
      <PageHeader
        description={unread.length > 0 ? `${unread.length} info baru untuk Anda` : "Kabar dari tim GeraiCUAN: fitur, kurir, jadwal dan pemeliharaan."}
        eyebrow="Utama"
        title="Info terbaru"
      />
      {rows.length === 0 ? (
        <DataCard>
          <EmptyState description="Kabar fitur baru, kurir, jadwal pickup dan pemeliharaan akan tampil di sini." icon={Megaphone} title="Belum ada info" />
        </DataCard>
      ) : (
        <AnnouncementFeed rows={rows} />
      )}
    </>
  );
}
