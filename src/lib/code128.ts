/**
 * Code 128 subset B, enough to put a provider AWB under a thermal scanner.
 *
 * Each entry is one symbol as alternating bar/space widths in modules, bar first.
 * Every symbol is 11 modules and its bars sum to an even number (the stop symbol
 * is 13); `tests/label-thermal.integration.test.ts` checks both properties for
 * all 107 entries, so a mistyped row cannot pass silently.
 */
export const CODE128_PATTERNS = [
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
] as const;

const START_B = 104;
const STOP = 106;
/** ISO/IEC 15417 minimum quiet zone on each side, in modules. */
export const CODE128_QUIET_ZONE_MODULES = 10;

export type Code128Bars = {
  /** Symbol values including start, check and stop. */
  values: number[];
  /** Bars as [startModule, widthModules], measured from the left edge of the quiet zone. */
  bars: Array<[number, number]>;
  /** Total width including both quiet zones. */
  modules: number;
};

/** Encodes printable ASCII (32–126); returns null for anything else or an empty value. */
export function encodeCode128B(text: string): Code128Bars | null {
  if (text.length === 0) return null;
  const values = [START_B];
  for (const character of text) {
    const code = character.codePointAt(0) as number;
    if (code < 32 || code > 126) return null;
    values.push(code - 32);
  }
  const check = values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  values.push(check, STOP);

  const bars: Array<[number, number]> = [];
  let cursor = CODE128_QUIET_ZONE_MODULES;
  for (const value of values) {
    const widths = CODE128_PATTERNS[value];
    for (let index = 0; index < widths.length; index += 1) {
      const width = Number(widths[index]);
      if (index % 2 === 0) bars.push([cursor, width]);
      cursor += width;
    }
  }
  return { bars, modules: cursor + CODE128_QUIET_ZONE_MODULES, values };
}
