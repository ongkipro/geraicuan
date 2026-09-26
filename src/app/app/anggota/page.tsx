import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { CircleAlert, LockKeyhole, UsersRound } from "lucide-react";

import { readAuditScenario, requireTenantAdmin } from "@/app/app/pengaturan/_components/settings-data";
import { SettingsFrame } from "@/app/app/pengaturan/_components/settings-frame";
import {
  initials,
  memberAccess,
  orderMembers,
  ROLE_LABEL,
  summarizeMembers,
} from "@/app/app/pengaturan/_components/settings-logic";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { db } from "@/db/client";
import { listTenantMembers, type TenantMember } from "@/db/member-governance-repository";
import { withTenantContext } from "@/db/tenant-context";

import { InviteMemberCard } from "./_components/invite-member-card";
import { MemberAccessDialog } from "./_components/member-access-dialog";

export const metadata: Metadata = { title: "Anggota & akses", robots: { index: false } };

/** Development browser-audit fixture: the viewer plus a long list with suspended members. */
function auditMembers(viewerUserId: string, scenario: "members-inactive" | "members-populated" | "members-single-admin"): TenantMember[] {
  const updatedAt = new Date("2026-09-01T00:00:00.000Z");
  const viewer: TenantMember = {
    email: "admin.audit@example.test", id: "78000000-0000-4000-8000-000000000001", name: "Admin Audit Saat Ini",
    role: "TENANT_ADMIN", status: "ACTIVE", updatedAt, userId: viewerUserId,
  };
  if (scenario === "members-single-admin") return [viewer];
  return [viewer, ...Array.from({ length: scenario === "members-populated" ? 9 : 5 }, (_, index): TenantMember => {
    const sequence = String(index + 2).padStart(12, "0");
    return {
      email: index === 1 ? "operator-dengan-alamat-email-sangat-panjang-untuk-audit-tampilan@example.test" : `anggota.audit.${index + 2}@example.test`,
      id: `78000000-0000-4000-8000-${sequence}`,
      name: index === 0 ? "Admin Operasional Audit" : `Operator Audit ${String(index).padStart(2, "0")}`,
      role: index === 0 ? "TENANT_ADMIN" : "OPERATOR",
      status: index >= 3 && index % 3 === 0 || (scenario === "members-inactive" && index === 0) ? "SUSPENDED" : "ACTIVE",
      updatedAt,
      userId: `77000000-0000-4000-8000-${sequence}`,
    };
  })];
}

function SummaryTile({ hint, label, value }: { hint: string; label: string; value: number }) {
  return (
    <Card className="gap-1 px-(--card-spacing)">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{value} orang</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}

export default async function MembersPage() {
  // Member governance is not store setup: a gerai awaiting approval does not manage members yet.
  const principal = await requireTenantAdmin({});
  const scenario = await readAuditScenario("/app/anggota");
  if (scenario === "members-error") throw new Error("Intentional development-only member page failure.");
  if (scenario === "members-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const members = scenario === "members-inactive" || scenario === "members-populated" || scenario === "members-single-admin"
    ? auditMembers(principal.userId, scenario)
    : await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => listTenantMembers(tx, context));
  const summary = summarizeMembers(members);
  const ordered = orderMembers(members, principal.userId);

  return (
    <SettingsFrame
      header={(
        <PageHeader
          eyebrow="Pengelolaan"
          title="Anggota & akses"
        />
      )}
    >
      {summary.activeAdmins === 1 ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Hanya satu pemilik gerai aktif</AlertTitle>
          <AlertDescription>Undang pemilik gerai lain agar akses gerai tetap terjaga.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Ringkasan akses" className="grid gap-4 sm:grid-cols-3">
        <SummaryTile
          hint={summary.inactive === 0 ? "Semua akun aktif" : `${summary.active} aktif · ${summary.inactive} nonaktif`}
          label="Total anggota"
          value={summary.total}
        />
        <SummaryTile hint="Akses penuh & pengaturan" label="Pemilik gerai" value={summary.activeAdmins} />
        <SummaryTile hint="Buat kiriman & cetak resi" label="Operator" value={summary.activeOperators} />
      </section>

      <DataCard
        action={summary.activeAdmins === 1 ? (
          <Badge className="max-sm:hidden" variant="secondary"><LockKeyhole aria-hidden="true" data-icon="inline-start" />Admin terakhir dilindungi</Badge>
        ) : undefined}
        count={summary.total}
        flush
        title="Daftar anggota"
      >
        {ordered.length === 0 ? (
          <EmptyState
            description="Data anggota gerai belum tersedia. Muat ulang halaman sebelum mengelola akses."
            icon={UsersRound}
            title="Anggota tidak ditemukan"
          />
        ) : (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <div aria-hidden="true" className="hidden h-11 items-center border-b text-xs font-medium text-muted-foreground md:col-span-4 md:grid md:grid-cols-subgrid">
              <span className="px-6">Anggota</span>
              <span className="px-4">Peran</span>
              <span className="px-4">Status</span>
              <span className="px-6 text-right">Tindakan</span>
            </div>
            <ul aria-label="Daftar anggota" className="divide-y md:col-span-4 md:grid md:grid-cols-subgrid">
              {ordered.map((member) => {
                const access = memberAccess(member, principal.userId, summary.activeAdmins);
                return (
                  <li
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-4 md:col-span-4 md:grid-cols-subgrid md:gap-y-0 md:px-0"
                    key={member.id}
                  >
                    <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1 md:px-6">
                      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {initials(member.name)}
                      </span>
                      <div className="grid min-w-0 gap-0.5">
                        <p className="text-sm font-semibold wrap-anywhere">
                          {member.name}
                          {access.isCurrentUser ? <span className="font-normal text-muted-foreground"> (Anda)</span> : null}
                        </p>
                        <p className="text-xs text-muted-foreground wrap-anywhere">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:contents">
                      <span className="md:px-4"><Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge></span>
                      <span className="md:px-4">
                        {member.status === "ACTIVE"
                          ? <StatusBadge label="Aktif" tone="success" />
                          : <StatusBadge label="Nonaktif" tone="neutral" />}
                      </span>
                    </div>
                    <div className={access.manageable ? "text-right md:px-6" : "col-span-2 md:col-span-1 md:px-6 md:text-right"}>
                      <MemberAccessDialog
                        deactivateAttemptId={randomUUID()}
                        email={member.email}
                        manageable={access.manageable}
                        membershipId={member.id}
                        name={member.name}
                        note={access.note}
                        role={member.role}
                        roleAttemptId={randomUUID()}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DataCard>

      <InviteMemberCard attemptId={randomUUID()} />
    </SettingsFrame>
  );
}
