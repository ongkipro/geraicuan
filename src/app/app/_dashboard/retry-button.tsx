"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/** Re-reads the page's server data; the other regions stay as they are while it runs. */
export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => { router.refresh(); onRetry?.(); })}
      type="button"
      variant="outline"
    >
      <RotateCw aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : undefined} />
      {pending ? "Memuat ulang…" : "Coba lagi"}
    </Button>
  );
}
