/**
 * One label per money quantity (T-261/T-265/T-269/T-270). Kept free of imports so plain-node
 * scripts (the local seed) can load it through `payment-method.ts` without the `@/` alias,
 * and so `payment-method` ↔ `shipment-money` is not an import cycle.
 */
export const MONEY_LABELS = {
  collect: "Ditagih ke penerima",
  noCollect: "Tidak ada tagihan ke penerima",
  goods: "Nilai barang",
  // T-265 (critique P2): the buyer-paid and the Mengantar-paid shipping read as two different sums.
  chargedShipping: "Ongkir ditagih ke penerima",
  codFee: "Biaya COD (termasuk PPN)",
  rounding: "Pembulatan",
  shippingCost: "Ongkir dibayar ke Mengantar",
  estimate: "Estimasi cair",
  insurance: "Asuransi Mengantar",
  // T-270 (owner 2026-10-01): the customer-facing shipping — what is collected less Nilai barang
  // (CUSTOMER-ONGKIR-IDR). The fee and rounding live inside it; they are never shown apart.
  customerOngkir: "Ongkir",
} as const;
