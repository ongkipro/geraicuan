import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { CircleAlert, Users } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { InviteMemberForm, InviteMemberHeaderAction, MemberControls } from "@/app/app/anggota/member-governance-forms";
import { DefinitionGrid } from "@/components/cms/detail-section";
import { EmptyState } from "@/components/cms/empty-state";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listTenantMembers, type TenantMember } from "@/db/member-governance-repository";
import { withTenantContext } from "@/db/tenant-context";
import { CmsAuthorizationDeniedError, requireCmsScope } from "@/lib/cms-auth";
import { parseUiAuditScenarioForRoute, UI_AUDIT_HEADER } from "@/lib/ui-audit-scenario";

export const metadata: Metadata = {
  title: "Anggota tenant | GeraiCUAN",
  robots: { index: false },
};

const updatedAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});
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
      <PageHeader
        actions={<InviteMemberHeaderAction />}
        description="Tinjau siapa yang memiliki akses, lalu kelola peran atau nonaktifkan keanggotaan bila diperlukan."
        eyebrow="Pengaturan"
        title="Anggota & akses"
      />

      {activeAdminCount === 1 ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Hanya satu Tenant Admin aktif</AlertTitle>
          <AlertDescription>Admin terakhir tidak dapat diturunkan perannya atau dinonaktifkan. Undang Tenant Admin lain terlebih dahulu untuk menjaga akses tenant.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Ringkasan anggota tenant">
        <DefinitionGrid items={[
          { label: "Total anggota", value: members.length },
          { label: "Aktif", value: activeCount },
          { label: "Tenant Admin aktif", value: activeAdminCount },
          { label: "Nonaktif", value: members.length - activeCount },
        ]} />
      </section>

      <section aria-labelledby="tenant-members-title" className="grid gap-4">
        <div>
          <h2 className="font-heading text-lg font-medium" id="tenant-members-title">Daftar anggota</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Anggota aktif ditampilkan lebih dulu. Buka kontrol hanya pada anggota yang ingin dikelola.</p>
        </div>
        {members.length === 0 ? (
          <EmptyState description="Data anggota tenant belum tersedia. Muat ulang halaman atau hubungi dukungan sebelum mengelola akses." icon={Users} title="Anggota tidak ditemukan" />
        ) : (
          <ul className="grid gap-3">
            {orderedMembers.map((member) => {
              const isCurrentUser = member.userId === principal.userId;
              const isLastActiveAdmin = member.status === "ACTIVE" && member.role === "TENANT_ADMIN" && activeAdminCount === 1;
              const roleLabel = member.role === "TENANT_ADMIN" ? "Tenant Admin" : "Operator";
              const statusLabel = member.status === "ACTIVE" ? "Aktif" : "Nonaktif";
              return (
                <li key={member.id}>
                  <Card className="shadow-none" size="sm">
                    <CardHeader>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <CardTitle id={`member-name-${member.id}`}>{member.name}{isCurrentUser ? " (Anda)" : ""}</CardTitle>
                          <CardDescription className="mt-0.5 [overflow-wrap:anywhere]" title={member.email}>{member.email}</CardDescription>
                        </div>
                        <div aria-label={`Peran ${roleLabel}; status ${statusLabel}`} className="flex flex-wrap gap-2">
                          <Badge variant="outline">{roleLabel}</Badge>
                          <Badge variant={member.status === "ACTIVE" ? "secondary" : "outline"}>{statusLabel}</Badge>
                          {isLastActiveAdmin ? <Badge variant="destructive">Admin terakhir</Badge> : null}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Diperbarui {updatedAtFormatter.format(member.updatedAt)} WIB</p>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <details className="group overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 marker:content-none" id="invite-member-title">
          <span><span className="block font-heading font-medium">Undang anggota</span><span className="mt-0.5 block text-sm text-muted-foreground">Tambahkan akun GeraiCUAN yang sudah aktif.</span></span>
          <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t p-4"><InviteMemberForm attemptId={randomUUID()} /></div>
      </details>
    </PageContainer>
  );
}
