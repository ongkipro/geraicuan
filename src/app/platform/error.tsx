"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function PlatformError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <PageContainer width="wide">
      <PageHeader description="Pulihkan workspace tanpa menampilkan detail internal atau data terlindungi." eyebrow="Operasi platform" title="Workspace platform" />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Pemantauan tidak dapat dimuat</AlertTitle>
        <AlertDescription className="space-y-3"><p>Terjadi gangguan saat membaca data operasional. Tidak ada detail internal yang ditampilkan.</p><Button className="min-h-11" onClick={reset} ref={retryRef} type="button" variant="outline">Coba lagi</Button></AlertDescription>
      </Alert>
    </PageContainer>
  );
}
