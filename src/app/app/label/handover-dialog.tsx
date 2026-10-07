"use client";

import { ChevronDown, CircleAlert, CircleCheck, Handshake, Info, ListChecks, ScanBarcode, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { SelectionBar, SelectionNote, useBatchSelection } from "@/app/app/label/batch-selection";
import { MAX_BATCH_SHIPMENTS } from "@/app/app/label/cetak/batch-query";
import { markShipmentsHandedOverAction, scanForHandover, selectReadyForHandover } from "@/app/app/label/handover-actions";
import { OptionCard } from "@/components/app/option-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HANDOVER_METHOD_CHOICES, HANDOVER_METHODS, HANDOVER_NOTE_MAX, handoverScanOutcome, type HandoverMethod } from "@/lib/shipment-handover";
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
              : null, result.types, result.awbs);
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

/** T-270: the chosen parcels by resi (the nomor kiriman only if no resi is known), in selection order. */
export function ChosenResiList({ awbs, numbers }: { awbs: Readonly<Record<number, string>>; numbers: readonly number[] }) {
  return (
    <ul aria-label="Resi terpilih" className="grid max-h-48 gap-x-6 gap-y-1 overflow-y-auto border-t px-4 py-3 font-mono text-sm tabular-nums sm:grid-cols-2">
      {numbers.map((number) => <li className="wrap-anywhere" key={number}>{awbs[number] ?? `Nomor kiriman ${number}`}</li>)}
    </ul>
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
  const { awbs, clear, selected, setNotice, types } = useBatchSelection();
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
      // T-270: back to the scan field for the next pickup; the list region when there is none.
      (document.getElementById("scan-resi") ?? document.getElementById("daftar-resi"))?.focus();
    } catch {
      setError("Penyerahan tidak dapat dicatat. Tidak ada yang berubah; coba lagi.");
    }
  });

  return (
    <SelectionBar count={count} label="Paket terpilih">
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
          {/* T-270 (critique 2026-09-30 P2): the chosen parcels, collapsed — check before "Tandai". */}
          <details className="group rounded-lg border" data-slot="handover-chosen">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <span>Lihat resi terpilih <span className="tabular-nums">({count})</span></span>
              <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <ChosenResiList awbs={awbs} numbers={chosen} />
          </details>
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
                  ? "Paket terpilih punya rencana penyerahan berbeda. Pilih cara paket diserahkan sekarang."
                  : "Pilih cara paket diserahkan."}
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
          <DialogFooter className="-mx-6 -mb-6 -bottom-6 px-6">
            <Button onClick={() => setOpen(false)} type="button" variant="outline">Batal</Button>
            <Button disabled={!method || pending || overCap} onClick={submit} type="button">
              {pending ? "Mencatat…" : `Tandai ${count} paket`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {count === 0 ? <span className="text-xs text-muted-foreground">Pilih paket yang sudah diterima kurir</span> : null}
    </SelectionBar>
  );
}

/** The last handover outcome, above the list, until dismissed. Announced politely. */
export function HandoverNotice() {
  const { notice, setNotice } = useBatchSelection();
  // R6-X (critique #8): the status container is always mounted and empty until an outcome, so the
  // injected text is announced (a live region mounted together with its text often is not).
  return (
    <div className={notice ? "border-b p-4" : undefined} data-slot="handover-notice" role="status">
      {notice ? <Alert className={cn(
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
      </Alert> : null}
    </div>
  );
}

/** `number`: the parcel an "added" outcome put in the selection; the line goes once it leaves it (L4). */
type ScanMessage = { id: number; number?: number; text: string; tone: "success" | "info" | "danger" };

const SCAN_TONE = {
  danger: { className: "text-destructive", icon: CircleAlert },
  info: { className: "text-foreground", icon: Info },
  success: { className: "text-ok", icon: CircleCheck },
} as const;

/** The scanned parcel's row on this page, in the layout that is showing, brought into view. */
function revealRow(number: number) {
  const row = [`pilih-tabel-${number}`, `pilih-kartu-${number}`]
    .map((id) => document.getElementById(id)?.closest("tr, li"))
    .find((element): element is HTMLElement => element instanceof HTMLElement && (element.closest("details") !== null || element.getClientRects().length > 0));
  if (!row) return false;
  const details = row.closest("details");
  if (details && !details.open) details.open = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  if (!reduce) row.animate([{ backgroundColor: "var(--ok-surface)" }, { backgroundColor: "transparent" }], { duration: 1600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  return true;
}

/**
 * T-270 (owner 2026-10-01) "Scan resi" on Siap diserahkan: a keyboard-wedge scanner (USB or
 * Bluetooth) types the resi and presses Enter; a person may type the nomor kiriman (GC-10123 or
 * 10123). Each code is looked up on the server for the session's gerai — the whole queue, not only
 * this page — and a ready parcel joins the selection the "Tandai diserahkan" bar records. Codes are
 * handled one at a time in the order scanned; the field clears after each and keeps focus. The
 * outcome is announced politely under the field. Nothing is recorded until "Tandai".
 */
export function HandoverScanField() {
  const { add, selected } = useBatchSelection();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setScanMessage] = useState<ScanMessage | null>(null);
  const messageId = useRef(0);
  // A new node per outcome, so the same words twice in a row are announced twice.
  const setMessage = (next: Omit<ScanMessage, "id">) => setScanMessage({ ...next, id: ++messageId.current });
  const [pending, setPending] = useState(false);
  const queue = useRef<string[]>([]);
  const busy = useRef(false);
  // What is chosen, including picks of this burst the next render has not caught up with.
  const chosen = useRef<Set<number>>(new Set());

  useEffect(() => {
    chosen.current = new Set(selected);
  }, [selected]);

  // Autofocus for a desk or kiosk with a scanner; not where the primary pointer is touch, where it
  // would raise the on-screen keyboard over the list.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  const drain = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      for (let code = queue.current.shift(); code !== undefined; code = queue.current.shift()) {
        let result: Awaited<ReturnType<typeof scanForHandover>>;
        try {
          result = await scanForHandover(code);
        } catch {
          result = { ok: false, publicReference: null, reason: "LOOKUP_FAILED" };
        }
        const outcome = handoverScanOutcome(result, chosen.current, MAX_BATCH_SHIPMENTS);
        if (outcome.kind === "added" && result.ok) {
          chosen.current.add(outcome.number);
          add(outcome.number, result.awb, result.handoverType);
          const onPage = revealRow(outcome.number);
          setMessage({ number: outcome.number, text: `${outcome.text}${onPage ? "" : " (dari halaman lain)"}`, tone: "success" });
        } else if (outcome.kind === "duplicate") {
          revealRow(outcome.number);
          setMessage({ text: outcome.text, tone: "info" });
        } else {
          setMessage({ text: outcome.text, tone: "danger" });
        }
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = event.currentTarget.value.trim();
    event.currentTarget.value = "";
    if (!code) return;
    // A scanner that reads one barcode twice in a row sends the same code back to back.
    if (queue.current.at(-1) === code) return;
    queue.current.push(code);
    void drain();
  };

  // After "Tandai" or "Batal pilih" clears the selection, "… ditambahkan · N dipilih" is no longer true.
  const shown = message && (message.number === undefined || selected.has(message.number)) ? message : null;
  const tone = shown ? SCAN_TONE[shown.tone] : null;
  return (
    <div className="grid gap-1.5 border-b p-4 print:hidden" data-slot="handover-scan">
      <label className="text-sm font-semibold" htmlFor="scan-resi">Scan resi</label>
      <div className="relative sm:max-w-md">
        <ScanBarcode aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-busy={pending || undefined}
          aria-describedby="scan-resi-bantuan scan-resi-hasil"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          className="pl-9 font-mono placeholder:font-sans max-lg:h-11"
          enterKeyHint="done"
          id="scan-resi"
          maxLength={64}
          onKeyDown={onKeyDown}
          placeholder="Scan atau ketik GC-10123"
          ref={inputRef}
          spellCheck={false}
          type="text"
        />
      </div>
      <p className="text-xs text-muted-foreground" id="scan-resi-bantuan">
        Arahkan scanner ke barcode resi, atau ketik nomor kiriman lalu Enter. Paket masuk ke pilihan; dicatat saat Anda menekan Tandai diserahkan.
      </p>
      <p aria-live="polite" className={cn("flex min-h-5 items-start gap-1.5 text-sm font-medium", tone?.className)} id="scan-resi-hasil" role="status">
        {shown && tone ? <span className="flex items-start gap-1.5" key={shown.id}><tone.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{shown.text}</span> : null}
      </p>
    </div>
  );
}
