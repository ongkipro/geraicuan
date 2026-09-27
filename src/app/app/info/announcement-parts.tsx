"use client";

import { Megaphone, SearchX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { TenantAnnouncement } from "@/db/announcement-repository";

import { markAnnouncementsReadAction } from "@/app/app/info/actions";
import { AnnouncementCard } from "@/components/app/announcement-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_CATEGORY_SLUG,
  type AnnouncementCategory,
  type countAnnouncementsByCategory,
} from "@/lib/announcements";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("id-ID");

/**
 * T-256: the category filter — a compact segmented row of links (`?kategori=`), each with its
 * count; one scrolling row on a phone with the current segment scrolled into view.
 */
export function AnnouncementCategoryFilter({
  counts,
  selected,
}: {
  counts: ReturnType<typeof countAnnouncementsByCategory>;
  selected: AnnouncementCategory | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current=page]");
    // Horizontal only: scrollIntoView would also move the page.
    if (list && current && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    }
  }, [selected]);
  const items = [
    { count: counts.all, href: "/app/info", key: "all", label: "Semua", selected: selected === null },
    ...ANNOUNCEMENT_CATEGORIES.map((category) => ({
      count: counts[category],
      href: `/app/info?kategori=${ANNOUNCEMENT_CATEGORY_SLUG[category]}`,
      key: category,
      label: ANNOUNCEMENT_CATEGORY_LABEL[category],
      selected: selected === category,
    })),
  ];
  return (
    <nav aria-label="Kategori info" className="w-full min-w-0 rounded-2xl bg-card p-1.5 shadow-card md:w-fit">
      <ul className="flex gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]" ref={listRef}>
        {items.map((item) => (
          <li className="shrink-0" key={item.key}>
            <Link
              aria-current={item.selected ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:h-9",
                item.selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              href={item.href}
              scroll={false}
            >
              {item.label}
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums",
                  item.selected ? "bg-primary-foreground/20" : "bg-muted text-foreground",
                )}
              >
                {number.format(item.count)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The page body, always mounted across filter changes: filter, cards (pinned first, then
 * newest) and the empty states. `rows` arrive with the read state the server saw before this
 * view's receipt, so an unread row is "Baru". The ids stay "Baru" for this view even after the
 * receipt revalidates the page (refreshed rows arrive read) or the filter changes; rows that
 * first appear under another filter join the set and are marked read in turn. The next visit
 * shows them read.
 */
export function AnnouncementFeed({
  counts,
  now,
  rows,
  selected,
}: {
  counts: ReturnType<typeof countAnnouncementsByCategory>;
  now: Date;
  rows: TenantAnnouncement[];
  selected: AnnouncementCategory | null;
}) {
  const [newIds, setNewIds] = useState(() => new Set(rows.filter((row) => !row.read).map((row) => row.id)));
  const unseen = rows.filter((row) => !row.read && !newIds.has(row.id));
  if (unseen.length > 0) setNewIds(new Set([...newIds, ...unseen.map((row) => row.id)]));
  const toMark = rows.filter((row) => !row.read).map((row) => row.id);

  if (counts.all === 0) {
    return (
      <Card>
        <EmptyState
          description="Kabar fitur baru, kurir, jadwal pickup dan pemeliharaan dari tim GeraiCUAN akan tampil di sini."
          icon={Megaphone}
          title="Belum ada info"
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <MarkAnnouncementsRead ids={toMark} />
      <AnnouncementCategoryFilter counts={counts} selected={selected} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            action={<Button asChild variant="outline"><Link href="/app/info" scroll={false}>Lihat semua info</Link></Button>}
            description="Kabar di kategori lain tetap ada di Semua."
            icon={SearchX}
            title={`Belum ada info ${selected ? ANNOUNCEMENT_CATEGORY_LABEL[selected].toLocaleLowerCase("id-ID") : ""}`.trim()}
          />
        </Card>
      ) : (
        <section aria-label="Daftar info" className="flex flex-col gap-4">
          {rows.map((row) => <AnnouncementCard announcement={row} isNew={newIds.has(row.id)} key={row.id} now={now} />)}
        </section>
      )}
    </div>
  );
}

/**
 * Viewing /app/info reads what it shows: the unread ids of each rendered list are sent once to
 * the idempotent Server Action, which revalidates the tenant layout so the sidebar badge clears.
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
