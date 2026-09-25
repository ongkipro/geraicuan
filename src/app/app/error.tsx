"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { RetryButton } from "@/app/app/_dashboard/retry-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Error boundary of the tenant area. It also catches a child route without its own error.tsx,
 * so it names no page; the shell (menu, top bar) stays usable around it.
 */
export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="outline-none" ref={ref} tabIndex={-1}>
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Halaman tidak dapat dimuat</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>Terjadi gangguan saat membaca data. Coba lagi; bila tetap gagal, muat ulang halaman.</p>
          <div><RetryButton onRetry={reset} /></div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
