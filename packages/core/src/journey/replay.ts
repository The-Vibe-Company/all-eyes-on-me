import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium, type Locator, type Page } from "playwright";
import { DEFAULT_WIDTHS, scrollThrough } from "../capture/capture.js";
import { contactSheet } from "../directions/sheet.js";
import { describeStep, type Journey, type Step, type Target } from "./journey.js";

export interface StepResult {
  /** 1 for the first step. */
  index: number;
  /** The step in words: `click link "Commandes"`. */
  action: string;
  /** The route the page is on after the step. */
  path: string;
  /** The screenshot after the step, relative to the output folder. */
  capture: string | null;
  /** What the page said in a dialog during the step, such as an alert. */
  dialog?: string;
}

export interface JourneyRun {
  width: number;
  steps: StepResult[];
  /** The routes the journey went through, in the order it first reached them. */
  screens: string[];
  counts: { steps: number; screens: number; back: number };
  /** Where and why the journey could not go on; null when it went to the end. */
  broken: { step: number; reason: string } | null;
  /** One image with every step's capture in order, relative to the output folder. */
  sheet: string;
}

export interface JourneyReplay {
  slug: string;
  name: string;
  runs: JourneyRun[];
}

export interface JourneyReport {
  url: string;
  replayedAt: string;
  widths: number[];
  journeys: JourneyReplay[];
  warnings: string[];
}

export interface ReplayOptions {
  url: string;
  journeys: Journey[];
  outDir: string;
  widths?: number[];
  /** A shell command that puts the app's data back as it was, run before each journey at each width. */
  reset?: string;
}

/** The replay cannot go on, such as a reset command that fails. The message says why. */
export class ReplayError extends Error {}

/** A step the app does not let the user take. The message says why, in the user's terms. */
class StepFailure extends Error {}

const STEP_TIMEOUT = 5_000;

function describeTarget(target: Target): string {
  return describeStep({ do: "click", target }).replace(/^click /, "");
}

/** The one element a target names, or a StepFailure saying there is none or several. */
async function resolve(page: Page, target: Target): Promise<Locator> {
  let scope: Page | Locator = page;
  if (target.within) {
    // A container's name holds all its text, such as "Lampe Ajouter" for a row: match a part of it.
    const container = page.getByRole(target.within.role as Parameters<Page["getByRole"]>[0], { name: target.within.name });
    await container.first().waitFor({ state: "attached", timeout: STEP_TIMEOUT }).catch(() => {});
    const n = await container.count();
    if (n !== 1) throw new StepFailure(n === 0 ? `no ${target.within.role} "${target.within.name}" to look in` : `${n} elements match ${target.within.role} "${target.within.name}"`);
    scope = container;
  }
  const found = "text" in target ? scope.getByText(target.text, { exact: true }) : scope.getByRole(target.role as Parameters<Page["getByRole"]>[0], { name: target.name, exact: true });
  await found.first().waitFor({ state: "attached", timeout: STEP_TIMEOUT }).catch(() => {});
  const n = await found.count();
  if (n === 0) throw new StepFailure(`no ${describeTarget(target)} on the screen`);
  if (n > 1) throw new StepFailure(`${n} elements match ${describeTarget(target)}: name its container with "within"`);
  return found;
}

async function act(page: Page, origin: string, step: Step): Promise<void> {
  switch (step.do) {
    case "open":
      await page.goto(origin + step.path, { waitUntil: "networkidle", timeout: 15_000 });
      return;
    case "click":
      await (await resolve(page, step.target)).click({ timeout: STEP_TIMEOUT });
      return;
    case "fill":
      await (await resolve(page, step.target)).fill(step.value, { timeout: STEP_TIMEOUT });
      return;
    case "press":
      await page.keyboard.press(step.key);
      return;
    case "see":
      await page
        .getByText(step.text)
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .catch(() => {
          throw new StepFailure(`"${step.text}" is not on the screen`);
        });
  }
}

const pathOf = (url: string) => (url.startsWith("http") ? new URL(url).pathname : "");

async function replayOne(page: Page, origin: string, journey: Journey, width: number, outDir: string): Promise<Omit<JourneyRun, "sheet">> {
  let status: number | null = null;
  let leftFor: string | null = null;
  const dialogs: string[] = [];
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) status = response.status();
  });
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept().catch(() => {});
  });
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).origin !== origin) {
      leftFor = request.url();
      return route.abort();
    }
    return route.continue();
  });

  const steps: StepResult[] = [];
  let broken: JourneyRun["broken"] = null;
  for (const [i, step] of journey.steps.entries()) {
    status = null;
    leftFor = null;
    const heard = dialogs.length;
    const lands = "lands" in step ? step.lands : undefined;
    // Only a click or a key can take the page elsewhere; other steps do not wait for it.
    const mayNavigate = step.do === "click" || step.do === "press";
    const navigated = mayNavigate ? page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame(), timeout: lands ? STEP_TIMEOUT : 1_000 }).catch(() => null) : null;
    let reason: string | null = null;
    try {
      await act(page, origin, step);
      if (lands) await page.waitForURL((u) => u.pathname === lands, { timeout: STEP_TIMEOUT }).catch(() => {});
      else if (navigated) await navigated;
      await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT }).catch(() => {});
    } catch (error) {
      reason = error instanceof StepFailure ? error.message : (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
    }
    const path = pathOf(page.url());
    // Leaving the app aborts the navigation, which can surface as an error: say where it went instead.
    if (leftFor) reason = `left the app for ${leftFor}`;
    if (!reason && status !== null && status >= 400) reason = `the page answered ${status}`;
    if (!reason && lands && path !== lands) reason = `landed on ${path || "nothing"}, not ${lands}`;

    const capture = `${journey.slug}@${width}-${String(i + 1).padStart(2, "0")}.png`;
    await scrollThrough(page).catch(() => {});
    const shot = await page.screenshot({ path: join(outDir, capture), fullPage: true }).then(() => capture, () => null);
    const result: StepResult = { index: i + 1, action: describeStep(step), path, capture: shot };
    if (dialogs.length > heard) result.dialog = dialogs.slice(heard).join(" / ");
    steps.push(result);
    if (reason) {
      broken = { step: i + 1, reason };
      break;
    }
  }

  const visited = steps.map((s) => s.path).filter(Boolean);
  const screens = [...new Set(visited)];
  const back = visited.filter((path, i) => i > 0 && path !== visited[i - 1] && visited.slice(0, i - 1).includes(path)).length;
  return { width, steps, screens, counts: { steps: steps.length, screens: screens.length, back }, broken };
}

/**
 * Replays each journey in a fresh browser at each width, capturing the screen
 * after every step, and stops a journey at the step it cannot take. Writes the
 * captures, one sheet per journey and width, and `report.json` to `outDir`.
 */
export async function replayJourneys({ url, journeys, outDir, widths = DEFAULT_WIDTHS, reset }: ReplayOptions): Promise<JourneyReport> {
  const origin = new URL(url).origin;
  await mkdir(outDir, { recursive: true });
  const warnings = reset ? [] : ["No reset command in .aeom/config.json: journeys that change the app's data can differ from one replay to the next."];
  const replays: JourneyReplay[] = [];
  for (const journey of journeys) {
    // A fresh browser for each journey: nothing one journey leaves behind reaches the next.
    const browser = await chromium.launch();
    try {
      const runs: JourneyRun[] = [];
      for (const width of widths) {
        if (reset) {
          await promisify(exec)(reset, { timeout: 60_000 }).catch((error: { stderr?: string; message?: string }) => {
            throw new ReplayError(`The reset command failed before "${journey.name}": ${(error.stderr || error.message || String(error)).trim().split("\n")[0]}`);
          });
        }
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 } });
        let run: Omit<JourneyRun, "sheet">;
        try {
          run = await replayOne(await context.newPage(), origin, journey, width, outDir);
        } finally {
          await context.close();
        }
        const sheet = `${journey.slug}@${width}.png`;
        await contactSheet({
          out: join(outDir, sheet),
          items: run.steps.map((s) => ({ label: String(s.index), note: s.action, file: s.capture ? join(outDir, s.capture) : join(outDir, "missing.png") })),
          columns: Math.min(run.steps.length, 4) || 1,
          cellWidth: width < 768 ? 300 : 480,
          browser,
        });
        runs.push({ ...run, sheet });
      }
      replays.push({ slug: journey.slug, name: journey.name, runs });
    } finally {
      await browser.close();
    }
  }
  const report: JourneyReport = { url, replayedAt: new Date().toISOString(), widths, journeys: replays, warnings };
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}
