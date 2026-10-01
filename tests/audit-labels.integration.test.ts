import { describe, expect, it } from "vitest";

import { auditEventActions, auditEventTargetTypes, tenantStatuses } from "@/db/schema";
import {
  auditActionSentence,
  auditActorLabel,
  auditObjectLabel,
  auditOutcomeLabel,
  auditTenantFallbackLabel,
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

  it("T-259: only a PLATFORM target reads \"Platform\" without a gerai; every gerai target reads \"Gerai tidak tercatat\"", () => {
    expect(auditEventTargetTypes.map((type) => [type, auditTenantFallbackLabel(type)])).toEqual([
      ["TENANT", "Gerai tidak tercatat"],
      ["PLATFORM", "Platform"],
      ["MEMBERSHIP", "Gerai tidak tercatat"],
      ["OUTLET", "Gerai tidak tercatat"],
      // T-267: the handover audit rows name the shipment; always stored with the gerai.
      ["SHIPMENT", "Gerai tidak tercatat"],
    ]);
    expect(auditTenantFallbackLabel(null)).toBe("Gerai tidak tercatat");
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

  // T-273: the Objek column — what a row changed when it is not the gerai itself. Every stored
  // target type is placed; a shipment reads "Kiriman" (no number: not in the platform read model).
  it("names the object of each target type, and nothing for a gerai row", () => {
    const labels = auditEventTargetTypes.map((targetType) => [targetType, auditObjectLabel({ action: "X", targetType })]);
    expect(labels).toEqual([["TENANT", null], ["PLATFORM", null], ["MEMBERSHIP", "Anggota gerai"], ["OUTLET", "Outlet"], ["SHIPMENT", "Kiriman"]]);
    expect(auditObjectLabel({ action: "OUTLET_SETTINGS_CHANGED", outletName: "Gudang Utama", targetType: "OUTLET" })).toBe("Outlet Gudang Utama");
    expect(auditObjectLabel({ action: "ANNOUNCEMENT_PUBLISHED", targetType: "PLATFORM" })).toBe("Info terbaru");
    expect(auditObjectLabel({ action: "PLATFORM_MONITORING_VIEWED", targetType: "PLATFORM" })).toBe("Pemantauan platform");
  });
});
