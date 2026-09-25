"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Icon button that copies one identity value and says so in a polite live region. */
export function CopyValueButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <>
      <Button aria-label={`Salin ${label}`} className="text-muted-foreground" onClick={copy} size="icon-sm" type="button" variant="ghost">
        {copied === "done" ? <Check aria-hidden="true" className="text-ok" /> : <Copy aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied === "done" ? `${label} disalin.` : copied === "failed" ? `${label} tidak dapat disalin; salin manual.` : ""}
      </span>
    </>
  );
}
