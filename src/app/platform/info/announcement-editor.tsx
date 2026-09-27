"use client";

import { ArrowDownToLine, Pencil, Plus } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";

import { type AnnouncementActionState, saveAnnouncement, unpublishAnnouncement } from "@/app/platform/info/actions";
import { AnnouncementCard } from "@/components/app/announcement-card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CharacterClassInput } from "@/components/ui/character-class-input";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABEL,
  ANNOUNCEMENT_TITLE_MAX,
  type AnnouncementCategory,
  announcementResultMessage,
} from "@/lib/announcements";
import { formatWibDateTime } from "@/lib/label-format";
import { cn } from "@/lib/utils";

import { useAnnouncementFeedback } from "./announcement-feedback";

const initialState: AnnouncementActionState = {};
const number = new Intl.NumberFormat("id-ID");

export type EditableAnnouncement = {
  body: string;
  category: AnnouncementCategory;
  id: string;
  pinned: boolean;
  /** When it went live; null for a draft. */
  publishedAt: Date | null;
  title: string;
};

function isCategory(value: string): value is AnnouncementCategory {
  return (ANNOUNCEMENT_CATEGORIES as string[]).includes(value);
}

/** "n / max karakter", turning destructive at the limit. */
function Counter({ id, max, value }: { id: string; max: number; value: string }) {
  return (
    <FieldDescription className={cn("shrink-0 text-right whitespace-nowrap tabular-nums", value.length >= max && "font-medium text-destructive")} id={id}>
      {number.format(value.length)} / {number.format(max)} karakter
    </FieldDescription>
  );
}

/**
 * T-244/T-256: create or edit one announcement in a dialog — title and body with live counters,
 * category, pinned switch — beside a preview of the card exactly as gerai will see it (below
 * the fields on narrow screens). "Tayangkan" publishes now, "Simpan draf" keeps it for the Admin
 * platform only; on a live item they read "Simpan & tetap tayang" / "Turunkan & simpan draf".
 * Fields are controlled so a refused save keeps what was typed and the dialog stays open with
 * the inline errors; a successful save closes it and reports one page-level line.
 */
export function AnnouncementEditor({ announcement }: { announcement?: EditableAnnouncement }) {
  const report = useAnnouncementFeedback();
  const wasPublished = Boolean(announcement?.publishedAt);
  const [state, action, pending] = useActionState(async (previous: AnnouncementActionState, form: FormData) => {
    const result = await saveAnnouncement(previous, form);
    if ((result.outcome === "published" || result.outcome === "saved") && result.resultToken) {
      const savedTitle = String(form.get("title") ?? "").replace(/\s+/gu, " ").trim();
      report({ message: announcementResultMessage(result.outcome, savedTitle, wasPublished), token: result.resultToken, tone: "success" });
    }
    return result;
  }, initialState);
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");
  const [category, setCategory] = useState<string>(announcement?.category ?? "");
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [handled, setHandled] = useState<string | undefined>(undefined);
  const base = useId();
  const ids = { body: `${base}-body`, category: `${base}-category`, pinned: `${base}-pinned`, title: `${base}-title` };
  const errors = state.errors ?? {};

  // A successful save closes the dialog (and clears a new-announcement form) once per result,
  // adjusted during render rather than in an effect.
  if (state.resultToken && handled !== state.resultToken) {
    setHandled(state.resultToken);
    if (state.outcome === "published" || state.outcome === "saved") {
      setOpen(false);
      if (!announcement) {
        setTitle("");
        setBody("");
        setCategory("");
        setPinned(false);
      }
    }
  }

  // Spec 10 §4.11: every field keeps room for its inline error, so a refused save does not shift the dialog.
  const error = (key: keyof typeof errors) => (
    <div className="min-h-5"><FieldError id={`${ids[key]}-error`}>{errors[key]}</FieldError></div>
  );
  const status = announcement?.publishedAt
    ? `Tayang sejak ${formatWibDateTime(announcement.publishedAt)}${announcement.pinned ? " · disematkan" : ""}.`
    : announcement ? "Draf — belum terlihat oleh gerai." : "Tampil di menu Info terbaru semua gerai setelah ditayangkan.";

  return (
    <Dialog
      onOpenChange={(next) => {
        if (pending) return;
        if (next) setOpenedAt(new Date());
        setOpen(next);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {announcement ? (
          <Button aria-label={`Ubah ${announcement.title}`} type="button" variant="outline">
            <Pencil aria-hidden="true" data-icon="inline-start" />
            Ubah
          </Button>
        ) : (
          <Button type="button">
            <Plus aria-hidden="true" data-icon="inline-start" />
            Buat info
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl" onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
        <form action={action} aria-busy={pending} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{announcement ? "Ubah info" : "Buat info"}</DialogTitle>
            <DialogDescription>{status}</DialogDescription>
          </DialogHeader>
          {announcement ? <input name="id" type="hidden" value={announcement.id} /> : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="flex min-w-0 flex-col gap-2">
              <Field className="gap-2" data-invalid={Boolean(errors.title)}>
                <FieldLabel htmlFor={ids.title}>Judul</FieldLabel>
                <CharacterClassInput
                  aria-describedby={`${ids.title}-count${errors.title ? ` ${ids.title}-error` : ""}`}
                  aria-invalid={errors.title ? true : undefined}
                  characterClass="FREE_TEXT"
                  id={ids.title}
                  maxLength={ANNOUNCEMENT_TITLE_MAX}
                  name="title"
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  value={title}
                />
                <div className="flex items-start justify-between gap-3">
                  {error("title")}
                  <Counter id={`${ids.title}-count`} max={ANNOUNCEMENT_TITLE_MAX} value={title} />
                </div>
              </Field>
              <Field className="gap-2" data-invalid={Boolean(errors.category)}>
                <FieldLabel htmlFor={ids.category}>Kategori</FieldLabel>
                <input name="category" type="hidden" value={category} />
                <Select onValueChange={setCategory} value={category}>
                  <SelectTrigger
                    aria-describedby={errors.category ? `${ids.category}-error` : undefined}
                    aria-invalid={errors.category ? true : undefined}
                    className="w-full sm:w-60"
                    id={ids.category}
                  >
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {ANNOUNCEMENT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>{ANNOUNCEMENT_CATEGORY_LABEL[value]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error("category")}
              </Field>
              <Field className="gap-2" data-invalid={Boolean(errors.body)}>
                <FieldLabel htmlFor={ids.body}>Isi</FieldLabel>
                <Textarea
                  aria-describedby={`${ids.body}-help ${ids.body}-count${errors.body ? ` ${ids.body}-error` : ""}`}
                  aria-invalid={errors.body ? true : undefined}
                  className="min-h-40"
                  id={ids.body}
                  maxLength={ANNOUNCEMENT_BODY_MAX}
                  name="body"
                  onChange={(event) => setBody(event.target.value)}
                  required
                  value={body}
                />
                <div className="flex items-start justify-between gap-3">
                  <FieldDescription id={`${ids.body}-help`}>Teks biasa; baris baru tetap tampil.</FieldDescription>
                  <Counter id={`${ids.body}-count`} max={ANNOUNCEMENT_BODY_MAX} value={body} />
                </div>
                {error("body")}
              </Field>
              <Field className="rounded-xl bg-tile p-4 has-[>[data-slot=field-content]]:items-center" orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor={ids.pinned}>Sematkan di atas</FieldLabel>
                  <FieldDescription>Tampil paling atas di Info terbaru semua gerai.</FieldDescription>
                </FieldContent>
                <Switch checked={pinned} id={ids.pinned} name="pinned" onCheckedChange={setPinned} />
              </Field>
            </div>
            <section aria-label="Pratinjau di gerai" className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-0 lg:self-start">
              <p aria-hidden="true" className="text-xs font-semibold text-muted-foreground">Pratinjau di gerai</p>
              <div className="rounded-2xl bg-background p-3" data-testid="announcement-preview">
                {openedAt ? (
                  <AnnouncementCard
                    announcement={{
                      body: body.trim() || "Isi info tampil di sini.",
                      category: isCategory(category) ? category : null,
                      id: `preview-${announcement?.id ?? "baru"}`,
                      pinned,
                      publishedAt: announcement?.publishedAt ?? openedAt,
                      title: title.trim() || "Judul info",
                    }}
                    isNew
                    now={openedAt}
                  />
                ) : null}
              </div>
            </section>
          </div>
          {state.message && (state.errors || state.outcome === "denied" || state.outcome === "error" || state.outcome === "invalid") ? (
            <p className="text-sm font-medium text-destructive" role="alert">{state.message}</p>
          ) : null}
          <DialogFooter className="items-center gap-2 sm:justify-between">
            <p className="text-xs text-muted-foreground max-sm:order-last max-sm:text-center">
              {wasPublished ? "Perubahan langsung terlihat di semua gerai." : "Draf hanya terlihat oleh Admin platform."}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">Batal</Button>
              </DialogClose>
              <Button disabled={pending} name="intent" type="submit" value="draft" variant="outline">
                {wasPublished ? "Turunkan & simpan draf" : "Simpan draf"}
              </Button>
              <Button disabled={pending} name="intent" type="submit" value="publish">
                {pending ? "Menyimpan…" : wasPublished ? "Simpan & tetap tayang" : "Tayangkan"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * T-244/T-256: takes a published announcement back to draft after a confirmation naming it.
 * The action is awaited here and reported to the page-level line, because the revalidated list
 * no longer renders this button once the row is a draft.
 */
export function UnpublishAnnouncement({ id, title }: { id: string; title: string }) {
  const report = useAnnouncementFeedback();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const confirm = () => startTransition(async () => {
    const form = new FormData();
    form.set("id", id);
    const result = await unpublishAnnouncement(initialState, form);
    const token = result.resultToken ?? crypto.randomUUID();
    report(result.outcome === "unpublished"
      ? { message: announcementResultMessage("unpublished", title, true), token, tone: "success" }
      : { message: result.message ?? "Info belum diturunkan. Coba lagi.", token, tone: "error" });
    setOpen(false);
  });

  return (
    <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
      <AlertDialogTrigger asChild>
        <Button aria-label={`Turunkan ${title}`} disabled={pending} type="button" variant="outline">
          <ArrowDownToLine aria-hidden="true" data-icon="inline-start" />
          Turunkan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Turunkan “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Info ini hilang dari menu Info terbaru semua gerai dan kembali menjadi draf. Anda bisa menayangkannya lagi kapan saja. Tindakan ini tercatat di jejak audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <Button aria-busy={pending} disabled={pending} onClick={confirm} type="button">
            {pending ? "Menurunkan…" : "Ya, turunkan"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
