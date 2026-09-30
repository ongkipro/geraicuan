import { CircleCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { SectionHelp } from "@/components/app/help-hint";
import { PageHeader } from "@/components/app/page-header";
import { RecordItem, RecordList } from "@/components/app/record-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db/client";
import { withPlatformContext } from "@/db/platform-context";
import { listRegistrationDecisions, readPlatformClock, type AuditRow } from "@/db/platform-monitoring-repository";
import { listRegistrationQueue, type RegistrationQueueEntry } from "@/db/tenant-registration-repository";
import { auditActorLabel } from "@/lib/labels/audit";

import { formatAgo, formatWib } from "../_components/platform-format";
import { DESKTOP_ONLY, FLUSH_TABLE, PHONE_ONLY, PlatformCard, RegionError, TimeCell } from "../_components/platform-ui";
import { requirePlatformPrincipal } from "../_components/platform-view";
import { RegistrationReview } from "./_components/registration-review";

export const metadata: Metadata = { robots: { index: false }, title: "Pendaftaran" };
export const dynamic = "force-dynamic";

const HISTORY_SIZE = 10;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toLocaleUpperCase("id-ID") || "?";
}

function formatWhatsapp(value: string | null) {
  return value ? value.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3") : "—";
}

function RegistrationCard({ entry, now }: { entry: RegistrationQueueEntry; now: Date }) {
  const waiting = formatAgo(entry.registeredAt, now);
  const titleId = `pendaftaran-${entry.tenantId}`;
  return (
    <Card aria-labelledby={titleId} className="gap-0" role="article">
      <div className="flex flex-col gap-3 border-b px-(--card-spacing) pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground">{initials(entry.storeName)}</span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold" id={titleId}>{entry.storeName}</h3>
            <p className="text-xs text-muted-foreground">Terdaftar {formatWib(entry.registeredAt)}{waiting ? ` · ${waiting}` : ""}</p>
          </div>
        </div>
        <StatusBadge
          icon={entry.ownerEmailVerified ? CircleCheck : undefined}
          label={entry.ownerEmailVerified ? "Email terverifikasi" : "Email belum terverifikasi"}
          tone={entry.ownerEmailVerified ? "success" : "warning"}
        />
      </div>
      <dl className="grid gap-x-6 gap-y-3 border-b px-(--card-spacing) py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Pemilik</dt><dd className="font-semibold break-words">{entry.ownerName}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Email</dt><dd className="font-semibold break-all">{entry.ownerEmail}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">WhatsApp</dt><dd className="font-semibold tabular-nums">{formatWhatsapp(entry.whatsapp)}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-muted-foreground">Akun Mengantar</dt><dd className="font-semibold">{entry.privateOnly ? "Wajib akun sendiri" : "Bawaan platform diizinkan"}</dd></div>
      </dl>
      <div className="px-(--card-spacing) pt-4">
        <RegistrationReview emailVerified={entry.ownerEmailVerified} storeName={entry.storeName} tenantId={entry.tenantId} />
      </div>
    </Card>
  );
}

function History({ now, rows }: { now: Date; rows: AuditRow[] | null }) {
  if (!rows) return <RegionError title="Riwayat keputusan" />;
  const decision = (row: AuditRow) =>
    row.action === "TENANT_REGISTRATION_APPROVED"
      ? <StatusBadge label="Disetujui" tone="success" />
      : <StatusBadge label="Ditolak" tone="danger" />;
  return (
    <PlatformCard count={rows.length} flush={rows.length > 0} id="riwayat-pendaftaran" title="Riwayat keputusan">
      {rows.length ? (
        <>
          <Table className={`${FLUSH_TABLE} ${DESKTOP_ONLY}`}>
            <TableCaption className="sr-only">Keputusan pendaftaran terbaru</TableCaption>
            <TableHeader>
              <TableRow><TableHead>Gerai</TableHead><TableHead>Diproses</TableHead><TableHead>Keputusan</TableHead><TableHead>Petugas</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold whitespace-normal">{row.tenantName ?? "Gerai terhapus"}</TableCell>
                  <TableCell><TimeCell instant={row.createdAt} now={now} /></TableCell>
                  <TableCell>{decision(row)}</TableCell>
                  <TableCell>{auditActorLabel(row.actorRole)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className={PHONE_ONLY}>
            <RecordList label="Riwayat keputusan">
              {rows.map((row) => (
                <RecordItem key={row.id} status={decision(row)} subtitle={auditActorLabel(row.actorRole)} time={formatWib(row.createdAt)} title={row.tenantName ?? "Gerai terhapus"} />
              ))}
            </RecordList>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Belum ada pendaftaran yang diputuskan dalam setahun terakhir.</p>
      )}
    </PlatformCard>
  );
}

/**
 * PR-61 / T-182: gerai awaiting approval, oldest first, then the latest decisions. Super Admin
 * only: the layout, this page's platform context, the action and the database function each check.
 */
export default async function RegistrationQueuePage() {
  const principal = await requirePlatformPrincipal();
  const { history, now, queue } = await withPlatformContext(db, principal.userId, async (tx) => {
    const now = await readPlatformClock(tx);
    const queue = await listRegistrationQueue(tx);
    let history: AuditRow[] | null = null;
    try {
      history = await listRegistrationDecisions(tx, HISTORY_SIZE);
    } catch {
      history = null;
    }
    return { history, now, queue };
  });

  return (
    <>
      <PageHeader eyebrow="Platform" title="Pendaftaran" />
      <section aria-labelledby="menunggu-persetujuan" className="flex flex-col gap-4">
        {/* T-257: the §4.3 header on the ground — title 18/700, count, "?" at the right. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg leading-snug font-bold" id="menunggu-persetujuan">Menunggu persetujuan</h2>
            <Badge className="tabular-nums" data-metric-id="PLT-REG-QUEUE" variant="secondary">{queue.length}</Badge>
          </div>
          <SectionHelp label="Cara menyetujui pendaftaran">
            <p>Pendaftaran terlama tampil paling atas. Setujui gerai hanya setelah pemilik memverifikasi email; gerai langsung dapat membuat dan menerbitkan kiriman.</p>
            <p>Tolak pendaftaran mengarsipkan gerai dan mengirim alasan Anda ke email pemilik. Kedua keputusan tercatat di Audit.</p>
          </SectionHelp>
        </div>
        {queue.length ? (
          queue.map((entry) => <RegistrationCard entry={entry} key={entry.tenantId} now={now} />)
        ) : (
          <Card>
            <EmptyState description="Pendaftaran baru muncul di sini setelah pemilik gerai mengisi formulir pendaftaran." icon={Inbox} title="Tidak ada pendaftaran yang menunggu" />
          </Card>
        )}
      </section>
      <History now={now} rows={history} />
    </>
  );
}
