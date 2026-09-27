import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { CircleAlert, LockKeyhole, UsersRound } from "lucide-react";

import { readAuditScenario, requireTenantAdmin } from "@/app/app/pengaturan/_components/settings-data";
import { SettingsFrame } from "@/app/app/pengaturan/_components/settings-frame";
import { memberAccess, orderMembers, summarizeMembers } from "@/app/app/pengaturan/_components/settings-logic";
import { DataCard } from "@/components/app/data-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { listTenantMembers, type TenantMember } from "@/db/member-governance-repository";
import { withTenantContext } from "@/db/tenant-context";

import { InviteMemberDialog } from "./_components/invite-member-card";
import { MemberRow, MemberStatStrip } from "./_components/member-list";

export const metadata: Metadata = { title: "Anggota & akses · Pengaturan", robots: { index: false } };

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
    <SettingsFrame header={<PageHeader title="Pengaturan" />}>
      <InviteMemberDialog attemptId={randomUUID()}>
        <h2 className="text-lg font-bold text-foreground">Anggota &amp; akses</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Akun yang bisa masuk ke gerai ini. Pemilik gerai memegang semua akses, termasuk pengaturan dan anggota;
          Operator membuat kiriman dan mencetak resi.
        </p>
      </InviteMemberDialog>

      <MemberStatStrip summary={summary} />

      {summary.activeAdmins === 1 ? (
        <Alert role="status">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Hanya satu pemilik gerai aktif</AlertTitle>
          <AlertDescription>Undang pemilik gerai lain agar akses gerai tetap terjaga.</AlertDescription>
        </Alert>
      ) : null}

      <DataCard
        action={summary.activeAdmins === 1 ? (
          <Badge className="max-sm:hidden" variant="secondary"><LockKeyhole aria-hidden="true" data-icon="inline-start" />Pemilik gerai terakhir dilindungi</Badge>
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
              <span className="px-3">Peran</span>
              <span className="px-3">Status</span>
              <span className="px-6 text-right">Tindakan</span>
            </div>
            <ul aria-label="Daftar anggota" className="divide-y md:col-span-4 md:grid md:grid-cols-subgrid">
              {ordered.map((member) => (
                <MemberRow
                  access={memberAccess(member, principal.userId, summary.activeAdmins)}
                  deactivateAttemptId={randomUUID()}
                  key={member.id}
                  member={member}
                  roleAttemptId={randomUUID()}
                />
              ))}
            </ul>
          </div>
        )}
      </DataCard>
    </SettingsFrame>
  );
}
