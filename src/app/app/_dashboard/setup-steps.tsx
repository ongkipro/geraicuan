import { CircleCheck, Circle, Clock } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type SetupProgress = { hasOwnConnection: boolean; hasPickupPoint: boolean; isTenantAdmin: boolean };

type Step = { href?: string; state: "done" | "todo" | "waiting"; title: string; detail: string };

/** PR-60 steps of a gerai awaiting approval (what the owner does now, what waits for the Super Admin). */
export function setupSteps(progress: SetupProgress): Step[] {
  return [
    { detail: "Email pemilik sudah terverifikasi.", state: "done", title: "Verifikasi email" },
    {
      detail: "Gerai yang mendaftar sendiri mengirim dengan akun Mengantar miliknya.",
      href: "/app/pengaturan/koneksi",
      state: progress.hasOwnConnection ? "done" : "todo",
      title: "Hubungkan akun Mengantar",
    },
    {
      detail: "Pilih alamat penjemputan dari akun Mengantar sebagai titik pickup utama.",
      href: "/app/pengaturan/pickup",
      state: progress.hasPickupPoint ? "done" : "todo",
      title: "Atur titik pickup",
    },
    { detail: "Kami kirim email ke pemilik begitu gerai disetujui atau ditolak.", state: "waiting", title: "Persetujuan Super Admin" },
  ];
}

const badge = {
  done: { label: "Selesai", tone: "success" },
  todo: { label: "Perlu dilengkapi", tone: "warning" },
  waiting: { label: "Menunggu", tone: "neutral" },
} as const;

/** The dashboard of a gerai awaiting approval: its setup steps instead of shipment figures. */
export function SetupSteps({ progress }: { progress: SetupProgress }) {
  const steps = setupSteps(progress);
  // One filled primary per page: the first step still to do; the others are outline.
  const primary = steps.find((step) => step.state === "todo" && step.href);
  return (
    <Card className="gap-4">
      <CardHeader><CardTitle><h2>Siapkan gerai</h2></CardTitle></CardHeader>
      <CardContent>
        <ol aria-label="Langkah menyiapkan gerai" className="-my-4 divide-y">
          {steps.map((step, index) => {
            const Icon = step.state === "done" ? CircleCheck : step.state === "waiting" ? Clock : Circle;
            return (
              <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4" key={step.title}>
                <Icon aria-hidden="true" className={step.state === "done" ? "size-6 shrink-0 text-ok" : "size-6 shrink-0 text-muted-foreground"} />
                <div className="grid min-w-0 flex-1 basis-60 gap-1">
                  <h3 className="text-base font-semibold"><span className="sr-only">Langkah {index + 1}: </span>{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
                  <StatusBadge label={badge[step.state].label} tone={badge[step.state].tone} />
                  {step.href && step.state === "todo" && progress.isTenantAdmin ? (
                    <Button asChild className="max-sm:flex-1" variant={step === primary ? "default" : "outline"}>
                      <Link href={step.href}>{step.title}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
