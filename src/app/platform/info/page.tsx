import { ArrowDown, ArrowUp, FilePen, Megaphone, Pin, Radio, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnnouncementCategoryChip } from "@/components/app/announcement-card";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { listPlatformAnnouncements, type PlatformAnnouncement } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { withPlatformContext } from "@/db/platform-context";
import {
  ANNOUNCEMENT_STATUS_LABEL,
  announcementStatus,
  type AnnouncementStatus,
  parsePlatformAnnouncementView,
  type PlatformAnnouncementOrder,
  type PlatformAnnouncementStatusFilter,
  viewPlatformAnnouncements,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";

import { wibParts } from "../_components/platform-format";
import { requirePlatformPrincipal } from "../_components/platform-view";
import { AnnouncementFeedbackLine, AnnouncementFeedbackProvider } from "./announcement-feedback";
import { AnnouncementEditor, UnpublishAnnouncement } from "./announcement-editor";

export const metadata: Metadata = { robots: { index: false }, title: "Info terbaru" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<AnnouncementStatus, { icon: typeof Pin; tone: StatusTone }> = {
  DISEMATKAN: { icon: Pin, tone: "info" },
  DRAF: { icon: FilePen, tone: "neutral" },
  TAYANG: { icon: Radio, tone: "success" },
};

const number = new Intl.NumberFormat("id-ID");

function viewHref(view: { order: PlatformAnnouncementOrder; status: PlatformAnnouncementStatusFilter }) {
  const query = new URLSearchParams();
  if (view.status !== "semua") query.set("status", view.status);
  if (view.order !== "terbaru") query.set("urut", view.order);
  const text = query.toString();
  return text ? `/platform/info?${text}` : "/platform/info";
}

/** One row: at `md` five subgrid columns (Info · Kategori · Status · Tanggal · Tindakan); below, a record card. */
function AnnouncementRow({ row }: { row: PlatformAnnouncement }) {
  const status = announcementStatus(row);
  const date = wibParts(row.publishedAt ?? row.updatedAt);
  const titleId = `info-${row.id}`;
  return (
    <li
      aria-labelledby={titleId}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 md:col-span-5 md:grid-cols-subgrid md:gap-y-0 md:px-0"
      data-status={status}
    >
      <div className="col-span-2 grid min-w-0 gap-1 md:col-span-1 md:pl-6">
        <p className="text-sm font-semibold break-words text-foreground" id={titleId}>{row.title}</p>
        <p className="line-clamp-2 text-xs break-words whitespace-pre-line text-muted-foreground">{row.body}</p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2 md:contents">
        <span className="md:px-3"><AnnouncementCategoryChip category={row.category} /></span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 md:grid md:justify-items-start md:px-3">
          <StatusBadge icon={STATUS_BADGE[status].icon} label={ANNOUNCEMENT_STATUS_LABEL[status]} tone={STATUS_BADGE[status].tone} />
          {status === "DRAF" && row.pinned ? <span className="text-xs text-muted-foreground">Disematkan saat tayang</span> : null}
        </span>
      </div>
      <p className="col-span-2 text-xs text-muted-foreground tabular-nums md:col-span-1 md:px-3">
        <span className="font-medium text-foreground">{row.publishedAt ? "Tayang" : "Diubah"}</span>{" "}
        <span className="md:block">{date.date}, {date.time}</span>
      </p>
      <div className="col-span-2 flex flex-wrap justify-end gap-2 md:col-span-1 md:pr-6">
        {row.publishedAt ? <UnpublishAnnouncement id={row.id} title={row.title} /> : null}
        <AnnouncementEditor
          announcement={{ body: row.body, category: row.category, id: row.id, pinned: row.pinned, publishedAt: row.publishedAt, title: row.title }}
        />
      </div>
    </li>
  );
}

/**
 * T-244 (D-31), T-256: the Admin platform writes Info terbaru — every announcement with its
 * status (Draf, Tayang, Disematkan), a status filter with counts and a date order in the URL
 * (`?status=tayang|draf`, `?urut=terlama`), create and edit in a dialog with a tenant preview,
 * takedown with confirmation, and one page-level result line. Super Admin only: the layout, the
 * platform context, the actions and the database functions each check.
 */
export default async function PlatformAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; urut?: string | string[] }>;
}) {
  const principal = await requirePlatformPrincipal();
  const view = parsePlatformAnnouncementView(await searchParams);
  const rows = await withPlatformContext(db, principal.userId, (tx) => listPlatformAnnouncements(tx));
  const live = rows.filter((row) => row.publishedAt !== null).length;
  const shown = viewPlatformAnnouncements(rows, view);
  const filters: { count: number; label: string; status: PlatformAnnouncementStatusFilter }[] = [
    { count: rows.length, label: "Semua", status: "semua" },
    { count: live, label: "Tayang", status: "tayang" },
    { count: rows.length - live, label: "Draf", status: "draf" },
  ];
  const SortIcon = view.order === "terbaru" ? ArrowDown : ArrowUp;

  return (
    <AnnouncementFeedbackProvider>
      <PageHeader
        actions={<AnnouncementEditor />}
        description="Kabar dari tim GeraiCUAN untuk semua gerai. Gerai hanya melihat info yang tayang."
        title="Info terbaru"
      />
      <AnnouncementFeedbackLine />
      {rows.length === 0 ? (
        <DataCard>
          <EmptyState description="Buat info pertama untuk mengabarkan fitur baru, perubahan kurir, jadwal atau pemeliharaan ke semua gerai." icon={Megaphone} title="Belum ada info" />
        </DataCard>
      ) : (
        <>
          <nav aria-label="Status info" className="w-full min-w-0 rounded-2xl bg-card p-1.5 shadow-card md:w-fit">
            <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {filters.map((filter) => (
                <li className="shrink-0" key={filter.status}>
                  <Link
                    aria-current={view.status === filter.status ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:h-9",
                      view.status === filter.status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    href={viewHref({ ...view, status: filter.status })}
                    scroll={false}
                  >
                    {filter.label}
                    <span className={cn("min-w-6 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums", view.status === filter.status ? "bg-primary-foreground/20" : "bg-muted text-foreground")}>
                      {number.format(filter.count)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        <DataCard
          action={(
            <nav aria-label="Urutkan menurut tanggal" className="flex items-center gap-1">
              {(["terbaru", "terlama"] as const).map((order) => (
                <Button asChild className="h-11 px-3 md:h-9" key={order} size="sm" variant={view.order === order ? "secondary" : "ghost"}>
                  <Link aria-current={view.order === order ? "true" : undefined} href={viewHref({ ...view, order })} scroll={false}>
                    {order === "terbaru" ? "Terbaru" : "Terlama"}
                  </Link>
                </Button>
              ))}
            </nav>
          )}
          count={shown.length}
          flush
          title="Daftar info"
        >
          {shown.length === 0 ? (
            <EmptyState
              action={<Button asChild variant="outline"><Link href={viewHref({ ...view, status: "semua" })} scroll={false}>Lihat semua info</Link></Button>}
              description={view.status === "draf" ? "Semua info sudah tayang." : "Belum ada info yang tayang untuk gerai."}
              icon={SearchX}
              title={view.status === "draf" ? "Tidak ada draf" : "Tidak ada info tayang"}
            />
          ) : (
            <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
              <div aria-hidden="true" className="hidden h-11 items-center border-b text-xs font-medium text-muted-foreground md:col-span-5 md:grid md:grid-cols-subgrid">
                <span className="pl-6">Info</span>
                <span className="px-3">Kategori</span>
                <span className="px-3">Status</span>
                <span className="flex items-center gap-1 px-3 text-foreground">Tanggal<SortIcon className="size-3.5" /></span>
                <span className="pr-6 text-right">Tindakan</span>
              </div>
              <ul aria-label={`Daftar info, ${view.order === "terbaru" ? "terbaru" : "terlama"} dulu`} className="divide-y md:col-span-5 md:grid md:grid-cols-subgrid">
                {shown.map((row) => <AnnouncementRow key={row.id} row={row} />)}
              </ul>
            </div>
          )}
        </DataCard>
        </>
      )}
    </AnnouncementFeedbackProvider>
  );
}
