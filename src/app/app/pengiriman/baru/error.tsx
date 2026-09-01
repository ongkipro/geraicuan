"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/cms/page-container";

export default function NewShipmentError({ reset }: { error: Error; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return (
    <PageContainer width="form">
      <section aria-labelledby="shipment-draft-error-heading" className="grid gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5" role="alert">
        <div>
          <h1 className="outline-none focus-visible:ring-2 focus-visible:ring-ring" id="shipment-draft-error-heading" ref={headingRef} tabIndex={-1}>Formulir draf tidak dapat dimuat</h1>
          <p className="mt-2 text-sm text-muted-foreground">Coba muat kembali. Belum ada draf atau permintaan penyedia yang dibuat.</p>
        </div>
        <Button className="min-h-11 justify-self-start sm:min-h-9" onClick={reset} variant="outline">Coba lagi</Button>
      </section>
    </PageContainer>
  );
}
