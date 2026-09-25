"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Route error with retry (spec 10 §6): the page keeps its header so the operator knows where they
 * are; the shell around it stays usable. Also used by Cek resi and Cek tarif.
 */
export function ContactRouteError({ eyebrow = "Data", reset, title }: { eyebrow?: string; reset: () => void; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="outline-none" ref={ref} tabIndex={-1}>
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{title} tidak dapat dimuat</AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>Terjadi gangguan saat membaca data. Coba lagi; bila tetap gagal, muat ulang halaman.</p>
            <div>
              <Button
                disabled={pending}
                onClick={() => startTransition(() => { router.refresh(); reset(); })}
                type="button"
                variant="outline"
              >
                <RotateCw aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : undefined} />
                {pending ? "Memuat ulang…" : "Coba lagi"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
}
