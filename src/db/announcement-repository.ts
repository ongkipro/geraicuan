import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { PlatformTransaction } from "@/db/platform-context";
import * as schema from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-context";
import type { AnnouncementCategory, AnnouncementInput } from "@/lib/announcements";

type Database = NodePgDatabase<typeof schema>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * T-244 (D-31): Info terbaru. Gerai members read published announcements and write only their
 * own read receipts (tenant context, RLS in migration 0066). The Admin platform lists every row
 * in the platform context and writes only through `save_platform_announcement` and
 * `unpublish_platform_announcement`, SECURITY DEFINER functions that re-check the Super Admin
 * role and append the audit event in the same statement.
 */
export type TenantAnnouncement = {
  body: string;
  category: AnnouncementCategory;
  id: string;
  pinned: boolean;
  publishedAt: Date;
  read: boolean;
  title: string;
};

export type PlatformAnnouncement = {
  body: string;
  category: AnnouncementCategory;
  createdAt: Date;
  id: string;
  pinned: boolean;
  publishedAt: Date | null;
  title: string;
  updatedAt: Date;
};

const { platformAnnouncementReads: reads, platformAnnouncements: announcements } = schema;

/** Published announcements, pinned first then newest, each with the caller's own read state. */
export async function listTenantAnnouncements(tx: TenantTransaction, userId: string): Promise<TenantAnnouncement[]> {
  const rows = await tx
    .select({
      body: announcements.body,
      category: announcements.category,
      id: announcements.id,
      pinned: announcements.pinned,
      publishedAt: announcements.publishedAt,
      readAt: reads.readAt,
      title: announcements.title,
    })
    .from(announcements)
    .leftJoin(reads, and(eq(reads.announcementId, announcements.id), eq(reads.userId, userId)))
    .where(isNotNull(announcements.publishedAt))
    .orderBy(desc(announcements.pinned), desc(announcements.publishedAt), asc(announcements.id));
  return rows.map(({ publishedAt, readAt, ...row }) => ({ ...row, publishedAt: publishedAt!, read: readAt !== null }));
}

/** Published announcements the caller has not read yet (sidebar badge, Dasbor line). */
export async function countUnreadAnnouncements(tx: TenantTransaction, userId: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(announcements)
    .leftJoin(reads, and(eq(reads.announcementId, announcements.id), eq(reads.userId, userId)))
    .where(and(isNotNull(announcements.publishedAt), isNull(reads.userId)));
  return row?.value ?? 0;
}

/**
 * Records that the caller has seen these announcements. Idempotent: a second view writes
 * nothing, and an id that is not a published announcement is skipped (RLS refuses it too).
 * Returns how many receipts were new.
 */
export async function markAnnouncementsRead(tx: TenantTransaction, userId: string, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const visible = await tx
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(inArray(announcements.id, [...ids]), isNotNull(announcements.publishedAt)));
  if (visible.length === 0) return 0;
  const inserted = await tx
    .insert(reads)
    .values(visible.map((row) => ({ announcementId: row.id, userId })))
    .onConflictDoNothing()
    .returning({ id: reads.announcementId });
  return inserted.length;
}

/** Every announcement, drafts included, for the Admin platform. Runs inside `withPlatformContext`. */
export async function listPlatformAnnouncements(tx: PlatformTransaction): Promise<PlatformAnnouncement[]> {
  return tx
    .select({
      body: announcements.body,
      category: announcements.category,
      createdAt: announcements.createdAt,
      id: announcements.id,
      pinned: announcements.pinned,
      publishedAt: announcements.publishedAt,
      title: announcements.title,
      updatedAt: announcements.updatedAt,
    })
    .from(announcements)
    .orderBy(sql`${announcements.publishedAt} IS NOT NULL`, desc(announcements.pinned), desc(sql`coalesce(${announcements.publishedAt}, ${announcements.updatedAt})`), asc(announcements.id));
}

export class AnnouncementDeniedError extends Error {
  constructor() {
    super("Announcement writes require an active Super Admin.");
  }
}

export class AnnouncementStateError extends Error {
  constructor(readonly reason: "invalid" | "not-found") {
    super(`Announcement write refused: ${reason}.`);
  }
}

function postgresCode(error: unknown) {
  const candidate = error as { cause?: { code?: string }; code?: string };
  return candidate?.cause?.code ?? candidate?.code;
}

async function asPlatformAdmin<T>(db: Database, userId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const role = await tx.execute<{ rolsuper: boolean; rolbypassrls: boolean }>(
        sql`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      );
      if (role.rows.length !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
        throw new AnnouncementDeniedError();
      }
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.execute(sql`select set_config('app.platform_admin', 'true', true)`);
      return work(tx);
    });
  } catch (error) {
    if (error instanceof AnnouncementDeniedError || error instanceof AnnouncementStateError) throw error;
    const code = postgresCode(error);
    if (code === "42501") throw new AnnouncementDeniedError();
    if (code === "P0002") throw new AnnouncementStateError("not-found");
    if (code === "22023" || code === "22P02" || code === "23514") throw new AnnouncementStateError("invalid");
    throw error;
  }
}

/**
 * Creates (`id` omitted) or edits an announcement. `publish` true shows it to every gerai
 * (keeping its first publication time when it was already live); false keeps or returns it to
 * draft. Returns the announcement id.
 */
export async function savePlatformAnnouncement(
  db: Database,
  userId: string,
  input: AnnouncementInput & { id?: string },
): Promise<string> {
  return asPlatformAdmin(db, userId, async (tx) => {
    const result = await tx.execute<{ id: string }>(sql`
      SELECT save_platform_announcement(
        ${input.id ?? null}::uuid, ${input.title}, ${input.body}, ${input.category}, ${input.pinned}, ${input.publish}
      ) AS id
    `);
    const id = result.rows[0]?.id;
    if (!id) throw new AnnouncementStateError("not-found");
    return id;
  });
}

/** Takes a published announcement back to draft. Unpublishing a draft changes nothing. */
export async function unpublishPlatformAnnouncement(db: Database, userId: string, id: string): Promise<void> {
  await asPlatformAdmin(db, userId, (tx) => tx.execute(sql`SELECT unpublish_platform_announcement(${id}::uuid)`));
}
