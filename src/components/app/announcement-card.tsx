"use client";

import { CalendarClock, ChevronDown, Info, type LucideIcon, Pin, Sparkles, Truck, Wrench } from "lucide-react";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ANNOUNCEMENT_CATEGORY_LABEL,
  type AnnouncementCategory,
  announcementIsLong,
  formatAnnouncementAge,
} from "@/lib/announcements";
import { formatWibDateTime } from "@/lib/label-format";
import { cn } from "@/lib/utils";

/**
 * T-256: one tone and icon per category, from the existing status tokens (spec 10 §2.1). Danger
 * stays reserved for failures, so Pemeliharaan reads as a caution (warn), not an error.
 */
const CATEGORY_TONE: Record<AnnouncementCategory, { className: string; icon: LucideIcon }> = {
  FITUR_BARU: { className: "bg-accent text-accent-foreground", icon: Sparkles },
  INFO_KURIR: { className: "bg-info-surface text-info", icon: Truck },
  JADWAL: { className: "bg-ok-surface text-ok", icon: CalendarClock },
  PEMELIHARAAN: { className: "bg-warn-surface text-warn", icon: Wrench },
  LAINNYA: { className: "bg-muted text-muted-foreground", icon: Info },
};

/** The category as an icon + word chip (never colour alone). */
export function AnnouncementCategoryChip({ category }: { category: AnnouncementCategory }) {
  const { className, icon: Icon } = CATEGORY_TONE[category];
  return (
    <Badge className={className} data-category={category} variant="secondary">
      <Icon aria-hidden="true" data-icon="inline-start" />
      {ANNOUNCEMENT_CATEGORY_LABEL[category]}
    </Badge>
  );
}

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
        className={cn("max-w-prose text-sm leading-relaxed break-words whitespace-pre-line text-foreground", long && !open && "line-clamp-4")}
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

export type AnnouncementCardData = {
  body: string;
  /** Null only in the editor's preview before a category is chosen. */
  category: AnnouncementCategory | null;
  id: string;
  pinned: boolean;
  publishedAt: Date;
  title: string;
};

/**
 * T-256 (spec 10 §4.14): one announcement as gerai see it — category chip, "Disematkan" marker
 * with a primary edge, "Baru" + dot + bold title while new to this member, the age ("2 hari
 * lalu") with the WIB date and time in `title`, then the plain-text body at a readable measure.
 * The Admin platform's editor renders the same card as its preview.
 */
export function AnnouncementCard({
  announcement,
  isNew,
  now,
}: {
  announcement: AnnouncementCardData;
  isNew: boolean;
  /** The server's clock for the age, so server and client render the same words. */
  now: Date;
}) {
  const titleId = `info-${announcement.id}`;
  return (
    <Card
      aria-labelledby={titleId}
      className="relative gap-3 overflow-hidden px-(--card-spacing)"
      data-new={isNew ? "true" : "false"}
      data-pinned={announcement.pinned ? "true" : "false"}
      role="article"
    >
      {announcement.pinned ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" /> : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {announcement.category ? <AnnouncementCategoryChip category={announcement.category} /> : null}
        {announcement.pinned ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Pin aria-hidden="true" className="size-3.5" />
            Disematkan
          </span>
        ) : null}
        {isNew ? <Badge>Baru</Badge> : null}
        <time
          className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          dateTime={announcement.publishedAt.toISOString()}
          title={formatWibDateTime(announcement.publishedAt)}
        >
          {formatAnnouncementAge(announcement.publishedAt, now)}
        </time>
      </div>
      <h2 className="flex max-w-prose items-start gap-2 text-base break-words text-foreground" id={titleId}>
        {isNew ? <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
        <span className={isNew ? "font-bold" : "font-semibold"}>{announcement.title}</span>
      </h2>
      <AnnouncementBody body={announcement.body} />
    </Card>
  );
}
