import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

export interface SheetItem {
  label: string;
  /** A PNG screenshot. A missing file shows as a cell saying it failed. */
  file: string;
  note?: string;
}

/**
 * Lays screenshots side by side, labelled, and saves the whole sheet as one
 * PNG, so a person or a judge sees every direction at once.
 */
/** The sheet's HTML: one labelled cell per item, the whole capture shown. */
export async function sheetHtml(items: SheetItem[], columns = 3, cellWidth = 640): Promise<string> {
  const cells = await Promise.all(
    items.map(async ({ label, file, note }) => {
      const image = await readFile(file).then(
        (data) => `<img src="data:image/png;base64,${data.toString("base64")}" alt="">`,
        () => `<div class="missing">No capture: this direction did not build.</div>`,
      );
      const escape = (text: string) => text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
      return `<figure data-label="${escape(label)}"><figcaption><b>${escape(label)}</b>${note ? ` ${escape(note)}` : ""}</figcaption>${image}</figure>`;
    }),
  );
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; background: #1d1d1d; font: 16px/1.4 system-ui, sans-serif; color: #f2f2f2; }
    main { display: grid; grid-template-columns: repeat(${columns}, ${cellWidth}px); gap: 24px; align-items: start; }
    figure { margin: 0; } figcaption { margin-bottom: 8px; } b { font-size: 20px; margin-right: 8px; }
    img { display: block; width: ${cellWidth}px; height: auto; background: #fff; }
    .missing { height: 200px; display: grid; place-items: center; background: #3a2222; color: #ffb4b4; }
  </style><main>${cells.join("")}</main>`;
}

/**
 * Lays screenshots side by side, labelled, each shown whole, and saves the
 * sheet as one PNG, so a person or a judge sees every direction at once.
 */
export async function contactSheet({ out, items, columns = 3, cellWidth = 640 }: { out: string; items: SheetItem[]; columns?: number; cellWidth?: number }): Promise<void> {
  if (!Number.isInteger(columns) || columns < 1) throw new Error("columns must be a positive whole number.");
  const html = await sheetHtml(items, columns, cellWidth);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: columns * cellWidth + (columns - 1) * 24 + 48, height: 600 } });
    await page.setContent(html);
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
  }
}
