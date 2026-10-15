import type { Page } from "playwright";
import type { Issue } from "./types.js";

const PHONE = 768;

/**
 * People may zoom: a viewport tag never forbids it. On a phone, a page has a
 * viewport tag, or the phone shows it as a computer page, shrunk.
 */
export async function checkZoom(page: Page): Promise<Issue[]> {
  const { content, phone } = await page.evaluate((limit) => ({ content: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null, phone: window.innerWidth < limit }), PHONE);
  if (content === null) return phone ? [{ message: "no viewport tag: a phone shows the page as a shrunken computer page (<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">)" }] : [];
  const said: string[] = [];
  const scalable = /user-scalable\s*=\s*(no|0)\b/i.exec(content);
  if (scalable) said.push(scalable[0].replace(/\s/g, ""));
  const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(content);
  if (max && Number(max[1]) < 2) said.push(max[0].replace(/\s/g, ""));
  return said.length ? [{ message: `the page forbids zooming (${said.join(", ")}): let people zoom` }] : [];
}
