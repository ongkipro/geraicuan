"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DATA_STALE_AFTER_MS,
  isDataStale,
} from "@/lib/data-freshness";

type DataFreshnessControlProps = {
  formattedGeneratedAt: string;
  generatedAtIso: string;
  initiallyStale: boolean;
};

export function DataFreshnessControl({
  formattedGeneratedAt,
  generatedAtIso,
  initiallyStale,
}: DataFreshnessControlProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stale, setStale] = useState(initiallyStale);
  const [announcement, setAnnouncement] = useState("");
  const refreshButton = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    const generatedAt = new Date(generatedAtIso);
    const update = () => setStale(isDataStale(generatedAt, new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [generatedAtIso]);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setAnnouncement("Data selesai diperbarui.");
      refreshButton.current?.focus();
    }
    wasPending.current = pending;
  }, [pending]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>
          {stale ? "Belum diperbarui sejak" : "Diperbarui"}{" "}
          <time dateTime={generatedAtIso}>{formattedGeneratedAt}</time>
        </span>
        {stale ? <Badge variant="secondary">Perlu diperbarui</Badge> : null}
      </div>
      <Button
        className="min-h-11 md:min-h-8"
        disabled={pending}
        onClick={() => {
          setAnnouncement("Memperbarui data…");
          startTransition(() => router.refresh());
        }}
      size="sm"
      ref={refreshButton}
      type="button"
        variant="outline"
      >
        <RefreshCw aria-hidden="true" className={pending ? "animate-spin" : undefined} />
        {pending ? "Memperbarui…" : "Muat ulang"}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">{announcement}</span>
      <span className="sr-only">Data dianggap perlu diperbarui setelah {DATA_STALE_AFTER_MS / 60_000} menit.</span>
    </div>
  );
}
