"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function NewContactError({ reset }: { reset: () => void }) {
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alertRef.current?.focus();
  }, []);

  const retry = () => {
    reset();
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  return (
    <PageContainer width="form">
      <PageHeader eyebrow="Data" title="Buat kontak" />
      <Alert ref={alertRef} tabIndex={-1} variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Formulir kontak belum dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>Coba muat ulang halaman. Kontak baru belum dibuat.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={retry} type="button">Coba lagi</Button>
            <Button asChild className="min-h-11" variant="outline"><Link href="/app/kontak">Kembali ke direktori</Link></Button>
          </div>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}
