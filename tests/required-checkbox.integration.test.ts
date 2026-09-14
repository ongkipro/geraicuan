import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selected: "service", pending: false }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original,
    useActionState: () => [{}, () => {}, state.pending],
    useState: (initial: unknown) => [initial === "" ? state.selected : initial, () => {}],
  };
});
vi.mock("@/app/app/pengiriman/[shipmentId]/actions", () => ({ confirmShipmentIssuance: vi.fn() }));
vi.mock("@/app/app/pengiriman/[shipmentId]/reconciliation-actions", () => ({ reconcileShipmentUnknownSubmission: vi.fn() }));
vi.mock("@/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions", () => ({ recoverShipmentUnpaidPayment: vi.fn() }));
// Render the real reversal form contents without the browser-only portal.
vi.mock("@/components/ui/alert-dialog", () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return Object.fromEntries(["AlertDialog", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogTrigger"].map(name => [name, content]));
});

import { ShipmentIssuancePanel } from "@/app/app/pengiriman/[shipmentId]/issuance-panel";
import { ShipmentReconciliationPanel } from "@/app/app/pengiriman/[shipmentId]/reconciliation-panel";
import { ShipmentUnpaidRecoveryPanel } from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-panel";
import { ReversalActionPanel } from "@/app/app/keuangan/components/finance-action-panels";

const cases = [
  ["issuance", (enabled: boolean) => createElement(ShipmentIssuancePanel, { fixtureEnabled: enabled, isCod: false, shipmentId: "shipment", snapshotId: "snapshot", options: [{ estimateServiceId: "service", providerService: "Regular", shippingAmountIdr: 10000, insuranceAmountIdr: null, codEligible: false, codBreakdown: null, deliveryEstimate: "2 days" }] })],
  ["reconciliation", (enabled: boolean) => createElement(ShipmentReconciliationPanel, { fixtureEnabled: enabled, shipmentId: "shipment" })],
  ["unpaid recovery", (enabled: boolean) => createElement(ShipmentUnpaidRecoveryPanel, { fixtureEnabled: enabled, shipmentId: "shipment" })],
] as const;
function confirmation(html: string) {
  const input = html.match(/<input\b[^>]*name="confirmation"[^>]*>/)?.[0];
  expect(input).toBeDefined();
  expect(input).toContain('type="checkbox"');
  expect(input).toContain('required=""');
  expect(input).toContain('value="confirmed"');
  expect(input).not.toContain('aria-hidden="true"');
  const id = input!.match(/\bid="([^"]+)"/)?.[1];
  expect(id).toBeTruthy();
  expect(html).toMatch(new RegExp(`<label[^>]*for="${id}"[^>]*>`));
  return input!;
}

describe("required confirmation controls", () => {
  beforeEach(() => { state.selected = "service"; state.pending = false; });
  it.each(cases)("keeps %s native, labelled and subject to fixture gating", (_name, render) => {
    expect(confirmation(renderToStaticMarkup(render(true)))).not.toContain('disabled=""');
    expect(confirmation(renderToStaticMarkup(render(false)))).toContain('disabled=""');
    state.pending = true;
    expect(confirmation(renderToStaticMarkup(render(true)))).toContain('disabled=""');
  });
  it("keeps issuance consent unavailable until a service is selected", () => {
    state.selected = "";
    expect(confirmation(renderToStaticMarkup(cases[0][1](true)))).toContain('disabled=""');
  });
  it("renders a labelled native required confirmation in the reversal form", () => {
    const html = renderToStaticMarkup(createElement(ReversalActionPanel, {
      action: async () => ({}), amountLabel: "Rp10.000", entryType: "COD_PRINCIPAL_COLLECTABLE", entryId: "entry",
      context: { attemptId: "attempt", range: { presetId: "today", timezone: "Asia/Jakarta", startDate: "2026-09-14", lastIncludedDate: "2026-09-14" } },
    }));
    expect(confirmation(html)).not.toContain('disabled=""');
    expect(html).toContain("Saya memahami pembalikan penuh ini.");
  });
});
