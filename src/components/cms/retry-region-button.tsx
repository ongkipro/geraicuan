"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

function focusWhenReplaced(targetId: string, previousTarget: HTMLElement | null) {
  const focusTarget = () => {
    const target = document.getElementById(targetId);
    if (!target || target === previousTarget) return false;
    target.focus();
    return true;
  };
  if (focusTarget()) return () => undefined;

  const observer = new MutationObserver(() => {
    if (focusTarget()) {
      observer.disconnect();
      window.clearTimeout(timeout);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeout = window.setTimeout(() => observer.disconnect(), 10_000);

  return () => {
    observer.disconnect();
    window.clearTimeout(timeout);
  };
}

export function useFocusTargetOnMount(targetId: string) {
  useEffect(() => {
    document.getElementById(targetId)?.focus();
  }, [targetId]);
}

export function RetryRegionButton({
  focusTargetId,
  label = "Coba lagi",
  onRetry,
}: {
  focusTargetId?: string;
  label?: string;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setAnnouncement("Pembaruan selesai.");
      if (!onRetry && focusTargetId) {
        document.getElementById(focusTargetId)?.focus();
      }
    }
    wasPending.current = pending;
  }, [focusTargetId, onRetry, pending]);

  return (
    <>
      <Button
        className="min-h-11"
        disabled={pending}
        onClick={() => {
          setAnnouncement("Memuat ulang data…");
          if (focusTargetId) {
            focusWhenReplaced(
              focusTargetId,
              document.getElementById(focusTargetId),
            );
          }
          startTransition(() => {
            onRetry?.();
            router.refresh();
          });
        }}
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden="true"
          className={pending ? "animate-spin" : undefined}
        />
        {pending ? "Memuat ulang…" : label}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
    </>
  );
}
