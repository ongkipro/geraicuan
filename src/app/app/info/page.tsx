import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { listTenantAnnouncements } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { withTenantContext } from "@/db/tenant-context";
import { countAnnouncementsByCategory, parseAnnouncementCategoryParam } from "@/lib/announcements";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";

import { AnnouncementFeed } from "./announcement-parts";

export const metadata: Metadata = { robots: { index: false }, title: "Info terbaru" };

/**
 * T-244 (D-31): Info terbaru — platform announcements for every gerai member (both roles, a
 * gerai awaiting approval included), pinned first then newest. Viewing the page marks the
 * shown announcements read for this member only. The default landing after login stays Dasbor.
 * T-256: `?kategori=` filters by category (counts from every published row); an unknown value is Semua.
 */
export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ kategori?: string | string[] }> }) {
  let principal;
  try {
    principal = await requireCmsScope("tenant", { allowPendingApproval: true });
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");

  // T-256: read before this view's receipt, so `read: false` is exactly "unread when the page loaded".
  const rows = await withTenantContext(
    db,
    principal.userId,
    principal.tenantId,
    (tx, context) => listTenantAnnouncements(tx, context.userId),
    { allowPendingApproval: true },
  );
  const selected = parseAnnouncementCategoryParam((await searchParams).kategori);

  return (
    <>
      <PageHeader description="Kabar dari tim GeraiCuan: fitur baru, info kurir, jadwal pickup dan pemeliharaan." title="Info terbaru" />
      <AnnouncementFeed
        counts={countAnnouncementsByCategory(rows)}
        now={new Date()}
        rows={selected ? rows.filter((row) => row.category === selected) : rows}
        selected={selected}
      />
    </>
  );
}
