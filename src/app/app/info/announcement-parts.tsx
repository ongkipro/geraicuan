"use client";

import { ChevronDown, Pin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { TenantAnnouncement } from "@/db/announcement-repository";

import { markAnnouncementsReadAction } from "@/app/app/info/actions";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ANNOUNCEMENT_CATEGORY_LABEL, announcementIsLong } from "@/lib/announcements";
import { formatWibDateTime } from "@/lib/label-format";
import { cn } from "@/lib/utils";

/**
 * T-244: an announcement body is plain text rendered as text (React escapes it; no HTML or
 * markdown), line breaks kept by `whitespace-pre-line`. A long body is clamped to four lines
 * behind a "Baca selengkapnya" toggle that names what it controls.
 */
export function AnnouncementBody({ body }: { body: string }) {
  const long = announcementIsLong(body);
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={cn("max-w-2xl text-sm leading-relaxed break-words whitespace-pre-line text-foreground", long && !open && "line-clamp-4")}
        data-slot="announcement-body"
        id={id}
      >
        {body}
      </p>
      {long ? (
        <Button
          aria-controls={id}
          aria-expanded={open}
          className="h-auto min-h-11 px-0 text-primary md:min-h-8"
          onClick={() => setOpen((value) => !value)}
          type="button"
          variant="link"
        >
          {open ? "Tutup" : "Baca selengkapnya"}
          <ChevronDown aria-hidden="true" className={cn("transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The list. The ids unread when the page was opened keep their "Baru" badge for this view even
 * after the receipt revalidates the page (the refreshed rows arrive already read); the next
 * visit shows them as read.
 */
export function AnnouncementFeed({ rows }: { rows: TenantAnnouncement[] }) {
  const [unreadAtOpen] = useState(() => new Set(rows.filter((row) => !row.read).map((row) => row.id)));
  return (
    <section aria-label="Daftar info" className="flex flex-col gap-4">
      <MarkAnnouncementsRead ids={[...unreadAtOpen]} />
      {rows.map((row) => <AnnouncementCard announcement={row} isNew={unreadAtOpen.has(row.id)} key={row.id} />)}
    </section>
  );
}

/**
 * Viewing /app/info reads what it shows: once per page view the unread ids are sent to the
 * idempotent Server Action, which revalidates the tenant layout so the sidebar badge clears.
 * Renders nothing.
 */
export function MarkAnnouncementsRead({ ids }: { ids: string[] }) {
  const sent = useRef<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (!key || sent.current === key) return;
    sent.current = key;
    void markAnnouncementsReadAction(key.split(",")).catch(() => {
      // A failed receipt only keeps the badge; the next visit tries again.
      sent.current = null;
    });
  }, [key]);
  return null;
}

/** One announcement (pure; rendered inside the client feed): category, pin and unread badges, WIB date, title, plain-text body. */
export function AnnouncementCard({ announcement, isNew }: { announcement: TenantAnnouncement; isNew: boolean }) {
  const titleId = `info-${announcement.id}`;
  return (
    <Card
      aria-labelledby={titleId}
      className="gap-3 px-(--card-spacing)"
      data-new={isNew ? "true" : "false"}
      role="article"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{ANNOUNCEMENT_CATEGORY_LABEL[announcement.category]}</Badge>
        {announcement.pinned ? <StatusBadge icon={Pin} label="Disematkan" tone="info" /> : null}
        {isNew ? <Badge>Baru</Badge> : null}
        <time className="ml-auto text-xs text-muted-foreground tabular-nums" dateTime={announcement.publishedAt.toISOString()}>
          {formatWibDateTime(announcement.publishedAt)}
        </time>
      </div>
      <h2 className="text-base font-semibold break-words text-foreground" id={titleId}>{announcement.title}</h2>
      <AnnouncementBody body={announcement.body} />
    </Card>
  );
}
