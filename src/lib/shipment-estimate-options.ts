import "server-only";

import { calculateCodAmountsOrNull } from "@/db/cod-totals-repository";
import { codChargeBreakdown, shippingMengantarDeductsIdr, type CodChargeBreakdown } from "@/lib/mengantar-cod-fee";
import { isMengantarServiceOffered } from "@/lib/mengantar-couriers";
import type { membershipRoles } from "@/lib/domain-enums";
import type { PaymentMethod } from "@/lib/payment-method";
import { codOngkirAmount } from "@/lib/shipment-draft-logic";
import { customerCollectBreakdown } from "@/lib/shipment-money";

/** One service the issuance step offers (moved here from the removed issuance panel, T-208). */
export type ShipmentEstimateOption = {
  /** T-193: `codChargeBreakdown` of the amount confirmation would submit. */
  codBreakdown: CodChargeBreakdown | null;
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  /** T-186: the shipping Mengantar deducts, the COD Ongkir break-even basis. */
  shippingDeductedIdr?: number;
  /**
   * T-271: set only in an Operator's view of a COD or COD Ongkir issuance — what the courier
   * collects and its customer-facing split (CUSTOMER-ONGKIR-IDR); null when there is none.
   */
  customerCharge?: IssuanceCustomerCharge | null;
};

export type IssuanceCustomerCharge = { collectIdr: number; goodsValueIdr: number | null; ongkirIdr: number };

type EstimateService = {
  codEligible: boolean;
  deliveryEstimate: string;
  estimateServiceId: string;
  insuranceAmountIdr: number | null;
  normalPriceIdr: number | null;
  providerService: string;
  shippingAmountIdr: number;
  specialPriceIdr: number | null;
};

/**
 * T-200: the issuance choices for one estimated shipment, shared by the shipment
 * detail and the one-page creation flow so both confirm exactly the same values.
 */
export function buildShipmentEstimateOptions(input: {
  codFormulaRetired: boolean;
  declaredValueIdr: number;
  paymentMethod: PaymentMethod;
  services: readonly EstimateService[];
}): ShipmentEstimateOption[] {
  // D-29: a snapshot stored before Ninja was discontinued may still hold its quote.
  return input.services.filter((service) => isMengantarServiceOffered(service.providerService)).map((service) => {
    // COD only: a COD Ongkir amount is the charge chosen with the service.
    const fullCod = input.paymentMethod === "COD" && service.codEligible && !input.codFormulaRetired;
    // A total past the Postgres integer range fails closed as "COD not available", never as a route error.
    const amounts = fullCod ? calculateCodAmountsOrNull(input.declaredValueIdr, service.shippingAmountIdr) : null;
    return {
      codBreakdown: amounts ? codChargeBreakdown(amounts) : null,
      codEligible: service.codEligible && (!fullCod || amounts !== null),
      deliveryEstimate: service.deliveryEstimate,
      estimateServiceId: service.estimateServiceId,
      insuranceAmountIdr: service.insuranceAmountIdr,
      providerService: service.providerService,
      shippingAmountIdr: service.shippingAmountIdr,
      shippingDeductedIdr: shippingMengantarDeductsIdr(service),
    };
  });
}

/**
 * T-271 (owner 2026-10-01, D-37/D-38 tiers): the issuance options as the viewer may receive them,
 * decided on the server before render. A Tenant Admin gets them unchanged. An Operator of a COD or
 * COD Ongkir shipment gets, per service, only what is collected and its customer split (Nilai barang
 * + Ongkir, CUSTOMER-ONGKIR-IDR): no `codBreakdown` (Biaya COD, Pembulatan, the charged shipping),
 * no `shippingDeductedIdr`, and the quote price replaced by the customer Ongkir, so neither the
 * HTML nor the RSC payload lets the fee be derived. Non-COD is unchanged for both roles (nothing is
 * collected; the list price is what the gerai charges at the counter).
 */
export function issuanceOptionsForRole(
  options: ShipmentEstimateOption[],
  paymentMethod: PaymentMethod,
  role: (typeof membershipRoles)[number],
): ShipmentEstimateOption[] {
  if (role === "TENANT_ADMIN" || paymentMethod === "NON_COD") return options;
  return options.map((option) => {
    const collectIdr = paymentMethod === "COD"
      ? option.codBreakdown?.providerCodAmountIdr ?? null
      : codOngkirAmount(option.shippingDeductedIdr)?.chargeIdr ?? null;
    const split = customerCollectBreakdown({ codCharge: option.codBreakdown, paymentMethod, providerCodAmountIdr: collectIdr });
    const customerCharge = split && collectIdr !== null
      ? { collectIdr, goodsValueIdr: split.goodsValueIdr, ongkirIdr: split.ongkirIdr }
      : null;
    return {
      codBreakdown: null,
      codEligible: option.codEligible,
      customerCharge,
      deliveryEstimate: option.deliveryEstimate,
      estimateServiceId: option.estimateServiceId,
      insuranceAmountIdr: option.insuranceAmountIdr,
      providerService: option.providerService,
      // No quote price beside a customer Ongkir: the difference would be the fee.
      shippingAmountIdr: customerCharge?.ongkirIdr ?? option.shippingAmountIdr,
    };
  });
}
