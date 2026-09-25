"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { DATA_STALE_AFTER_MS } from "@/lib/data-freshness";

/**
 * PR-74: the page's one freshness line. Once the list has been open past the stale threshold
 * it offers "Muat ulang" in the same line (no second sentence), which re-renders the server
 * page with fresh rows.
 */
export function FreshnessLine({ generatedAtIso, text }: { generatedAtIso: string; text: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const age = Date.now() - new Date(generatedAtIso).getTime();
    const wait = Math.max(0, DATA_STALE_AFTER_MS - age);
    const timer = setTimeout(() => setStale(true), wait);
    return () => clearTimeout(timer);
  }, [generatedAtIso]);

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" data-slot="freshness-line" data-stale={stale || undefined}>
      <span>{text}</span>
      {stale ? (
        <button
          className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60 md:min-h-10"
          disabled={pending}
          onClick={() => startTransition(() => router.refresh())}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={pending ? "size-3.5 animate-spin" : "size-3.5"} />
          {pending ? "Memuat…" : "Muat ulang"}
        </button>
      ) : null}
    </p>
  );
}
