import { CheckCircle2, Circle, Clock } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TENANT_APPROVAL_COPY } from "@/lib/tenant-approval";

export type StoreSetupProgress = {
  hasOwnConnection: boolean;
  hasPickupPoint: boolean;
  isTenantAdmin: boolean;
};

type Step = {
  description: string;
  href?: string;
  linkLabel?: string;
  state: "done" | "todo" | "waiting";
  title: string;
};

const stateBadge = {
  done: { label: "Selesai", variant: "secondary" as const },
  todo: { label: "Perlu dilengkapi", variant: "outline" as const },
  waiting: { label: "Menunggu", variant: "outline" as const },
};

/**
 * PR-60: the dashboard of a store awaiting approval. It lists what the owner can
 * do now and what waits for the Super Admin, instead of empty shipment figures.
 */
export function StoreSetupOverview({
  progress,
  refused,
}: {
  progress: StoreSetupProgress;
  refused: boolean;
}) {
  const steps: Step[] = [
    {
      description: "Email pemilik sudah terverifikasi, sehingga Anda dapat masuk.",
      state: "done",
      title: "Verifikasi email",
    },
    {
      description:
        "Gerai yang mendaftar sendiri mengirim dengan akun Mengantar miliknya. Simpan API key akun tersebut.",
      href: "/app/pengaturan/koneksi",
      linkLabel: "Hubungkan akun Mengantar",
      state: progress.hasOwnConnection ? "done" : "todo",
      title: "Hubungkan akun Mengantar",
    },
    {
      description: "Pilih alamat penjemputan dari akun Mengantar Anda sebagai titik pickup utama.",
      href: "/app/pengaturan/pickup",
      linkLabel: "Atur titik pickup",
      state: progress.hasPickupPoint ? "done" : "todo",
      title: "Atur titik pickup",
    },
    {
      description:
        "Super Admin memeriksa pendaftaran gerai. Kami kirim email ke alamat pemilik begitu gerai disetujui atau ditolak.",
      state: "waiting",
      title: "Persetujuan Super Admin",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        description="Siapkan gerai sambil menunggu persetujuan. Pengiriman terbuka setelah gerai disetujui."
        eyebrow="Dasbor"
        title="Siapkan gerai Anda"
      />
      {refused ? (
        <Alert data-testid="tenant-approval-refused" role="status">
          <Clock aria-hidden="true" />
          <AlertTitle>Pengiriman belum terbuka</AlertTitle>
          <AlertDescription>{TENANT_APPROVAL_COPY.refused}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <ol aria-label="Langkah menyiapkan gerai" className="grid gap-0 divide-y">
            {steps.map((step, index) => (
              <li className="flex flex-wrap items-start gap-x-4 gap-y-3 py-5 first:pt-0 last:pb-0" key={step.title}>
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground">
                  {step.state === "done" ? (
                    <CheckCircle2 className="size-6 text-[var(--ok)]" />
                  ) : step.state === "waiting" ? (
                    <Clock className="size-6" />
                  ) : (
                    <Circle className="size-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1 basis-60 space-y-1">
                  <h2 className="text-base font-semibold leading-6">
                    <span className="sr-only">Langkah {index + 1}: </span>
                    {step.title}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
                  <Badge variant={stateBadge[step.state].variant}>{stateBadge[step.state].label}</Badge>
                  {step.href && step.state !== "done" && progress.isTenantAdmin ? (
                    <Button asChild className="min-h-11 max-sm:w-full">
                      <Link href={step.href}>{step.linkLabel}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
