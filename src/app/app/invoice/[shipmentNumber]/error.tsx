"use client";

import { CircleAlert, RotateCw } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function InvoiceError({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeader eyebrow="Pengiriman" title="Invoice" />
      <Alert role="alert" variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Invoice belum dapat dimuat</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>Coba lagi. Invoice yang sudah terbit tidak berubah dan tidak diterbitkan dua kali.</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={reset} type="button" variant="outline">
              <RotateCw aria-hidden="true" />
              Coba lagi
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/label">Buka daftar cetak resi</Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </>
  );
}
