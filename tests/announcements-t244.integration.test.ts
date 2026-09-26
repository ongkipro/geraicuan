// T-244 (D-31): Info terbaru — platform announcements. Gerai members read published rows and
// write only their own read receipts; only an active Super Admin in the platform context writes
// announcements, through the SECURITY DEFINER functions that also audit. Announcements are
// platform-wide, so this suite owns the (isolated) table while it runs.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnouncementFeed } from "@/app/app/info/announcement-parts";
import {
  AnnouncementStateError,
  countUnreadAnnouncements,
  listPlatformAnnouncements,
  listTenantAnnouncements,
  markAnnouncementsRead,
  savePlatformAnnouncement,
  unpublishPlatformAnnouncement,
  type TenantAnnouncement,
} from "@/db/announcement-repository";
import { withPlatformContext } from "@/db/platform-context";
import * as schema from "@/db/schema";
import { withTenantContext } from "@/db/tenant-context";
import { announcementIsLong, announcementStatus, parseAnnouncementForm } from "@/lib/announcements";
import { platformCmsNavigation, tenantCmsNavigation } from "@/lib/cms-shell-navigation";
import { ensureIntegrationRuntimeRole } from "./integration-runtime-role";

const adminDatabaseUrl = process.env.DATABASE_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
if (!adminDatabaseUrl || !appDatabaseUrl) {
  throw new Error("DATABASE_URL and APP_DATABASE_URL are required for integration tests.");
}
if (new URL(adminDatabaseUrl).pathname !== "/geraicuan_test") {
  throw new Error("Integration tests require the isolated geraicuan_test database.");
}

const principal = vi.hoisted(() => ({
  platform: { status: "authorized", principal: { scope: "platform", userId: "" } } as Record<string, unknown>,
  tenant: { scope: "tenant", userId: "", tenantId: "", role: "OPERATOR", tenantStatus: "ACTIVE" } as Record<string, unknown>,
}));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => principal.tenant),
}));
vi.mock("@/app/platform/platform-access", () => ({ resolvePlatformAccess: vi.fn(async () => principal.platform) }));
vi.mock("@/db/client", async () => {
  const { drizzle: connect } = await import("drizzle-orm/node-postgres");
  const { Pool: PgPool } = await import("pg");
  const tables = await import("@/db/schema");
  const pool = new PgPool({ connectionString: process.env.APP_DATABASE_URL });
  return { db: connect({ client: pool, schema: tables }), pool };
});

const adminPool = new Pool({ connectionString: adminDatabaseUrl });
const appPool = new Pool({ connectionString: appDatabaseUrl });
const appDb = drizzle({ client: appPool, schema });

const tenantA = "00000000-0000-0244-0000-0000000000a1";
const tenantPending = "00000000-0000-0244-0000-0000000000b1";
const adminA = "t244-admin-a";
const operatorA = "t244-operator-a";
const pendingAdmin = "t244-pending-admin";
const superAdmin = "t244-super-admin";
const suspendedSuper = "t244-suspended-super";
const users = [adminA, operatorA, pendingAdmin, superAdmin, suspendedSuper];

const draft = { body: "Isi draf.", category: "LAINNYA", pinned: false, publish: false, title: "T244 draf" } as const;

function asMember<T>(userId: string, tenantId: string, work: Parameters<typeof withTenantContext<T>>[3]) {
  return withTenantContext(appDb, userId, tenantId, work, { allowPendingApproval: true });
}

async function pgCode(work: () => Promise<unknown>) {
  try {
    await work();
    return "accepted";
  } catch (error) {
    const candidate = error as { cause?: { code?: string }; code?: string };
    return candidate.cause?.code ?? candidate.code ?? (error as Error).constructor.name;
  }
}

async function clean() {
  await adminPool.query("DELETE FROM platform_announcement_reads");
  await adminPool.query("DELETE FROM platform_announcements");
  await adminPool.query("DELETE FROM audit_events WHERE actor_id = ANY($1::text[]) OR tenant_id = ANY($2::uuid[])", [users, [tenantA, tenantPending]]);
  await adminPool.query("DELETE FROM platform_roles WHERE user_id = ANY($1::text[])", [users]);
  await adminPool.query("DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])", [[tenantA, tenantPending]]);
  await adminPool.query("DELETE FROM tenants WHERE id = ANY($1::uuid[])", [[tenantA, tenantPending]]);
  await adminPool.query("DELETE FROM users WHERE id = ANY($1::text[])", [users]);
}

beforeAll(async () => {
  await ensureIntegrationRuntimeRole(adminPool, appDatabaseUrl);
});

beforeEach(async () => {
  await clean();
  revalidatePath.mockClear();
  await adminPool.query(
    `INSERT INTO users (id, name, email, status) VALUES
      ($1, 'T244 Admin A', 't244-admin-a@example.test', 'ACTIVE'),
      ($2, 'T244 Operator A', 't244-operator-a@example.test', 'ACTIVE'),
      ($3, 'T244 Pending Admin', 't244-pending@example.test', 'ACTIVE'),
      ($4, 'T244 Super', 't244-super@example.test', 'ACTIVE'),
      ($5, 'T244 Suspended Super', 't244-suspended-super@example.test', 'SUSPENDED')`,
    users,
  );
  await adminPool.query(
    "INSERT INTO tenants (id, name, status) VALUES ($1, 'Gerai Info A', 'ACTIVE'), ($2, 'Gerai Info Pending', 'PROVISIONING')",
    [tenantA, tenantPending],
  );
  await adminPool.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES
      ($1, $2, 'TENANT_ADMIN'), ($1, $3, 'OPERATOR'), ($4, $5, 'TENANT_ADMIN')`,
    [tenantA, adminA, operatorA, tenantPending, pendingAdmin],
  );
  await adminPool.query("INSERT INTO platform_roles (user_id) VALUES ($1), ($2)", [superAdmin, suspendedSuper]);
  principal.tenant = { scope: "tenant", userId: adminA, tenantId: tenantA, role: "TENANT_ADMIN", tenantStatus: "ACTIVE" };
  principal.platform = { status: "authorized", principal: { scope: "platform", userId: superAdmin } };
});

afterAll(async () => {
  await clean();
  const client = await import("@/db/client") as unknown as { pool: Pool };
  await Promise.all([adminPool.end(), appPool.end(), client.pool.end()]);
});

describe("Info terbaru data boundary (T-244)", () => {
  it("shows gerai members published announcements only, pinned first then newest; the platform sees drafts too", async () => {
    const draftId = await savePlatformAnnouncement(appDb, superAdmin, draft);
    const olderPinned = await savePlatformAnnouncement(appDb, superAdmin, { body: "Sematan.", category: "JADWAL", pinned: true, publish: true, title: "T244 disematkan" });
    const newer = await savePlatformAnnouncement(appDb, superAdmin, { body: "Baru.", category: "FITUR_BARU", pinned: false, publish: true, title: "T244 terbaru" });
    const newest = await savePlatformAnnouncement(appDb, superAdmin, { body: "Paling baru.", category: "INFO_KURIR", pinned: false, publish: true, title: "T244 paling baru" });
    // Publication times differ even within one test run.
    await adminPool.query("UPDATE platform_announcements SET published_at = published_at - interval '2 hours' WHERE id = $1", [olderPinned]);
    await adminPool.query("UPDATE platform_announcements SET published_at = published_at - interval '1 hour' WHERE id = $1", [newer]);

    for (const [user, tenant] of [[adminA, tenantA], [operatorA, tenantA], [pendingAdmin, tenantPending]] as const) {
      const rows = await asMember(user, tenant, (tx, context) => listTenantAnnouncements(tx, context.userId));
      expect(rows.map((row) => row.id), user).toEqual([olderPinned, newest, newer]);
      expect(rows.every((row) => !row.read)).toBe(true);
    }
    // Directly, too: RLS hides the draft even from a query that asks for it.
    const direct = await asMember(adminA, tenantA, (tx) => tx.execute(sql`SELECT id FROM platform_announcements WHERE id = ${draftId}`));
    expect(direct.rows).toEqual([]);

    const platform = await withPlatformContext(appDb, superAdmin, (tx) => listPlatformAnnouncements(tx));
    expect(platform.map((row) => row.id)).toEqual([draftId, olderPinned, newest, newer]);
    expect(platform.map((row) => announcementStatus(row))).toEqual(["DRAF", "DISEMATKAN", "TAYANG", "TAYANG"]);
  });

  it("keeps read state per user: one member reading clears only their own count, idempotently", async () => {
    const first = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, publish: true, title: "T244 satu" });
    const second = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, publish: true, title: "T244 dua" });
    await savePlatformAnnouncement(appDb, superAdmin, draft);
    const count = (user: string) => asMember(user, tenantA, (tx, context) => countUnreadAnnouncements(tx, context.userId));

    expect(await count(adminA)).toBe(2);
    expect(await count(operatorA)).toBe(2);
    expect(await asMember(adminA, tenantA, (tx, context) => markAnnouncementsRead(tx, context.userId, [first]))).toBe(1);
    expect(await asMember(adminA, tenantA, (tx, context) => markAnnouncementsRead(tx, context.userId, [first, second]))).toBe(1);
    expect(await asMember(adminA, tenantA, (tx, context) => markAnnouncementsRead(tx, context.userId, [first, second]))).toBe(0);
    expect(await count(adminA)).toBe(0);
    expect(await count(operatorA)).toBe(2);
    const rows = await asMember(adminA, tenantA, (tx, context) => listTenantAnnouncements(tx, context.userId));
    expect(rows.every((row) => row.read)).toBe(true);
    const receipts = await adminPool.query("SELECT user_id FROM platform_announcement_reads ORDER BY user_id");
    expect(receipts.rows.map((row) => row.user_id)).toEqual([adminA, adminA]);
  });

  it("refuses a gerai member every announcement write, a forged receipt and a forged audit event", async () => {
    const live = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, publish: true, title: "T244 tayang" });
    const hidden = await savePlatformAnnouncement(appDb, superAdmin, draft);

    const member = (statement: ReturnType<typeof sql>) => pgCode(() => asMember(adminA, tenantA, (tx) => tx.execute(statement)));
    expect(await member(sql`INSERT INTO platform_announcements (title, body, category, created_by) VALUES ('x', 'y', 'LAINNYA', ${adminA})`)).toBe("42501");
    expect(await member(sql`UPDATE platform_announcements SET title = 'x'`)).toBe("42501");
    expect(await member(sql`DELETE FROM platform_announcements`)).toBe("42501");
    expect(await member(sql`UPDATE platform_announcement_reads SET read_at = now()`)).toBe("42501");
    // Setting the platform flag itself does not make a member a Super Admin.
    expect(await pgCode(() => savePlatformAnnouncement(appDb, adminA, draft))).toBe("AnnouncementDeniedError");
    expect(await pgCode(() => unpublishPlatformAnnouncement(appDb, adminA, live))).toBe("AnnouncementDeniedError");
    expect(await pgCode(() => savePlatformAnnouncement(appDb, suspendedSuper, draft))).toBe("AnnouncementDeniedError");
    const drafts = await asMember(adminA, tenantA, async (tx) => {
      await tx.execute(sql`SELECT set_config('app.platform_admin', 'true', true)`);
      return tx.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM platform_announcements WHERE published_at IS NULL`);
    });
    expect(drafts.rows[0].total).toBe(0);

    // Receipts: only one's own, only for a published announcement.
    expect(await member(sql`INSERT INTO platform_announcement_reads (user_id, announcement_id) VALUES (${operatorA}, ${live})`)).toBe("42501");
    expect(await member(sql`INSERT INTO platform_announcement_reads (user_id, announcement_id) VALUES (${adminA}, ${hidden})`)).toBe("42501");
    expect(await asMember(adminA, tenantA, (tx, context) => markAnnouncementsRead(tx, context.userId, [hidden]))).toBe(0);
    // A member cannot forge the audit event the functions write.
    expect(await member(sql`INSERT INTO audit_events (actor_id, actor_role, action, target_type, target_id, outcome)
      VALUES (${adminA}, 'SUPER_ADMIN', 'ANNOUNCEMENT_PUBLISHED', 'PLATFORM', ${live}, 'SUCCESS')`)).toBe("42501");
    const count = await adminPool.query("SELECT count(*)::int AS total FROM platform_announcements");
    expect(count.rows[0].total).toBe(2);
  });

  it("audits publish, edit and unpublish; unpublishing hides the announcement and republishing shows it again", async () => {
    const id = await savePlatformAnnouncement(appDb, superAdmin, draft);
    await savePlatformAnnouncement(appDb, superAdmin, { ...draft, id, publish: true, title: "T244 tayang" });
    const { rows: [before] } = await adminPool.query("SELECT published_at FROM platform_announcements WHERE id = $1", [id]);
    await savePlatformAnnouncement(appDb, superAdmin, { ...draft, id, pinned: true, publish: true, title: "T244 tayang diubah" });
    const { rows: [after] } = await adminPool.query("SELECT published_at, pinned, title FROM platform_announcements WHERE id = $1", [id]);
    expect(after).toMatchObject({ pinned: true, title: "T244 tayang diubah" });
    expect(after.published_at.toISOString()).toBe(before.published_at.toISOString());

    expect(await asMember(operatorA, tenantA, (tx, context) => countUnreadAnnouncements(tx, context.userId))).toBe(1);
    await unpublishPlatformAnnouncement(appDb, superAdmin, id);
    await unpublishPlatformAnnouncement(appDb, superAdmin, id);
    expect(await asMember(operatorA, tenantA, (tx, context) => listTenantAnnouncements(tx, context.userId))).toEqual([]);
    expect(await asMember(operatorA, tenantA, (tx, context) => countUnreadAnnouncements(tx, context.userId))).toBe(0);
    await savePlatformAnnouncement(appDb, superAdmin, { ...draft, id, publish: true });
    expect((await asMember(operatorA, tenantA, (tx, context) => listTenantAnnouncements(tx, context.userId))).map((row) => row.id)).toEqual([id]);

    const audit = await adminPool.query(
      "SELECT action, actor_role, target_type, target_id, tenant_id, outcome, metadata FROM audit_events WHERE actor_id = $1 ORDER BY created_at, action",
      [superAdmin],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "ANNOUNCEMENT_SAVED",
      "ANNOUNCEMENT_PUBLISHED",
      "ANNOUNCEMENT_SAVED",
      "ANNOUNCEMENT_UNPUBLISHED",
      "ANNOUNCEMENT_PUBLISHED",
    ]);
    for (const row of audit.rows) {
      expect(row).toMatchObject({ actor_role: "SUPER_ADMIN", outcome: "SUCCESS", target_id: id, target_type: "PLATFORM", tenant_id: null });
      expect(JSON.stringify(row.metadata)).not.toContain("Isi draf");
    }
  });

  it("refuses invalid content at the database and an unknown id", async () => {
    expect(await pgCode(() => savePlatformAnnouncement(appDb, superAdmin, { ...draft, title: "x".repeat(121) }))).toBe("AnnouncementStateError");
    expect(await pgCode(() => savePlatformAnnouncement(appDb, superAdmin, { ...draft, body: "a\u0007b" }))).toBe("AnnouncementStateError");
    expect(await pgCode(() => savePlatformAnnouncement(appDb, superAdmin, { ...draft, category: "RAHASIA" as never }))).toBe("AnnouncementStateError");
    const missing = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, id: "00000000-0000-4000-8000-000000000244" }).catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(AnnouncementStateError);
    expect((missing as AnnouncementStateError).reason).toBe("not-found");
    // Line breaks survive; the body is text.
    const id = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, body: "Baris satu\nBaris dua", publish: true });
    const [row] = await asMember(adminA, tenantA, (tx, context) => listTenantAnnouncements(tx, context.userId));
    expect(row).toMatchObject({ body: "Baris satu\nBaris dua", id });
  });
});

describe("Info terbaru Server Actions (T-244)", () => {
  it("saves, publishes and unpublishes only for an authorized Admin platform, validating the form", async () => {
    const { saveAnnouncement, unpublishAnnouncement } = await import("@/app/platform/info/actions");
    const form = (fields: Record<string, string>) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return data;
    };

    const invalid = await saveAnnouncement({}, form({ body: "", category: "", intent: "publish", title: "" }));
    expect(invalid.outcome).toBe("invalid");
    expect(Object.keys(invalid.errors ?? {}).sort()).toEqual(["body", "category", "title"]);

    const published = await saveAnnouncement({}, form({ body: "Isi\r\nbaris dua", category: "JADWAL", intent: "publish", pinned: "on", title: "  T244   aksi  " }));
    expect(published.outcome).toBe("published");
    expect(revalidatePath).toHaveBeenCalledWith("/platform/info");
    const { rows: [row] } = await adminPool.query("SELECT id, title, body, pinned, published_at FROM platform_announcements");
    expect(row).toMatchObject({ body: "Isi\nbaris dua", pinned: true, title: "T244 aksi" });
    expect(row.published_at).not.toBeNull();

    expect((await unpublishAnnouncement({}, form({ id: row.id }))).outcome).toBe("unpublished");
    expect((await adminPool.query("SELECT published_at FROM platform_announcements")).rows[0].published_at).toBeNull();
    expect((await unpublishAnnouncement({}, form({ id: "bukan-uuid" }))).outcome).toBe("invalid");

    principal.platform = { status: "forbidden", userId: adminA };
    expect((await saveAnnouncement({}, form({ body: "x", category: "LAINNYA", intent: "draft", title: "x" }))).outcome).toBe("denied");
    expect((await unpublishAnnouncement({}, form({ id: row.id }))).outcome).toBe("denied");
    expect((await adminPool.query("SELECT count(*)::int AS total FROM platform_announcements")).rows[0].total).toBe(1);
  });

  it("marks what a member viewed as read, for that member only, and ignores junk ids", async () => {
    const { markAnnouncementsReadAction } = await import("@/app/app/info/actions");
    const id = await savePlatformAnnouncement(appDb, superAdmin, { ...draft, publish: true });
    principal.tenant = { scope: "tenant", userId: operatorA, tenantId: tenantA, role: "OPERATOR", tenantStatus: "ACTIVE" };
    expect(await markAnnouncementsReadAction("x")).toEqual({ marked: 0 });
    expect(await markAnnouncementsReadAction(["x", 1])).toEqual({ marked: 0 });
    expect(await markAnnouncementsReadAction([id, id])).toEqual({ marked: 1 });
    expect(revalidatePath).toHaveBeenCalledWith("/app", "layout");
    expect(await markAnnouncementsReadAction([id])).toEqual({ marked: 0 });
    expect(await asMember(operatorA, tenantA, (tx, context) => countUnreadAnnouncements(tx, context.userId))).toBe(0);
    expect(await asMember(adminA, tenantA, (tx, context) => countUnreadAnnouncements(tx, context.userId))).toBe(1);
    // A gerai awaiting approval reads its info too.
    principal.tenant = { scope: "tenant", userId: pendingAdmin, tenantId: tenantPending, role: "TENANT_ADMIN", tenantStatus: "PROVISIONING" };
    expect(await markAnnouncementsReadAction([id])).toEqual({ marked: 1 });
  });
});

describe("Info terbaru presentation (T-244)", () => {
  const announcement = (overrides: Partial<TenantAnnouncement>): TenantAnnouncement => ({
    body: "Isi singkat.",
    category: "FITUR_BARU",
    id: "00000000-0000-4000-8000-000000000001",
    pinned: false,
    publishedAt: new Date("2026-09-26T02:00:00.000Z"),
    read: false,
    title: "Judul",
    ...overrides,
  });

  it("renders the body as escaped text with its line breaks, never as HTML", () => {
    const html = renderToStaticMarkup(createElement(AnnouncementFeed, {
      rows: [announcement({ body: "<script>alert(1)</script>\n**tebal**", title: "<b>Judul</b>" })],
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Judul");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;\n**tebal**");
    expect(html).toContain("whitespace-pre-line");
    expect(html).toContain("Fitur baru");
    expect(html).toContain("26 Sep 2026");
    expect(html).toContain("WIB");
  });

  it("marks unread cards Baru, pinned cards Disematkan, and expands only a long body", () => {
    const long = "Baris panjang ".repeat(40);
    const html = renderToStaticMarkup(createElement(AnnouncementFeed, {
      rows: [
        announcement({ body: long, id: "00000000-0000-4000-8000-000000000002", pinned: true }),
        announcement({ id: "00000000-0000-4000-8000-000000000003", read: true }),
      ],
    }));
    expect(announcementIsLong(long)).toBe(true);
    expect(announcementIsLong("a\nb\nc\nd\ne")).toBe(true);
    expect(announcementIsLong("pendek")).toBe(false);
    expect(html.match(/>Baru</g)).toHaveLength(1);
    expect(html).toContain("Disematkan");
    expect(html.match(/Baca selengkapnya/g)).toHaveLength(1);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-new="true"');
    expect(html).toContain('data-new="false"');
  });

  it("parses the form: trims, folds CRLF, reads the pin and the intent", () => {
    const data = new FormData();
    data.set("title", " Judul ");
    data.set("body", "a\r\nb\t");
    data.set("category", "PEMELIHARAAN");
    data.set("pinned", "on");
    data.set("intent", "draft");
    expect(parseAnnouncementForm(data)).toEqual({
      input: { body: "a\nb", category: "PEMELIHARAAN", pinned: true, publish: false, title: "Judul" },
      ok: true,
    });
    data.set("title", "x".repeat(121));
    data.set("body", "x".repeat(2001));
    data.set("category", "RAHASIA");
    const refused = parseAnnouncementForm(data);
    expect(refused.ok).toBe(false);
    expect(Object.keys(refused.ok ? {} : refused.errors).sort()).toEqual(["body", "category", "title"]);
  });

  it("puts Info terbaru first and Dasbor second for both roles, and in the platform menu", () => {
    for (const role of ["TENANT_ADMIN", "OPERATOR"] as const) {
      const items = tenantCmsNavigation(role, "/app/info").flatMap((group) => group.items);
      expect(items.slice(0, 2).map((item) => [item.key, item.label, item.href])).toEqual([
        ["announcements", "Info terbaru", "/app/info"],
        ["dashboard", "Dasbor", "/app"],
      ]);
      expect(items.filter((item) => item.current).map((item) => item.label)).toEqual(["Info terbaru"]);
      expect(tenantCmsNavigation(role, "/app").flatMap((group) => group.items).filter((item) => item.current).map((item) => item.label)).toEqual(["Dasbor"]);
    }
    const platform = platformCmsNavigation("/platform/info").flatMap((group) => group.items);
    expect(platform.filter((item) => item.current).map((item) => [item.label, item.href])).toEqual([["Info terbaru", "/platform/info"]]);
  });
});
