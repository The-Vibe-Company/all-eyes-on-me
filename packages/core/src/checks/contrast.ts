import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import type { Issue } from "./types.js";

let axeSource: Promise<string> | undefined;

interface AxeNode {
  target: string[];
  any: { data?: { contrastRatio?: number; expectedContrastRatio?: string } }[];
}

/** Text must reach WCAG AA contrast against its background, as axe-core measures it. */
export async function checkContrast(page: Page): Promise<Issue[]> {
  axeSource ??= readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
  await page.addScriptTag({ content: await axeSource });
  const nodes = (await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(context: Document, options: object): Promise<{ violations: { nodes: unknown[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] } });
    return result.violations.flatMap((v) => v.nodes);
  })) as AxeNode[];

  const issues: Issue[] = [];
  for (const node of nodes) {
    const selector = node.target[0]!;
    const text = await page.$eval(selector, (el) => ((el as HTMLElement).innerText || "").trim().replace(/\s+/g, " ").slice(0, 40)).catch(() => "");
    const data = node.any[0]?.data;
    const ratio = data?.contrastRatio ? `${data.contrastRatio}:1, needs ${data.expectedContrastRatio ?? "4.5:1"}` : "below AA";
    issues.push({ element: `${selector}${text ? ` "${text}"` : ""}`, message: `text contrast is ${ratio}` });
  }
  return issues;
}
