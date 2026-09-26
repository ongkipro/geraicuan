import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";

import { confirmShipmentIssuance } from "@/app/app/pengiriman/[shipmentId]/actions";
import { reconcileShipmentUnknownSubmission } from "@/app/app/pengiriman/[shipmentId]/reconciliation-actions";
import { recoverShipmentUnpaidPayment } from "@/app/app/pengiriman/[shipmentId]/unpaid-recovery-actions";
import { checkStaleShipmentOperation } from "@/app/app/pengiriman/[shipmentId]/stale-operation-actions";
import { confirmFixtureBackedShipmentIssuance } from "@/lib/shipment-issuance";
import { reconcileFixtureBackedShipment } from "@/lib/shipment-reconciliation";
import { recoverFixtureBackedShipmentPayment } from "@/lib/shipment-unpaid-recovery";
import { checkShipmentStaleOperation } from "@/db/shipment-stale-operation-repository";
import { UnpaidRecoveryDeniedError } from "@/db/unpaid-recovery-repository";

const fixture = vi.hoisted(() => ({
  issuanceEnabled: false,
  reconciliationEnabled: false,
  recoveryEnabled: false,
  role: "TENANT_ADMIN" as "TENANT_ADMIN" | "OPERATOR",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); } }));
vi.mock("@/db/client", () => ({ db: {}, dbPool: {} }));
vi.mock("@/lib/cms-auth", () => ({
  CmsAuthorizationDeniedError: class CmsAuthorizationDeniedError extends Error {},
  requireCmsScope: vi.fn(async () => ({
    role: fixture.role,
    scope: "tenant" as const,
    tenantId: "00000000-0000-3900-0000-000000000001",
    userId: "t39-action-user",
  })),
}));
vi.mock("@/db/cod-totals-repository", () => ({ CodTotalsUnavailableError: class CodTotalsUnavailableError extends Error {} }));
vi.mock("@/db/order-batch-repository", () => ({ OrderBatchUnavailableError: class OrderBatchUnavailableError extends Error {} }));
vi.mock("@/db/tenant-context", () => ({
  TenantContextDeniedError: class TenantContextDeniedError extends Error {},
  withTenantContext: vi.fn(async (_db, _principalId, tenantId, work) => work({}, {
    role: fixture.role,
    tenantId,
    userId: "t39-action-user",
  })),
}));
vi.mock("@/db/shipment-stale-operation-repository", () => ({
  checkShipmentStaleOperation: vi.fn(),
}));
vi.mock("@/db/unpaid-recovery-repository", () => ({
  UnpaidRecoveryDeniedError: class UnpaidRecoveryDeniedError extends Error {},
  UnpaidRecoveryUnavailableError: class UnpaidRecoveryUnavailableError extends Error {},
}));
vi.mock("@/db/shipment-reconciliation-repository", () => ({
  ShipmentReconciliationDeniedError: class ShipmentReconciliationDeniedError extends Error {},
  ShipmentReconciliationUnavailableError: class ShipmentReconciliationUnavailableError extends Error {},
}));
vi.mock("@/lib/mengantar-order", () => ({ MengantarOrderTransportUnavailableError: class MengantarOrderTransportUnavailableError extends Error {} }));
vi.mock("@/lib/mengantar-unpaid-recovery", () => ({ MengantarUnpaidRecoveryTransportUnavailableError: class MengantarUnpaidRecoveryTransportUnavailableError extends Error {} }));
vi.mock("@/lib/order-rate-limit", () => ({
  OrderRateLimitedError: class OrderRateLimitedError extends Error {},
  UnpaidRecoveryRateLimitedError: class UnpaidRecoveryRateLimitedError extends Error {},
}));
vi.mock("@/lib/sanctioned-order-fixture", () => ({
  isSanctionedOrderFixtureEnabled: () => fixture.issuanceEnabled,
  resolveSanctionedOrderFixtureTransport: vi.fn(),
}));
vi.mock("@/lib/sanctioned-unpaid-recovery-fixture", () => ({
  isSanctionedUnpaidRecoveryFixtureEnabled: () => fixture.recoveryEnabled,
  resolveSanctionedUnpaidRecoveryFixtureTransport: vi.fn(),
  SanctionedUnpaidRecoveryFixtureUnavailableError: class SanctionedUnpaidRecoveryFixtureUnavailableError extends Error {},
}));
vi.mock("@/lib/sanctioned-reconciliation-fixture", () => ({
  isSanctionedReconciliationFixtureEnabled: () => fixture.reconciliationEnabled,
  resolveSanctionedReconciliationFixture: vi.fn(),
  SanctionedReconciliationFixtureUnavailableError: class SanctionedReconciliationFixtureUnavailableError extends Error {},
}));
vi.mock("@/lib/shipment-issuance", () => ({
  confirmFixtureBackedShipmentIssuance: vi.fn(),
  ShipmentIssuanceUnavailableError: class ShipmentIssuanceUnavailableError extends Error {},
}));
vi.mock("@/lib/shipment-unpaid-recovery", () => ({
  recoverFixtureBackedShipmentPayment: vi.fn(),
  ShipmentUnpaidRecoveryReconciliationRequiredError: class ShipmentUnpaidRecoveryReconciliationRequiredError extends Error {},
}));
vi.mock("@/lib/shipment-reconciliation", () => ({
  reconcileFixtureBackedShipment: vi.fn(),
  ShipmentReconciliationResultUnavailableError: class ShipmentReconciliationResultUnavailableError extends Error {},
}));

const shipmentId = "00000000-0000-3902-0000-000000000001";
const snapshotId = "00000000-0000-3904-0000-000000000001";
const serviceId = "00000000-0000-3903-0000-000000000001";

function issuanceForm() {
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  form.set("estimateSnapshotId", snapshotId);
  form.set("estimateServiceId", serviceId);
  form.set("confirmation", "confirmed");
  return form;
}

function confirmationForm() {
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  form.set("confirmation", "confirmed");
  return form;
}

describe("T-39 exported shipment Server Action boundaries", () => {
  beforeEach(() => {
    fixture.issuanceEnabled = false;
    fixture.reconciliationEnabled = false;
    fixture.recoveryEnabled = false;
    fixture.role = "TENANT_ADMIN";
    vi.mocked(confirmFixtureBackedShipmentIssuance).mockReset();
    vi.mocked(reconcileFixtureBackedShipment).mockReset();
    vi.mocked(recoverFixtureBackedShipmentPayment).mockReset();
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(checkShipmentStaleOperation).mockReset();
  });

  it("rejects malformed issuance before any domain side effect", async () => {
    const result = await confirmShipmentIssuance({}, new FormData());
    expect(result.error).toContain("Pilih layanan");
    expect(confirmFixtureBackedShipmentIssuance).not.toHaveBeenCalled();
  });

  it.each([
    ["issuance", confirmShipmentIssuance, issuanceForm],
    ["reconciliation", reconcileShipmentUnknownSubmission, confirmationForm],
    ["unpaid recovery", recoverShipmentUnpaidPayment, confirmationForm],
  ] as const)("rejects missing %s confirmation with otherwise valid identifiers", async (_name, action, buildForm) => {
    fixture.issuanceEnabled = true;
    fixture.reconciliationEnabled = true;
    fixture.recoveryEnabled = true;
    const form = buildForm();
    form.delete("confirmation");
    expect(await action({}, form)).toMatchObject({ error: expect.stringMatching(/centang/i) });
    expect(confirmFixtureBackedShipmentIssuance).not.toHaveBeenCalled();
    expect(reconcileFixtureBackedShipment).not.toHaveBeenCalled();
    expect(recoverFixtureBackedShipmentPayment).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["15rb", "Rp15.000", "15000,5", "1 5000"])("refuses a COD Ongkir charge %j holding a letter or symbol before any domain side effect (T-196)", async (charge) => {
    fixture.issuanceEnabled = true;
    const form = issuanceForm();
    form.set("codShippingChargeIdr", charge);
    await expect(confirmShipmentIssuance({}, form)).resolves.toEqual({
      error: "Ongkir yang ditagih kurir hanya boleh berisi angka.",
    });
    expect(confirmFixtureBackedShipmentIssuance).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps issuance production-gated, then permits an Operator only through the sanctioned fixture", async () => {
    fixture.role = "OPERATOR";
    await expect(confirmShipmentIssuance({}, issuanceForm())).resolves.toEqual({
      error: expect.stringContaining("data uji non-produksi"),
    });
    expect(confirmFixtureBackedShipmentIssuance).not.toHaveBeenCalled();

    fixture.issuanceEnabled = true;
    vi.mocked(confirmFixtureBackedShipmentIssuance).mockResolvedValue({
      awb: "SANITIZED-AWB-T39",
      duplicate: false,
      labelHref: `/app/label/${shipmentId}`,
      shipmentId,
      status: "ISSUED",
    });
    await expect(confirmShipmentIssuance({}, issuanceForm())).resolves.toEqual({
      issued: {
        awb: "SANITIZED-AWB-T39",
        duplicate: false,
        labelHref: `/app/label/${shipmentId}`,
      },
    });
  });

  it("revalidates the detail and queue when issuance becomes unknown", async () => {
    fixture.issuanceEnabled = true;
    vi.mocked(confirmFixtureBackedShipmentIssuance).mockResolvedValue({
      awb: null,
      duplicate: false,
      labelHref: null,
      shipmentId,
      status: "SUBMISSION_UNKNOWN",
    });

    await expect(confirmShipmentIssuance({}, issuanceForm())).resolves.toEqual({
      error: expect.stringContaining("Jangan konfirmasi ulang"),
    });
    // PR-44: the canonical detail URL is the number, so the dynamic route page is revalidated.
    expect(revalidatePath).toHaveBeenCalledWith("/app/pengiriman/[shipmentId]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/app/pengiriman");
  });

  it("denies Operator recovery before the domain resolver and permits fixture-gated Tenant Admin recovery", async () => {
    fixture.recoveryEnabled = true;
    fixture.role = "OPERATOR";
    await expect(recoverShipmentUnpaidPayment({}, confirmationForm())).resolves.toEqual({
      error: "Pemulihan pembayaran hanya tersedia untuk pemilik gerai.",
    });
    expect(recoverFixtureBackedShipmentPayment).not.toHaveBeenCalled();

    fixture.role = "TENANT_ADMIN";
    vi.mocked(recoverFixtureBackedShipmentPayment).mockResolvedValue({
      duplicate: false,
      shipments: [{ awb: "SANITIZED-AWB-T39", labelHref: `/app/label/${shipmentId}`, shipmentId }],
    });
    await expect(recoverShipmentUnpaidPayment({}, confirmationForm())).resolves.toEqual({
      recovered: expect.objectContaining({ duplicate: false }),
    });
  });

  it("denies Operator reconciliation before lookup and returns only the sanctioned authoritative result to Admin", async () => {
    fixture.reconciliationEnabled = true;
    fixture.role = "OPERATOR";
    await expect(reconcileShipmentUnknownSubmission({}, confirmationForm())).resolves.toEqual({
      error: "Rekonsiliasi hasil penyedia hanya tersedia untuk pemilik gerai.",
    });
    expect(reconcileFixtureBackedShipment).not.toHaveBeenCalled();

    fixture.role = "TENANT_ADMIN";
    vi.mocked(reconcileFixtureBackedShipment).mockResolvedValue({
      awb: "SANITIZED-AWB-T39",
      shipmentId,
      status: "ISSUED",
    });
    await expect(reconcileShipmentUnknownSubmission({}, confirmationForm())).resolves.toEqual({
      reconciled: {
        awb: "SANITIZED-AWB-T39",
        labelHref: `/app/label/${shipmentId}`,
        status: "ISSUED",
      },
    });
  });

  it("checks a stale operation through tenant scope without any provider action", async () => {
    vi.mocked(checkShipmentStaleOperation).mockResolvedValue("UPDATED");
    const form = new FormData();
    form.set("shipmentId", shipmentId);

    await expect(checkStaleShipmentOperation({}, form)).resolves.toEqual({
      message: expect.stringContaining("sudah diamankan"),
    });
    expect(checkShipmentStaleOperation).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tenantId: "00000000-0000-3900-0000-000000000001" }),
      shipmentId,
    );
    expect(confirmFixtureBackedShipmentIssuance).not.toHaveBeenCalled();
    expect(recoverFixtureBackedShipmentPayment).not.toHaveBeenCalled();
  });

  it("maps denied and absent stale checks without leaking a route error", async () => {
    vi.mocked(checkShipmentStaleOperation).mockRejectedValueOnce(
      new UnpaidRecoveryDeniedError(),
    );
    const form = new FormData();
    form.set("shipmentId", shipmentId);
    await expect(checkStaleShipmentOperation({}, form)).resolves.toEqual({
      error: "Pemeriksaan state tidak tersedia untuk kiriman ini.",
    });

    vi.mocked(checkShipmentStaleOperation).mockResolvedValueOnce("NOT_APPLICABLE");
    await expect(checkStaleShipmentOperation({}, form)).resolves.toEqual({
      message: "Tidak ada upaya tersendat yang perlu diperbarui.",
    });
  });
});
