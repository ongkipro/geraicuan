"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** The stored phone is canonical ("08…"): the leading 0 becomes Indonesia's 62. */
export function whatsappHref(phone: string) {
  return `https://wa.me/62${phone.replace(/^0/, "")}`;
}

/** Icon-only on a list row (named by `aria-label`), labelled outline in a page header. */
export function WhatsAppButton({ labelled = false, name, phone }: { labelled?: boolean; name: string; phone: string }) {
  return (
    <Button asChild size={labelled ? "default" : "icon-sm"} variant={labelled ? "outline" : "ghost"}>
      <a aria-label={labelled ? undefined : `Kirim WhatsApp ke ${name}`} href={whatsappHref(phone)} rel="noreferrer" target="_blank">
        <MessageCircle aria-hidden="true" />
        {labelled ? "WhatsApp" : null}
      </a>
    </Button>
  );
}

/** Copies the phone and says so in a polite live region; the button keeps its name. */
export function CopyPhoneButton({ labelled = false, name, phone }: { labelled?: boolean; name: string; phone: string }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <>
      <Button
        aria-label={labelled ? undefined : `Salin nomor ${name}`}
        onClick={copy}
        size={labelled ? "default" : "icon-sm"}
        type="button"
        variant={labelled ? "outline" : "ghost"}
      >
        {copied === "done" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {labelled ? (copied === "done" ? "Tersalin" : "Salin nomor") : null}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied === "done" ? `Nomor ${phone} disalin.` : copied === "failed" ? "Nomor tidak dapat disalin; salin manual." : ""}
      </span>
    </>
  );
}
