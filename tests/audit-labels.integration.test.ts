import { describe, expect, it } from "vitest";

import { auditEventActions, tenantStatuses } from "@/db/schema";
import {
  auditActionSentence,
  auditActorLabel,
  auditOutcomeLabel,
  tenantStatusLabel,
  tenantStatusTone,
} from "@/lib/labels/audit";

describe("T-202 audit and tenant-status labels (spec 10 §8, spec 18 /platform/audit, V-6/V-13/V-22)", () => {
  it("words every stored audit action as an Indonesian sentence without the code", () => {
    const sentences = auditEventActions.map((action) => auditActionSentence({ action, actorRole: "SUPER_ADMIN", outcome: "SUCCESS" }));
    for (const [index, sentence] of sentences.entries()) {
      const action = auditEventActions[index];
      expect(sentence, action).not.toContain(action);
      expect(sentence, action).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
    expect(new Set(sentences).size).toBe(auditEventActions.length);
    expect(auditActionSentence({ action: "PLATFORM_MONITORING_VIEWED", actorRole: "SUPER_ADMIN", outcome: "SUCCESS" }))
      .toBe("Admin platform membuka pemantauan platform");
    expect(auditActionSentence({ action: "TENANT_SELF_REGISTERED", actorRole: "TENANT_MEMBER", outcome: "SUCCESS" }))
      .toBe("Pemilik gerai mendaftarkan gerai baru");
  });

  it("reads a denied event as an attempt and an unknown code as a generic sentence", () => {
    expect(auditActionSentence({ action: "TENANT_SUSPENDED", actorRole: "SUPER_ADMIN", outcome: "DENIED" }))
      .toBe("Admin platform mencoba menangguhkan gerai");
    expect(auditActionSentence({ action: "SOMETHING_NEW", actorRole: null, outcome: "SUCCESS" }))
      .toBe("Sistem melakukan aktivitas lain");
    expect(auditActionSentence({ action: "SOMETHING_NEW", actorRole: "SUPER_ADMIN", outcome: "DENIED" }))
      .not.toContain("SOMETHING_NEW");
    expect(auditActorLabel("TENANT_MEMBER")).toBe("Anggota gerai");
    expect(auditActorLabel("toString")).toBe("Sistem");
  });

  it("gives tenant statuses and outcomes distinct Indonesian labels and tones", () => {
    const labels = tenantStatuses.map(tenantStatusLabel);
    expect(labels).toEqual(["Disiapkan", "Aktif", "Ditangguhkan", "Diarsipkan"]);
    expect(new Set(tenantStatuses.map(tenantStatusTone)).size).toBe(tenantStatuses.length);
    expect(tenantStatusLabel("MYSTERY")).toBe("Status lain");
    expect(tenantStatusLabel(null)).toBe("—");
    expect(auditOutcomeLabel("SUCCESS")).toEqual({ label: "Berhasil", tone: "ok" });
    expect(auditOutcomeLabel("DENIED")).toEqual({ label: "Ditolak", tone: "danger" });
  });
});
