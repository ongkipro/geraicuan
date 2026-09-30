"use client";

import { Handshake, ListChecks, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SelectionNote, selectionBarClassName, useBatchSelection } from "@/app/app/label/batch-selection";
import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { markShipmentsHandedOverAction, selectReadyForHandover } from "@/app/app/label/handover-actions";
import { OptionCard } from "@/components/app/option-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HANDOVER_METHOD_CHOICES, HANDOVER_METHODS, HANDOVER_NOTE_MAX, type HandoverMethod } from "@/lib/shipment-handover";
import { cn } from "@/lib/utils";

/**
 * T-267 "Pilih semua siap diserahkan (N)": T-266's server-scoped select-all for the handover
 * queue. N is LBL-PRINTED; one handover takes at most MAX_BATCH_SHIPMENTS, like one print batch.
 */
export function SelectReadyButton({ className, params, total }: { className?: string; params: Record<string, string>; total: number }) {
  const { replace } = useBatchSelection();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("grid gap-1", className)}>
      <Button
        className="max-lg:h-11"
        disabled={pending}
        onClick={() => startTransition(async () => {
          try {
            const result = await selectReadyForHandover(params);
            setFailed(false);
            replace(result.numbers, result.total > result.numbers.length
              ? `${result.numbers.length} terbaru dari ${result.total} · maks. ${MAX_BATCH_SHIPMENTS} per penandaan`
              : null, result.types);
          } catch {
            setFailed(true);
          }
        })}
        type="button"
        variant="outline"
      >
        <ListChecks aria-hidden="true" />
        {pending ? "Memilih…" : <span>Pilih semua siap diserahkan <span className="tabular-nums" data-metric-id="LBL-PRINTED">({total})</span></span>}
      </Button>
      {failed ? <span className="text-xs text-destructive" role="alert">Paket siap diserahkan tidak dapat dipilih. Coba lagi.</span> : null}
    </span>
  );
}

/** The chosen parcels' common planned method, or null when they differ or one has none. */
function commonMethod(numbers: readonly number[], types: Readonly<Record<number, HandoverMethod | null>>): HandoverMethod | null {
  const methods = new Set(numbers.map((number) => types[number] ?? null));
  if (methods.size !== 1) return null;
  const [only] = methods;
  return only ?? null;
}

/**
 * T-267: on "Siap diserahkan" the selection bar records the handover instead of printing (reprint
 * stays one row away, and on Semua resi). Same element and classes as the T-266 print bar: pinned
 * below 1024px while parcels are chosen, in the toolbar from 1024px. The dialog confirms count,
 * method (defaulting to the parcels' planned handover when they agree) and an optional note.
 */
export function HandoverDialog() {
  const router = useRouter();
  const { clear, selected, setNotice, types } = useBatchSelection();
  const chosen = [...selected];
  const count = chosen.length;
  const overCap = count > MAX_BATCH_SHIPMENTS;
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<HandoverMethod | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const planned = commonMethod(chosen, types);

  const submit = () => startTransition(async () => {
    if (!method) return;
    setError(null);
    try {
      const result = await markShipmentsHandedOverAction({ method, note, numbers: chosen });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const done = result.marked + result.already;
      setNotice({
        lines: [
          ...(result.already > 0 ? [`${result.already} paket sudah tercatat diserahkan sebelumnya; tidak dicatat dua kali.`] : []),
          ...(result.refused.length > 0 ? ["Tidak ditandai:", ...result.refused] : []),
        ],
        title: done > 0
          ? `${done} paket ditandai sudah diserahkan · menunggu scan kurir`
          : "Tidak ada paket yang ditandai",
        tone: result.refused.length === 0 ? "success" : done > 0 ? "warning" : "danger",
      });
      setOpen(false);
      clear();
      router.refresh();
      document.getElementById("daftar-resi")?.focus();
    } catch {
      setError("Penyerahan tidak dapat dicatat. Tidak ada yang berubah; coba lagi.");
    }
  });

  return (
    <div
      aria-label={count > 0 ? "Paket terpilih" : undefined}
      className={selectionBarClassName(count)}
      data-slot="selection-bar"
      data-state={count > 0 ? "open" : "closed"}
      role={count > 0 ? "region" : undefined}
    >
      <SelectionNote className="max-lg:order-first max-lg:basis-full lg:hidden" />
      {count > 0 ? <span className="flex-1 text-sm font-semibold whitespace-nowrap tabular-nums lg:hidden">{count} dipilih</span> : null}
      {count > 0 ? (
        <Button
          className="max-lg:h-11 max-lg:px-3"
          onClick={() => { clear(); document.getElementById("daftar-resi")?.focus(); }}
          type="button"
          variant="ghost"
        >
          Batal pilih
        </Button>
      ) : null}
      <Dialog
        onOpenChange={(next) => {
          setOpen(next);
          if (next) { setMethod(planned); setNote(""); setError(null); }
        }}
        open={open}
      >
        <DialogTrigger asChild>
          <Button className="max-lg:h-11" disabled={count === 0 || overCap} type="button" variant={count > 0 ? "default" : "outline"}>
            <Handshake aria-hidden="true" className="max-[379px]:hidden" />
            {/* Phones: the bar already says "n dipilih", so the button is "Tandai diserahkan". */}
            <span>Tandai <span className="max-lg:hidden">sudah </span>diserahkan{count > 0 ? <span className="tabular-nums max-lg:hidden"> ({count})</span> : null}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="gap-6 p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Tandai {count} paket sudah diserahkan</DialogTitle>
            <DialogDescription>
              Dicatat atas nama Anda dengan waktu server. Paket keluar dari antrean setelah Mengantar mencatat scan kurir.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-3">
            <legend className="mb-3 text-sm font-semibold">Cara penyerahan</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {HANDOVER_METHODS.map((value) => (
                <OptionCard
                  checked={method === value}
                  description={HANDOVER_METHOD_CHOICES[value].description}
                  key={value}
                  name="cara-penyerahan"
                  onSelect={() => setMethod(value)}
                  value={value}
                >
                  {HANDOVER_METHOD_CHOICES[value].label}
                </OptionCard>
              ))}
            </div>
            {planned === null ? (
              <p className="text-xs text-muted-foreground">
                {new Set(chosen.map((number) => types[number] ?? null)).size > 1
                  ? "Rencana penyerahan paket terpilih berbeda. Pilih yang terjadi sekarang."
                  : "Rencana penyerahan tidak tercatat. Pilih yang terjadi sekarang."}
              </p>
            ) : null}
          </fieldset>
          <div className="grid gap-2">
            <label className="text-sm font-semibold" htmlFor="catatan-penyerahan">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
            <Input
              aria-describedby="catatan-penyerahan-bantuan"
              id="catatan-penyerahan"
              maxLength={HANDOVER_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              placeholder="mis. nama kurir"
              value={note}
            />
            <p className="flex justify-between gap-3 text-xs text-muted-foreground" id="catatan-penyerahan-bantuan">
              <span>Terlihat di Detail kiriman.</span>
              <span className="tabular-nums">{note.length}/{HANDOVER_NOTE_MAX}</span>
            </p>
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter className="-mx-6 -mb-6 px-6">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">Batal</Button>
            <Button disabled={!method || pending || overCap} onClick={submit} type="button">
              {pending ? "Mencatat…" : `Tandai ${count} paket`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {count === 0 ? <span className="text-xs text-muted-foreground">Pilih paket yang sudah diterima kurir</span> : null}
    </div>
  );
}

/** The last handover outcome, above the list, until dismissed. Announced politely. */
export function HandoverNotice() {
  const { notice, setNotice } = useBatchSelection();
  if (!notice) return null;
  return (
    <div className="border-b p-4" role="status">
      <Alert className={cn(
        "relative pr-12",
        notice.tone === "success" && "border-ok/40 bg-ok-surface text-ok",
        notice.tone === "warning" && "border-warn/40 bg-warn-surface text-warn",
      )} variant={notice.tone === "danger" ? "destructive" : "default"}>
        <Handshake aria-hidden="true" />
        <AlertTitle>{notice.title}</AlertTitle>
        {notice.lines.length > 0 ? (
          <AlertDescription>
            <ul className="grid gap-0.5">{notice.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          </AlertDescription>
        ) : null}
        <Button aria-label="Tutup pesan" className="absolute top-2 right-2 size-9" onClick={() => setNotice(null)} size="icon" type="button" variant="ghost">
          <X aria-hidden="true" />
        </Button>
      </Alert>
    </div>
  );
}
