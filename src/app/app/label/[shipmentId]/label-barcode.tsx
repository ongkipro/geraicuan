import { encodeCode128B } from "@/lib/code128";
import { THERMAL } from "@/lib/label-size";

/** One dot of a 203 dpi head. */
const DOT_MM = THERMAL.barcodeModuleMm / 2;

/** Whether an AWB fits as a Code 128 B symbol, quiet zones included, at 2 dots per module. */
export function awbBarcodeFits(awb: string) {
  const symbol = encodeCode128B(awb);
  return symbol !== null && symbol.modules * THERMAL.barcodeModuleMm <= THERMAL.contentWidthMm;
}

/**
 * Code 128 B with its quiet zones drawn inside the SVG box, so the box itself is the
 * keep-clear area. Returns null when the AWB cannot be encoded or would not fit; the
 * human-readable AWB below it always prints.
 */
// lazy: 2-dot Code 128 B fits AWBs up to 29 characters in 94 mm; longer ones print text only — add subset C or a 2D code if a courier ever issues one.
/**
 * T-255: `fill` widens the module to the largest whole number of dots (4, 3, then 2) that
 * keeps the symbol, quiet zones included, inside the 94 mm content width. A wider module
 * scans more easily at arm's length; the encoded value and the quiet zone in modules are
 * unchanged, and a whole-dot module keeps every bar edge on the head's dot grid.
 */
export function LabelBarcode({ fill = false, value, heightMm }: { fill?: boolean; value: string; heightMm: number }) {
  if (!awbBarcodeFits(value)) return null;
  const symbol = encodeCode128B(value);
  if (!symbol) return null;
  const moduleMm = fill
    ? [4, 3, 2].map((dots) => dots * DOT_MM).find((mm) => symbol.modules * mm <= THERMAL.contentWidthMm) ?? THERMAL.barcodeModuleMm
    : THERMAL.barcodeModuleMm;
  return (
    <svg
      aria-hidden="true"
      className="label-barcode"
      data-modules={symbol.modules}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      style={{ height: `${heightMm}mm`, width: `${symbol.modules * moduleMm}mm` }}
      viewBox={`0 0 ${symbol.modules} 1`}
    >
      {symbol.bars.map(([x, width]) => (
        <rect fill="#000" height="1" key={x} width={width} x={x} y="0" />
      ))}
    </svg>
  );
}
