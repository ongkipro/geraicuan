/**
 * Opens the browser print dialog for one group of sheets (spec 17 UX-v3.9: label and
 * invoice media differ, so a view holding both prints them as two jobs). The group is
 * set on `<html data-print-group>`; `invoice.css` hides the other group while printing.
 *
 * An 80 mm roll has no fixed length, and `@page size` takes no `auto` height, so each
 * roll sheet gets its own named page sized to its measured height for this job.
 */
export type PrintGroup = "label" | "invoice";

const MM_PER_CSS_PX = 25.4 / 96;

export function rollPageHeightMm(heightPx: number) {
  return Math.ceil(heightPx * MM_PER_CSS_PX) + 2;
}

export function printGroup(group: PrintGroup) {
  const root = document.documentElement;
  const rolls = group === "invoice"
    ? Array.from(document.querySelectorAll<HTMLElement>('.invoice-sheet[data-medium="80mm"]'))
    : [];
  const style = document.createElement("style");
  style.textContent = rolls.map((sheet, index) => {
    const name = `invoice-roll-${index}`;
    sheet.style.setProperty("page", name);
    return `@page ${name} { size: 80mm ${rollPageHeightMm(sheet.offsetHeight)}mm; margin: 0; }`;
  }).join("\n");
  document.head.append(style);
  root.dataset.printGroup = group;

  const cleanup = () => {
    delete root.dataset.printGroup;
    style.remove();
    for (const sheet of rolls) sheet.style.removeProperty("page");
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
