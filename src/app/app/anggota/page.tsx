import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { CircleAlert, LockKeyhole, Users } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { InviteMemberForm, MemberControls } from "@/app/app/anggota/member-governance-forms";
import { EmptyState } from "@/components/cms/empty-state";
import {
  administrationNavigation,
  SETTINGS_INDEX_HREF,
} from "@/app/app/pengaturan/settings-nav";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { SettingsCard, SettingsLayout } from "@/components/cms/settings-layout";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db/client";
import { listTenantMembers, type TenantMember } from "@/db/member-governance-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = {
  title: "Anggota & akses · GeraiCUAN",
  robots: { index: false },
};

const updatedAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

/** Two initials from the stored display name, e.g. "Ayu Admin" → "AA". */
function initials(name: string) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase("id-ID"));
  return letters.join("") || "?";
}

const auditUpdatedAt = new Date("2026-09-01T00:00:00.000Z");

function buildMemberAuditFixture(currentUserId: string, scenario: "members-inactive" | "members-populated" | "members-single-admin"): TenantMember[] {
  const currentAdmin: TenantMember = {
    id: "78000000-0000-4000-8000-000000000001",
    userId: currentUserId,
    name: "Admin Audit Saat Ini",
    email: "admin.audit@example.test",
    role: "TENANT_ADMIN",
    status: "ACTIVE",
    updatedAt: auditUpdatedAt,
  };
  if (scenario === "members-single-admin") return [currentAdmin];

  const members: TenantMember[] = [
    currentAdmin,
    {
      id: "78000000-0000-4000-8000-000000000002",
      userId: "77000000-0000-4000-8000-000000000002",
      name: "Admin Operasional Audit",
      email: "admin.operasional.audit@example.test",
      role: "TENANT_ADMIN",
      status: scenario === "members-inactive" ? "SUSPENDED" : "ACTIVE",
      updatedAt: auditUpdatedAt,
    },
    {
      id: "78000000-0000-4000-8000-000000000003",
      userId: "77000000-0000-4000-8000-000000000003",
      name: "Operator Nama Panjang untuk Audit Responsif",
      email: "operator-dengan-alamat-email-sangat-panjang-untuk-audit-tampilan@example.test",
      role: "OPERATOR",
      status: "ACTIVE",
      updatedAt: auditUpdatedAt,
    },
  ];
  const extraCount = scenario === "members-populated" ? 7 : 3;
  for (let index = 0; index < extraCount; index += 1) {
    const sequence = String(index + 4).padStart(12, "0");
    members.push({
      id: `78000000-0000-4000-8000-${sequence}`,
      userId: `77000000-0000-4000-8000-${sequence}`,
      name: `Operator Audit ${String(index + 1).padStart(2, "0")}`,
      email: `operator.audit.${index + 1}@example.test`,
      role: "OPERATOR",
      status: index >= extraCount - 2 ? "SUSPENDED" : "ACTIVE",
      updatedAt: auditUpdatedAt,
    });
  }
  return members;
}

export default async function TenantMembersPage() {
  let principal;
  try {
    principal = await requireCmsScope("tenant");
  } catch (error) {
    if (error instanceof CmsAuthorizationDeniedError) redirect("/login/tenant");
    throw error;
  }
  if (principal.scope !== "tenant") redirect("/login/tenant");
  if (principal.role !== "TENANT_ADMIN") redirect("/app");

  const auditScenario = process.env.NODE_ENV === "development"
    ? parseUiAuditScenarioForRoute((await headers()).get(UI_AUDIT_HEADER), "/app/anggota")
    : null;
  if (auditScenario === "members-error") throw new Error("Intentional development-only member governance page failure.");
  if (auditScenario === "members-stream") await new Promise((resolve) => setTimeout(resolve, 1_200));

  const members = auditScenario === "members-single-admin" || auditScenario === "members-populated" || auditScenario === "members-inactive"
    ? buildMemberAuditFixture(principal.userId, auditScenario)
    : await withTenantContext(db, principal.userId, principal.tenantId, (tx, context) => listTenantMembers(tx, context));
  const activeCount = members.filter((member) => member.status === "ACTIVE").length;
  const activeAdminCount = members.filter((member) => member.status === "ACTIVE" && member.role === "TENANT_ADMIN").length;
  const orderedMembers = [...members].sort((left, right) => {
    if (left.status !== right.status) return left.status === "ACTIVE" ? -1 : 1;
    if ((left.userId === principal.userId) !== (right.userId === principal.userId)) return left.userId === principal.userId ? -1 : 1;
    if (left.role !== right.role) return left.role === "TENANT_ADMIN" ? -1 : 1;
    return left.name.localeCompare(right.name, "id-ID") || left.id.localeCompare(right.id);
  });

  return (
    <PageContainer>
      <SettingsLayout
        currentHref="/app/anggota"
        header={
          <PageHeader
            description="Undang anggota, ubah peran, dan nonaktifkan akses tenant."
            eyebrow="Pengelolaan"
            title="Anggota & akses"
          />
        }
        indexHref={SETTINGS_INDEX_HREF}
        items={administrationNavigation}
        navLabel="Menu pengaturan"
      >
        <div className="grid min-w-0 gap-6">
          {activeAdminCount === 1 ? (
            <Alert>
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Hanya satu Tenant Admin aktif</AlertTitle>
              <AlertDescription>Undang Tenant Admin lain agar akses tenant tetap terjaga.</AlertDescription>
            </Alert>
          ) : null}

          <SettingsCard
            id="member-summary-title"
            title="Ringkasan akses"
          >
            <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                ["Total anggota", members.length],
                ["Aktif", activeCount],
                ["Tenant Admin aktif", activeAdminCount],
                ["Nonaktif", members.length - activeCount],
              ].map(([label, value]) => (
                <div className="grid gap-1" key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </SettingsCard>

          <SettingsCard
            badge={activeAdminCount === 1 ? <Badge variant="outline"><LockKeyhole aria-hidden="true" />Admin terakhir dilindungi</Badge> : undefined}
            description="Anggota aktif ditampilkan lebih dulu."
            id="tenant-members-title"
            title="Daftar anggota"
          >
            {members.length === 0 ? (
              <EmptyState description="Data anggota tenant belum tersedia. Muat ulang halaman atau hubungi dukungan sebelum mengelola akses." icon={Users} title="Anggota tidak ditemukan" />
            ) : (
              <div className="min-w-0">
                <div aria-hidden="true" className="hidden h-10 items-center justify-between gap-4 border-b bg-muted px-4 text-xs font-medium text-muted-foreground sm:flex">
                  <span>Anggota</span>
                  <span>Peran &amp; status</span>
                </div>
                <ul aria-labelledby="tenant-members-title" className="divide-y">
                  {orderedMembers.map((member) => {
                    const isCurrentUser = member.userId === principal.userId;
                    const isLastActiveAdmin = member.status === "ACTIVE" && member.role === "TENANT_ADMIN" && activeAdminCount === 1;
                    const roleLabel = member.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator";
                    const statusLabel = member.status === "ACTIVE" ? "Aktif" : "Nonaktif";
                    return (
                      <li className="grid min-w-0 gap-3 px-4 py-4" key={member.id}>
                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          {/* T-206 reference: initials avatar beside name and email (round is allowed for avatars, spec 10 §2.3). */}
                          <div className="flex min-w-0 items-start gap-3">
                            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                              {initials(member.name)}
                            </span>
                            <div className="grid min-w-0 gap-0.5">
                              <p className="text-base font-semibold leading-6 [overflow-wrap:anywhere]" id={`member-name-${member.id}`}>{member.name}{isCurrentUser ? " (Anda)" : ""}</p>
                              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]" title={member.email}>{member.email}</p>
                              <p className="text-xs text-muted-foreground">Diperbarui {updatedAtFormatter.format(member.updatedAt)} WIB</p>
                            </div>
                          </div>
                          <div aria-label={`Peran ${roleLabel}; status ${statusLabel}`} className="flex shrink-0 flex-wrap gap-2 sm:justify-end" role="group">
                            <Badge variant="outline">{roleLabel}</Badge>
                            <ToneBadge label={statusLabel} tone={member.status === "ACTIVE" ? "ok" : "neutral"} />
                            {isLastActiveAdmin ? <Badge variant="outline"><LockKeyhole aria-hidden="true" />Admin terakhir</Badge> : null}
                          </div>
                        </div>
                        <MemberControls
                          deactivateAttemptId={randomUUID()}
                          isCurrentUser={isCurrentUser}
                          isLastActiveAdmin={isLastActiveAdmin}
                          membershipId={member.id}
                          name={member.name}
                          role={member.role}
                          roleAttemptId={randomUUID()}
                          status={member.status}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </SettingsCard>

          <InviteMemberForm attemptId={randomUUID()} />
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
