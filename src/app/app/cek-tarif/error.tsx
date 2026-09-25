"use client";

import { useEffect, useRef } from "react";
import { PageContainer } from "@/components/cms/page-container";
import { PageHeader } from "@/components/cms/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function QuickRateError({ reset }: { reset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <PageContainer><PageHeader eyebrow="Cek" title="Cek tarif" /><Alert ref={ref} tabIndex={-1} variant="destructive"><AlertTitle>Cek tarif belum dapat dimuat</AlertTitle><AlertDescription className="grid gap-3"><p>Coba muat ulang untuk mengambil daftar outlet.</p><Button className="min-h-11 w-fit" onClick={reset} type="button">Coba lagi</Button></AlertDescription></Alert></PageContainer>;
}
