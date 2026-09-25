import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { RegistrationReviewControls } from "@/app/platform/pendaftaran/registration-review-controls";
import { resolvePlatformAccess } from "@/app/platform/platform-access";
import { EmptyState } from "@/components/cms/empty-state";
import { ToneBadge } from "@/components/cms/shipment-status-badge";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { withPlatformContext } from "@/db/platform-context";
import { listRegistrationQueue } from "@/db/tenant-registration-repository";

export const metadata: Metadata = { robots: { index: false }, title: "Pendaftaran · GeraiCUAN" };
export const dynamic = "force-dynamic";

const registeredAtFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatWhatsapp(value: string | null) {
  if (!value) return "—";
  return value.replace(/^(\d{4})(\d{4})(\d+)$/, "$1 $2 $3");
}

/**
 * PR-61 / T-182: stores awaiting approval, oldest first, with what they
 * registered. Super Admin only: the layout, this page's platform context, the
 * action and the database function each check the role.
 */
export default async function RegistrationQueuePage() {
  const access = await resolvePlatformAccess();
  if (access.status !== "authorized") {
    redirect(`/login/super-admin?notice=${access.status === "anonymous" ? "session-required" : "access-unavailable"}`);
  }
  const queue = await withPlatformContext(db, access.principal.userId, listRegistrationQueue);

  return (
    <PageContainer>
      <PageHeader
        description="Tinjau gerai yang mendaftar sendiri sebelum dapat mengirim."
        eyebrow="Platform"
        title="Pendaftaran"
      />
      {queue.length === 0 ? (
        <EmptyState
          description="Pendaftaran baru muncul di sini setelah pemilik gerai mengisi formulir di app.geraicuan.com/daftar."
          icon={Inbox}
          title="Tidak ada pendaftaran yang menunggu"
        />
      ) : (
        <section aria-labelledby="registration-queue-title" className="grid gap-4">
          {/* T-206 reference: the queue heading carries its count; oldest first. */}
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold" id="registration-queue-title">Menunggu persetujuan</h2>
              <Badge variant="secondary"><span className="tabular-nums">{queue.length}</span> antrean</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Terlama di atas.</p>
          </div>
          {queue.map((entry) => (
            <Card aria-labelledby={`registration-${entry.tenantId}`} key={entry.tenantId} role="article">
              <CardHeader>
                <CardTitle id={`registration-${entry.tenantId}`}>{entry.storeName}</CardTitle>
                <CardDescription>Terdaftar {registeredAtFormatter.format(entry.registeredAt)} WIB</CardDescription>
                <CardAction>
                  <ToneBadge
                    label={entry.ownerEmailVerified ? "Email terverifikasi" : "Email belum terverifikasi"}
                    tone={entry.ownerEmailVerified ? "ok" : "warn"}
                  />
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-5">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Pemilik</dt>
                    <dd className="font-medium break-words">{entry.ownerName}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="font-medium break-all">{entry.ownerEmail}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">WhatsApp</dt>
                    <dd className="font-medium tabular-nums">{formatWhatsapp(entry.whatsapp)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Akun Mengantar</dt>
                    <dd className="font-medium">{entry.privateOnly ? "Wajib akun sendiri" : "Akun bawaan platform diizinkan"}</dd>
                  </div>
                </dl>
                <div className="border-t pt-4">
                  <RegistrationReviewControls
                    emailVerified={entry.ownerEmailVerified}
                    storeName={entry.storeName}
                    tenantId={entry.tenantId}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </PageContainer>
  );
}
