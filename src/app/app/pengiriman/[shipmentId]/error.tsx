"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import { RetryButton } from "@/app/app/_dashboard/retry-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { BackToQueue } from "./detail-parts";

/** Detail read failure: cause + retry; the shell and the way back stay usable (spec 10 §6). */
export default function ShipmentDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4 outline-none" ref={ref} tabIndex={-1}>
      <BackToQueue href="/app/pengiriman" />
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Detail kiriman tidak dapat dimuat</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>Terjadi gangguan saat membaca data kiriman. Coba lagi; bila tetap gagal, buka dari histori kiriman.</p>
          <div><RetryButton onRetry={reset} /></div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
