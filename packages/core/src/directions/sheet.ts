import { readFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright";

export interface SheetItem {
  label: string;
  /** A PNG screenshot. A missing file shows as a cell saying it failed. */
  file: string;
  /** A few words next to the label, such as a journey step's action. */
  caption?: string;
  /** One sentence read under the capture, such as what of the product a direction serves. */
  note?: string;
}

/**
 * Lays screenshots side by side, labelled, and saves the whole sheet as one
 * PNG, so a person or a judge sees every direction at once.
 */
function checkLayout(columns: number, cellWidth: number) {
  if (!Number.isInteger(columns) || columns < 1) throw new Error("columns must be a positive whole number.");
  if (!Number.isInteger(cellWidth) || cellWidth < 1) throw new Error("cellWidth must be a positive whole number of pixels.");
}

/** The sheet's HTML: one labelled cell per item, the whole capture shown. */
export async function sheetHtml(items: SheetItem[], columns = 3, cellWidth = 640): Promise<string> {
  checkLayout(columns, cellWidth);
  const cells = await Promise.all(
    items.map(async ({ label, file, caption, note }) => {
      const image = await readFile(file).then(
        (data) => `<img src="data:image/png;base64,${data.toString("base64")}" alt="">`,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return `<div class="missing">No capture: this direction did not build.</div>`;
        },
      );
      const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      return `<figure data-label="${escape(label)}"><figcaption><b>${escape(label)}</b>${caption ? ` ${escape(caption)}` : ""}</figcaption>${image}${note ? `<p class="note">${escape(note)}</p>` : ""}</figure>`;
    }),
  );
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 24px; background: #1d1d1d; font: 16px/1.4 system-ui, sans-serif; color: #f2f2f2; }
    main { display: grid; grid-template-columns: repeat(${columns}, ${cellWidth}px); gap: 24px; align-items: start; }
    figure { margin: 0; } figcaption { margin-bottom: 8px; } b { font-size: 20px; margin-right: 8px; }
    img { display: block; width: ${cellWidth}px; height: auto; background: #fff; }
    .missing { height: 200px; display: grid; place-items: center; background: #3a2222; color: #ffb4b4; }
    .note { margin: 10px 0 0; font-size: 18px; line-height: 1.4; color: #f2f2f2; }
  </style><main>${cells.join("")}</main>`;
}

/**
 * Lays screenshots side by side, labelled, each shown whole, and saves the
 * sheet as one PNG, so a person or a judge sees every direction at once.
 */
export async function contactSheet({ out, items, columns = 3, cellWidth = 640, browser: open }: { out: string; items: SheetItem[]; columns?: number; cellWidth?: number; browser?: Browser }): Promise<void> {
  checkLayout(columns, cellWidth);
  const html = await sheetHtml(items, columns, cellWidth);
  // A browser already open renders the sheet in a page of its own; otherwise one is launched and closed.
  const browser = open ?? (await chromium.launch());
  try {
    // A short viewport, so the full-page shot is as tall as the sheet and no taller.
    const page = await browser.newPage({ viewport: { width: columns * cellWidth + (columns - 1) * 24 + 48, height: 100 } });
    try {
      await page.setContent(html);
      // Every image decoded before the shot; Chromium can still refuse a shot now and then, so try once more.
      await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))));
      await page.screenshot({ path: out, fullPage: true }).catch(async () => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: out, fullPage: true });
      });
    } finally {
      await page.close();
    }
  } finally {
    if (!open) await browser.close();
  }
}
