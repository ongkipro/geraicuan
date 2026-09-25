"use client";

import { ArrowLeftRight, Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { contactRoleLabel, type ContactRole } from "@/lib/contact-role-filter";

/** Phone (already canonical "0…") as a wa.me link: the leading 0 becomes the 62 country code. */
export function whatsappHref(phone: string) {
  return `https://wa.me/62${phone.replace(/^0/, "")}`;
}

/**
 * T-188: on a role list, the only role worth marking is the one the page does
 * not already imply. The visible text names it; the sr-only tail and the
 * tooltip say what it means.
 */
export function AlsoRoleBadge({ role }: { role: ContactRole }) {
  const noun = contactRoleLabel(role).toLowerCase();
  // Own provider: the badge also renders outside the CMS shell (tests, previews).
  return (
    <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="cursor-default outline-none" data-also-role={role} tabIndex={0} variant="outline">
          <ArrowLeftRight aria-hidden="true" />
          Juga {noun}
          <span className="sr-only">: kontak ini juga tersimpan sebagai {noun}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Kontak ini juga tersimpan sebagai {noun}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

/** Copies a phone number and says so in a polite live region; the button keeps its name. */
export function CopyPhoneButton({ label = "Salin nomor", name, phone, showLabel = false }: { label?: string; name: string; phone: string; showLabel?: boolean }) {
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  };
  return (
    <>
      <Button
        aria-label={showLabel ? undefined : `${label} ${name}`}
        className={showLabel ? "min-h-11 md:min-h-10" : "size-11 md:size-8"}
        onClick={copy}
        size={showLabel ? "sm" : "icon"}
        type="button"
        variant={showLabel ? "outline" : "ghost"}
      >
        {copied === "done" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {showLabel ? (copied === "done" ? "Tersalin" : label) : null}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied === "done" ? `Nomor ${phone} disalin.` : copied === "failed" ? "Nomor tidak dapat disalin; salin manual." : ""}
      </span>
    </>
  );
}

export function WhatsAppLink({ name, phone, showLabel = false }: { name: string; phone: string; showLabel?: boolean }) {
  return (
    <Button asChild className={showLabel ? "min-h-11 md:min-h-10" : "size-11 md:size-8"} size={showLabel ? "sm" : "icon"} variant={showLabel ? "outline" : "ghost"}>
      <a aria-label={showLabel ? undefined : `Kirim WhatsApp ke ${name}`} href={whatsappHref(phone)} rel="noreferrer" target="_blank">
        <MessageCircle aria-hidden="true" />
        {showLabel ? "WhatsApp" : null}
      </a>
    </Button>
  );
}
