"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
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
  const wasPending = useRef(false);
  // Refresh once per generated instant. A page whose data does not move (a fixture,
  // a failed read) must not re-request itself every 30 seconds forever.
  const refreshedFor = useRef<string | null>(null);

  const refresh = useCallback(() => {
    setAnnouncement("Memperbarui data…");
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const generatedAt = new Date(generatedAtIso);
    // Refresh the page's own data once it ages out, but only while the tab is
    // visible: a background tab would otherwise poll the database forever.
    const check = () => {
      if (!isDataStale(generatedAt, new Date())) return setStale(false);
      setStale(true);
      if (document.visibilityState !== "visible") return;
      if (refreshedFor.current === generatedAtIso) return;
      refreshedFor.current = generatedAtIso;
      refresh();
    };
    check();
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [generatedAtIso, refresh]);

  useEffect(() => {
    if (wasPending.current && !pending) setAnnouncement("Data selesai diperbarui.");
    wasPending.current = pending;
  }, [pending]);

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {pending ? "Memperbarui data…" : "Diperbarui"}{" "}
        {pending ? null : <time dateTime={generatedAtIso}>{formattedGeneratedAt}</time>}
      </span>
      {/* Stale is still worth saying: the refresh below may not have moved the data. */}
      {stale ? <Badge variant="secondary">Perlu diperbarui</Badge> : null}
      <span aria-live="polite" className="sr-only" role="status">{announcement}</span>
      <span className="sr-only">
        Data diperbarui otomatis setelah {DATA_STALE_AFTER_MS / 60_000} menit{stale ? ", pembaruan sedang berjalan" : ""}.
      </span>
    </div>
  );
}
