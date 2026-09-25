import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shipmentStatuses } from "@/lib/domain-enums";
import {
  SHIPMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_PRESENTATION,
} from "@/lib/shipment-queue";

describe("shipment lifecycle presentation copy", () => {
  it("gives every status operational guidance, not a restated label", () => {
    for (const status of shipmentStatuses) {
      const { guidance, label } = SHIPMENT_STATUS_PRESENTATION[status];

      // The six statuses added in Phase 9 shipped with fragments like
      // "Menunggu dikembalikan" — a second label rather than guidance. Every
      // sibling entry tells the operator what the state means and what to do.
      expect(guidance, status).toMatch(/\.$/);
      expect(guidance.split(/\s+/).length, status).toBeGreaterThanOrEqual(8);
      expect(guidance.toLowerCase(), status).not.toBe(label.toLowerCase());
    }
  });

  it("labels every status distinctly, in sentence case, and in Indonesian", () => {
    const labels = shipmentStatuses.map((status) => SHIPMENT_STATUS_PRESENTATION[status].label);
    expect(new Set(labels).size).toBe(labels.length);

    for (const label of labels) {
      // "RTS Antre" and "RTS Perjalanan" were the only Title Case entries and
      // the only ones carrying an English acronym. Check every word including
      // the first, or the acronym simply moves to the front.
      const [first, ...rest] = label.split(" ");
      expect(rest.filter((word) => /^[A-Z]/.test(word)), label).toEqual([]);
      expect(first, label).toMatch(/^[A-Z][a-z]/);
      expect(label, label).not.toMatch(/\bRTS\b/);
    }
  });

  it("never tells the operator to take an action the product does not offer", () => {
    // `shipmentLifecycleActions` returns nothing for the six statuses added in
    // Phase 9, and the detail page renders "Tidak ada tindakan lanjutan untuk
    // status ini" beside the same guidance. An earlier rewrite instructed
    // "kirim ulang", which is the product's named hazard rather than an
    // action, and "periksa riwayat kiriman ini", which names a surface the CMS
    // does not have.
    //
    // This is a shape check on known-bad phrasings, not a check on meaning.
    // Whether a sentence is honest about the product is a review judgement; the
    // list below only stops a specific regression from returning quietly.
    // Case-insensitive on purpose: the natural regression is an imperative
    // opening a sentence, so "Kirim ulang …" is exactly the shape a
    // case-sensitive pattern misses.
    const forbiddenActions = [
      /\bkirim ulang\b/i,
      /\bmenutup kasus\b/i,
      /\bmemutuskan retur\b/i,
      /\briwayat kiriman\b/i,
      /\bajukan klaim\b/i,
      /\bhubungi kurir\b/i,
      /\bjadwalkan (?:ulang|pengantaran)\b/i,
    ];
    for (const status of shipmentStatuses) {
      const { guidance } = SHIPMENT_STATUS_PRESENTATION[status];
      // Split on the semicolon too, or one clause's "jangan" licenses an
      // instruction in the next clause of the same sentence.
      for (const sentence of guidance.split(/(?<=[.;])\s*/)) {
        for (const pattern of forbiddenActions) {
          // Scoped to the sentence, not the whole string: a "jangan" elsewhere
          // must not license an instruction here.
          const prohibition = /\bjangan\b/i.test(sentence);
          expect(
            pattern.test(sentence) && !prohibition,
            `${status}: ${sentence}`,
          ).toBe(false);
        }
      }
    }
  });

  // T-209 (ADR-0001): UI v3 rebuild in progress — the pages this reads were removed; re-enable in T-219.
  it.skip("keeps one lifecycle vocabulary on every surface that names a status", () => {
    // The platform monitoring filter, the RTS KPI cards and the reconciliation
    // panel each carried their own map, so one stored value read "Antre retur"
    // to a tenant and "RTS (Antrean)" to a super admin.
    for (const file of [
      "src/app/platform/_components/monitoring-view.tsx",
      "src/app/app/pengiriman/rts/page.tsx",
      "src/app/app/pengiriman/[shipmentId]/reconciliation-panel.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toContain("SHIPMENT_STATUS_PRESENTATION");
    }
  });

  it("has no second status-to-label map anywhere in the tree", () => {
    // Derived from the tree, so a new copy cannot appear unnoticed the way the
    // reconciliation panel's did.
    //
    // What counts as a label: a status key sitting next to a string that reads
    // as prose. A status next to another SCREAMING_CASE constant is an
    // enum list — `analytics-repository` has several in SQL — and a status next
    // to a path is a route map, which `shipmentQueueHref` legitimately builds.
    // Both are excluded rather than flagged.
    //
    // This recognises the shapes a label map actually takes; it is not a proof
    // that no encoding exists that escapes it. The durable protection is that
    // the three surfaces which render a status derive from the shared source,
    // asserted above, plus review.
    const PROSE = String.raw`(?!\s*/)[^"'\`\n]*[a-z][^"'\`\n]*`;
    const walk = (directory: string): string[] =>
      readdirSync(join(process.cwd(), directory)).flatMap((entry) => {
        const path = join(directory, entry);
        return statSync(join(process.cwd(), path)).isDirectory()
          ? walk(path)
          : /\.(?:tsx?|jsx?|mjs|cjs)$/.test(entry)
            ? [path]
            : [];
      });

    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (file.endsWith("shipment-queue.ts")) continue;
      const source = readFileSync(join(process.cwd(), file), "utf8");
      for (const status of shipmentStatuses) {
        const shapes = [
          // RTS_QUEUED: "Antre retur"  — whitespace-tolerant, since deleting
          // one space defeated the first version of this check.
          String.raw`\b${status}\s*:\s*["'\`]${PROSE}["'\`]`,
          // ["RTS_QUEUED", "Antre retur"]  and  ["RTS_QUEUED"]: "Antre retur"
          String.raw`["'\`]${status}["'\`]\s*(?:,|\])\s*:?\s*["'\`]${PROSE}["'\`]`,
          // RTS_QUEUED: { label: "Antre retur" }
          String.raw`\b${status}\s*:\s*\{[^}]*\blabel\s*:\s*["'\`]${PROSE}["'\`]`,
        ];
        if (shapes.some((shape) => new RegExp(shape).test(source))) {
          offenders.push(`${file}: ${status}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the queue filter offering exactly the stored statuses plus its views", () => {
    const values = SHIPMENT_STATUS_OPTIONS.map((option) => option.value);
    // T-162 added NEEDS_ATTENTION (spec 19 QUE-ATTENTION), the PR-52 panel
    // entry. It is offered in the select too, or choosing it from the panel
    // would leave the select showing nothing.
    expect(values.slice(0, 5)).toEqual([
      "ALL",
      "ACTION_REQUIRED",
      "NEEDS_ATTENTION",
      "READY_TO_PROGRESS",
      "ISSUED_TODAY",
    ]);
    expect(values.slice(5)).toEqual([...shipmentStatuses]);
  });

  // T-209 (ADR-0001): UI v3 rebuild in progress — the pages this reads were removed; re-enable in T-219.
  it.skip("renders the return queue from the shared presentation, not a second copy", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/app/pengiriman/rts/page.tsx"),
      "utf8",
    );

    // The filter tabs and the status badge in the same table used to disagree:
    // "Antre Retur" above, "RTS Antre" in the row.
    for (const status of ["RTS_QUEUED", "RTS_IN_TRANSIT", "RTS_RECEIVED", "PROBLEM"] as const) {
      expect(page, status).toContain(`SHIPMENT_STATUS_PRESENTATION.${status}.label`);
      expect(page, status).not.toContain(`"${SHIPMENT_STATUS_PRESENTATION[status].label}"`);
    }

    // The KPI cards above the tabs were a third vocabulary on the same screen.
    for (const retired of [
      "Antre Dikembalikan",
      "Dalam Perjalanan (RTS)",
      "Selesai Diterima",
      "Semua Retur",
      "Antre Retur",
      "Diterima Gudang",
    ]) {
      expect(page, retired).not.toContain(retired);
    }
  });
});
