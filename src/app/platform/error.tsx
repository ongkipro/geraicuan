"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { RetryButton } from "./_components/retry-button";

/**
 * Error boundary of the platform area (also for child routes without their own); the menu and
 * top bar stay usable around it. The error itself is never shown: it may carry internals.
 */
export default function PlatformError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="outline-none" ref={ref} tabIndex={-1}>
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Halaman platform tidak dapat dimuat</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>Terjadi gangguan saat membaca data platform. Coba lagi; bila tetap gagal, muat ulang halaman.</p>
          <div><RetryButton onRetry={reset} /></div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
