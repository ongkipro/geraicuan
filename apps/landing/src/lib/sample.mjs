// Sanitized sample data and the two pieces of CMS arithmetic the page illustrates.
// This site builds on its own (D-11), so it copies rather than imports; each copy
// names its source, and scripts/ui-audit/landing-page.mjs checks the rendered
// numbers against the formula independently.

/** Code 128 B symbol table, copied from src/lib/code128.ts (T-176). */
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const QUIET_ZONE_MODULES = 10;

/** Encodes printable ASCII as Code 128 B: bars as [x, width] in modules, quiet zones included. */
export function encodeCode128B(text) {
  const values = [104];
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128 B cannot encode ${JSON.stringify(character)}`);
    values.push(code - 32);
  }
  values.push(values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103, 106);
  const bars = [];
  let cursor = QUIET_ZONE_MODULES;
  for (const value of values) {
    const widths = CODE128_PATTERNS[value];
    for (let index = 0; index < widths.length; index += 1) {
      if (index % 2 === 0) bars.push([cursor, Number(widths[index])]);
      cursor += Number(widths[index]);
    }
  }
  return { bars, modules: cursor + QUIET_ZONE_MODULES };
}

/**
 * PR-9 / T-175, as src/db/cod-totals-repository.ts and src/lib/mengantar-cod-fee.ts
 * compute it: the smallest whole-rupiah COD that still covers goods + shipping after
 * Mengantar keeps 3.33% of it. Integer arithmetic only.
 */
export function codSample(goodsIdr, shippingIdr) {
  const base = BigInt(goodsIdr + shippingIdr);
  const cod = Number((base * 10000n + 9666n) / 9667n);
  const mengantarFee = Number((BigInt(cod) * 333n + 5000n) / 10000n); // half-up to a rupiah
  return {
    goodsIdr,
    shippingIdr,
    codIdr: cod,
    // T-193 codChargeBreakdown: one Biaya COD (VAT inside) plus the round-up to a rupiah.
    mengantarFeeIdr: mengantarFee,
    roundingIdr: cod - goodsIdr - shippingIdr - mengantarFee,
    disbursementIdr: cod - shippingIdr - mengantarFee,
  };
}

/**
 * T-186 / D-12 COD Ongkir, as src/lib/mengantar-cod-fee.ts computes it: break-even is the
 * smallest whole-rupiah charge that covers the shipping Mengantar deducts plus 3.33% of the
 * charge; the seller keeps `charge − shipping − round_half_up(3.33% × charge)`.
 */
export function codOngkirSample(shippingIdr, chargeIdr) {
  const breakEven = Math.max(1, Number((BigInt(shippingIdr) * 10000n + 9666n) / 9667n));
  if (chargeIdr < breakEven) throw new Error(`COD Ongkir sample charge ${chargeIdr} is below break-even ${breakEven}`);
  const feeOf = (charge) => Number((BigInt(charge) * 333n + 5000n) / 10000n);
  return {
    shippingIdr,
    breakEvenIdr: breakEven,
    chargeIdr,
    mengantarFeeIdr: feeOf(chargeIdr),
    sellerDifferenceIdr: chargeIdr - shippingIdr - feeOf(chargeIdr),
  };
}

export const COD_ONGKIR_SAMPLE = codOngkirSample(15_000, 20_000);

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
/** Same formatter as src/lib/label-format.ts formatIdr. */
export const formatIdr = (value) => idr.format(value);

/** Obviously fictional label content: no real person, phone, address or AWB. */
export const SAMPLE_LABEL = {
  courier: "Shopee Express",
  awb: "SPXID0000000001",
  publicReference: "GC-CONTOH01",
  recipientName: "Ibu Contoh",
  recipientPhone: "0812-0000-0000",
  recipientArea: "Coblong, Kota Bandung",
  recipientAddress: "Jl. Contoh No. 1, RT 01/RW 02",
  senderName: "Gerai Contoh",
  outletName: "Outlet Contoh",
  content: "Pakaian",
  weight: "1 kg",
  cod: codSample(100_000, 15_000),
};
