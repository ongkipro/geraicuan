"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type AnnouncementFeedback = { message: string; token: string; tone: "error" | "success" };

const FeedbackContext = createContext<{ feedback: AnnouncementFeedback | null; report: (next: AnnouncementFeedback) => void }>({
  feedback: null,
  report: () => undefined,
});

/**
 * T-256: one result line for the whole /platform/info page. Every save and takedown reports
 * here, and the latest replaces the previous one, so the message survives its trigger leaving
 * the list (a takedown removes the row's "Turunkan"; a filter can drop the row) and an old
 * "disimpan sebagai draf" never outlives a later publish (T-244 review).
 */
export function AnnouncementFeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, report] = useState<AnnouncementFeedback | null>(null);
  return <FeedbackContext value={{ feedback, report }}>{children}</FeedbackContext>;
}

export function useAnnouncementFeedback() {
  return use(FeedbackContext).report;
}

/**
 * The line itself, under the page header, inside a live region that is always in the DOM. When
 * the action's trigger is gone (takedown) focus would fall to the page, so it moves to the line.
 */
export function AnnouncementFeedbackLine() {
  const { feedback } = use(FeedbackContext);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const token = feedback?.token;

  useEffect(() => {
    if (!token) return;
    const active = document.activeElement;
    if (!active || active === document.body) lineRef.current?.focus();
  }, [token]);

  const shown = feedback && feedback.token !== dismissed ? feedback : null;
  const Icon = shown?.tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div aria-live={shown?.tone === "error" ? "assertive" : "polite"} className="empty:hidden" data-testid="announcement-feedback">
      {shown ? (
        <Alert
          className="flex items-start gap-3 py-2.5 pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          data-tone={shown.tone}
          ref={lineRef}
          role={shown.tone === "error" ? "alert" : "status"}
          tabIndex={-1}
          variant={shown.tone === "error" ? "destructive" : "default"}
        >
          <Icon aria-hidden="true" className={shown.tone === "error" ? "mt-0.5 size-4 shrink-0" : "mt-0.5 size-4 shrink-0 text-ok"} />
          <AlertDescription className="min-w-0 flex-1 text-sm text-foreground">{shown.message}</AlertDescription>
          <Button
            aria-label="Tutup pesan"
            className="-my-1.5 shrink-0 text-muted-foreground"
            onClick={() => setDismissed(shown.token)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}
    </div>
  );
}
