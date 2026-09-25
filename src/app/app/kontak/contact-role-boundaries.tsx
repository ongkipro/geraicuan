"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTACT_ROLE_DESCRIPTIONS, contactRoleLabel, type ContactRole } from "@/lib/contact-role-filter";

/** T-188: the loading and error boundaries shared by the Pengirim and Penerima lists. */
export function ContactRoleDirectoryLoading({ role }: { role: ContactRole }) {
  const label = contactRoleLabel(role);
  return (
    <PageContainer aria-busy="true">
      <PageHeader
        actions={<Skeleton className="h-11 w-32 md:h-8" />}
        description={CONTACT_ROLE_DESCRIPTIONS[role]}
        eyebrow="Data"
        title={label}
      />
      <div aria-label={`Memuat daftar ${label.toLowerCase()}`} className="grid gap-4" role="status">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Skeleton className="h-11 w-full max-w-80 md:h-11" />
          <Skeleton className="h-11 min-w-0 flex-1 md:h-9" />
        </div>
        <Skeleton className="h-5 w-40" />
        <div className="overflow-hidden rounded-md border">
          <Skeleton className="h-10 w-full rounded-none" />
          <div className="grid gap-3 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4" key={index}>
                <Skeleton className="h-5 w-full max-w-72" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>
        <span className="sr-only">Memuat {label.toLowerCase()}…</span>
      </div>
    </PageContainer>
  );
}

export function ContactRoleDirectoryError({ reset, role }: { reset: () => void; role: ContactRole }) {
  const alertRef = useRef<HTMLDivElement>(null);
  const label = contactRoleLabel(role);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  const retry = () => {
    reset();
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  return (
    <PageContainer>
      <PageHeader eyebrow="Data" title={label} />
      <Alert ref={alertRef} tabIndex={-1} variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Daftar {label.toLowerCase()} belum dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>Coba muat ulang halaman. Kontak tersimpan tidak berubah.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={retry} type="button">Coba lagi</Button>
            <Button asChild className="min-h-11" variant="outline"><Link href="/app">Kembali ke ringkasan</Link></Button>
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
