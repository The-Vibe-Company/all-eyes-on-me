import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium, type Locator, type Page, type Request } from "playwright";
import { DEFAULT_WIDTHS, scrollThrough } from "../capture/capture.js";
import type { SignedIn } from "../capture/sign-in.js";
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

/**
 * A call the app made to its own server during a journey: its method, its
 * route, and the names, never the values, of what it sent.
 */
export interface ServerCall {
  method: string;
  path: string;
  /** The names of the query parameters. */
  query: string[];
  /** The names of the fields in the body: form fields, or a JSON object's keys. */
  fields: string[];
}

export interface JourneyRun {
  width: number;
  steps: StepResult[];
  /** Every call the app made to its own server, each once: fetches, and forms it sent. */
  calls: ServerCall[];
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
  /** What a signed-in browser keeps: every journey but those marked signedOut starts signed in. */
  signedIn?: SignedIn;
  /** The sign-in account's values by field label, for fill steps that take theirs from it. Never reported. */
  account?: Record<string, string>;
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
async function resolve(page: Page, target: Target, { field = false } = {}): Promise<Locator> {
  let scope: Page | Locator = page;
  if (target.within) {
    // A container's name holds all its text, such as "Lampe Ajouter" for a row: match a part of it.
    const container = page.getByRole(target.within.role as Parameters<Page["getByRole"]>[0], { name: target.within.name });
    await container.first().waitFor({ state: "attached", timeout: STEP_TIMEOUT }).catch(() => {});
    const n = await container.count();
    if (n !== 1) throw new StepFailure(n === 0 ? `no ${target.within.role} "${target.within.name}" to look in` : `${n} elements match ${target.within.role} "${target.within.name}"`);
    scope = container;
  }
  // A field is named by its label's text: take the field that label names when there is exactly one.
  if (field && "text" in target) {
    const labelled = scope.getByLabel(target.text, { exact: true }).filter({ visible: true });
    if ((await labelled.count()) === 1) return labelled;
  }
  // Text can match hidden copies, such as a menu kept for another width: only what is visible counts.
  const found = "text" in target ? scope.getByText(target.text, { exact: true }).filter({ visible: true }) : scope.getByRole(target.role as Parameters<Page["getByRole"]>[0], { name: target.name, exact: true });
  await found.first().waitFor({ state: "attached", timeout: STEP_TIMEOUT }).catch(() => {});
  const n = await found.count();
  if (n === 0) throw new StepFailure(`no ${describeTarget(target)} on the screen`);
  if (n > 1) throw new StepFailure(`${n} elements match ${describeTarget(target)}: name its container with "within"`);
  return found;
}

/** Where the app lives: its origin and the path it is served under, empty at the root. */
interface App {
  origin: string;
  base: string;
}

/** The route of a URL inside the app, as journeys write it: the app's base path left out, its query kept. */
function routeOf(app: App, url: string): string {
  if (!url.startsWith("http")) return "";
  const { pathname, search } = new URL(url);
  const path = app.base && pathname.startsWith(app.base) ? pathname.slice(app.base.length) || "/" : pathname;
  return path + search;
}

/** Whether a navigation loads a whole page, in this tab or a new one, rather than a frame inside a page. */
function topLevel(request: Request): boolean {
  try {
    return request.frame().parentFrame() === null;
  } catch {
    // A new tab has no frame yet when its first request leaves: it is a page of its own.
    return true;
  }
}

/** A route as `lands` compares it: with its query only when `lands` gives one. */
const sameRoute = (route: string, lands: string) => (lands.includes("?") ? route : route.split("?")[0]) === lands;

/** Takes one step. Returns the field it filled from the sign-in account, so captures can hide its value. */
async function act(page: Page, app: App, step: Step, account: Record<string, string>): Promise<Locator | null> {
  switch (step.do) {
    case "open":
      await page.goto(app.origin + app.base + step.path, { waitUntil: "networkidle", timeout: 15_000 });
      return null;
    case "click":
      await (await resolve(page, step.target)).click({ timeout: STEP_TIMEOUT });
      return null;
    case "fill": {
      const value = typeof step.value === "string" ? step.value : account[step.value.account];
      if (value === undefined) throw new StepFailure(`the sign-in account has no field "${(step.value as { account: string }).account}"`);
      const field = await resolve(page, step.target, { field: true });
      await field.fill(value, { timeout: STEP_TIMEOUT });
      return typeof step.value === "string" ? null : field;
    }
    case "press":
      await page.keyboard.press(step.key);
      return null;
    case "see":
      await page
        .getByText(step.text)
        .filter({ visible: true })
        .first()
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT })
        .catch(() => {
          throw new StepFailure(`"${step.text}" is not on the screen`);
        });
      return null;
  }
}

/** The names of the fields a request sends, from a JSON object, a form, or a multipart body; never their values. */
function fieldNames(body: string | null): string[] {
  if (!body) return [];
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return Object.keys(parsed).sort();
    return [];
  } catch {
    const multipart = [...body.matchAll(/name="([^"]+)"/g)].map((m) => m[1]!);
    if (multipart.length) return [...new Set(multipart)].sort();
    return [...new Set(new URLSearchParams(body).keys())].filter(Boolean).sort();
  }
}

async function replayOne(page: Page, app: App, journey: Journey, width: number, outDir: string, account: Record<string, string>): Promise<Omit<JourneyRun, "sheet">> {
  const { origin } = app;
  let status: number | null = null;
  let leftFor: string | null = null;
  const dialogs: string[] = [];
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) status = response.status();
  });
  const calls = new Map<string, ServerCall>();
  page.on("request", (request) => {
    const target = new URL(request.url());
    const sent = ["fetch", "xhr"].includes(request.resourceType()) || (request.isNavigationRequest() && request.method() !== "GET");
    if (target.origin !== origin || !sent) return;
    const call: ServerCall = { method: request.method(), path: target.pathname, query: [...new Set(target.searchParams.keys())].sort(), fields: fieldNames(request.postData()) };
    calls.set(JSON.stringify(call), call);
  });
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept().catch(() => {});
  });
  // Every page of the context, so a link that opens a new tab outside the app is caught too.
  await page.context().route("**/*", (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && topLevel(request) && new URL(request.url()).origin !== origin) {
      leftFor = request.url();
      return route.abort();
    }
    return route.continue();
  });

  const steps: StepResult[] = [];
  const secret: Locator[] = [];
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
      const filled = await act(page, app, step, account);
      if (filled) secret.push(filled);
      if (lands) await page.waitForURL((u) => sameRoute(routeOf(app, u.href), lands), { timeout: STEP_TIMEOUT }).catch(() => {});
      else if (navigated) await navigated;
      await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT }).catch(() => {});
    } catch (error) {
      reason = error instanceof StepFailure ? error.message : (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
    }
    const route = routeOf(app, page.url());
    const path = route.split("?")[0]!;
    // Leaving the app aborts the navigation, which can surface as an error: say where it went instead.
    if (leftFor) reason = `left the app for ${leftFor}`;
    if (!reason && status !== null && status >= 400) reason = `the page answered ${status}`;
    if (!reason && lands && !sameRoute(route, lands)) reason = `landed on ${(lands.includes("?") ? route : path) || "nothing"}, not ${lands}`;

    const capture = `${journey.slug}@${width}-${String(i + 1).padStart(2, "0")}.png`;
    await scrollThrough(page).catch(() => {});
    // A field filled from the sign-in account shows as a block, never its value.
    const shot = await page.screenshot({ path: join(outDir, capture), fullPage: true, mask: secret }).then(() => capture, () => null);
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
  const made = [...calls.values()].sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
  return { width, steps, calls: made, screens, counts: { steps: steps.length, screens: screens.length, back }, broken };
}

/**
 * Replays each journey in a fresh browser at each width, capturing the screen
 * after every step, and stops a journey at the step it cannot take. Writes the
 * captures, one sheet per journey and width, and `report.json` to `outDir`.
 */
export async function replayJourneys({ url, journeys, outDir, widths = DEFAULT_WIDTHS, reset, signedIn, account = {} }: ReplayOptions): Promise<JourneyReport> {
  const root = new URL(url);
  const app: App = { origin: root.origin, base: root.pathname.replace(/\/+$/, "") };
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
        const state = signedIn && !journey.signedOut ? { storageState: signedIn } : {};
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 800 }, ...state });
        let run: Omit<JourneyRun, "sheet">;
        try {
          run = await replayOne(await context.newPage(), app, journey, width, outDir, account);
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
