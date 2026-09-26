import { FilePen, Megaphone, Pin, Radio } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge, type StatusTone } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listPlatformAnnouncements, type PlatformAnnouncement } from "@/db/announcement-repository";
import { db } from "@/db/client";
import { withPlatformContext } from "@/db/platform-context";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_STATUS_LABEL,
  announcementStatus,
  type AnnouncementStatus,
} from "@/lib/announcements";

import { formatWib } from "../_components/platform-format";
import { requirePlatformPrincipal } from "../_components/platform-view";
import { AnnouncementEditor, UnpublishAnnouncement } from "./announcement-editor";

export const metadata: Metadata = { robots: { index: false }, title: "Info terbaru" };
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<AnnouncementStatus, { icon: typeof Pin; tone: StatusTone }> = {
  DISEMATKAN: { icon: Pin, tone: "info" },
  DRAF: { icon: FilePen, tone: "neutral" },
  TAYANG: { icon: Radio, tone: "success" },
};

function AnnouncementRow({ row }: { row: PlatformAnnouncement }) {
  const status = announcementStatus(row);
  const titleId = `info-${row.id}`;
  return (
    <Card aria-labelledby={titleId} className="gap-3 px-(--card-spacing)" data-status={status} role="article">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge icon={STATUS_BADGE[status].icon} label={ANNOUNCEMENT_STATUS_LABEL[status]} tone={STATUS_BADGE[status].tone} />
        <Badge variant="secondary">{ANNOUNCEMENT_CATEGORY_LABEL[row.category]}</Badge>
        {status === "DRAF" && row.pinned ? <span className="text-xs text-muted-foreground">Disematkan saat tayang</span> : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {row.publishedAt ? `Tayang ${formatWib(row.publishedAt)}` : `Diubah ${formatWib(row.updatedAt)}`}
        </span>
      </div>
      <h2 className="text-base font-semibold break-words" id={titleId}>{row.title}</h2>
      <p className="line-clamp-3 max-w-2xl text-sm break-words whitespace-pre-line text-muted-foreground">{row.body}</p>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {row.publishedAt ? <UnpublishAnnouncement id={row.id} inline title={row.title} /> : null}
        <AnnouncementEditor
          inline
          announcement={{ body: row.body, category: row.category, id: row.id, pinned: row.pinned, published: row.publishedAt !== null, title: row.title }}
        />
      </div>
    </Card>
  );
}

/**
 * T-244 (D-31): the Admin platform writes Info terbaru — every announcement with its status
 * (Draf, Tayang, Disematkan), create and edit in a dialog, unpublish with confirmation. Super
 * Admin only: the layout, the platform context, the actions and the database functions each check.
 */
export default async function PlatformAnnouncementsPage() {
  const principal = await requirePlatformPrincipal();
  const rows = await withPlatformContext(db, principal.userId, (tx) => listPlatformAnnouncements(tx));
  const live = rows.filter((row) => row.publishedAt !== null).length;

  return (
    <>
      <PageHeader
        actions={<AnnouncementEditor />}
        description={`${live} tayang · ${rows.length - live} draf. Gerai melihat info yang tayang di menu Info terbaru.`}
        eyebrow="Platform"
        title="Info terbaru"
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState description="Buat info pertama untuk mengabarkan fitur baru, perubahan kurir, jadwal atau pemeliharaan ke semua gerai." icon={Megaphone} title="Belum ada info" />
        </Card>
      ) : (
        <section aria-label="Daftar info" className="flex flex-col gap-4">
          {rows.map((row) => <AnnouncementRow key={row.id} row={row} />)}
        </section>
      )}
    </>
  );
}
