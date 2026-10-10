import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { openPage } from "./open.js";

/** What a signed-in browser keeps, cookies and storage, so every capture starts signed in. */
export type SignedIn = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** How to sign in to the app: its sign-in route, the account's fields by label, and the button that sends them. */
export interface SignIn {
  path: string;
  /** Each field's value, by the label the page gives it, such as "Email". Never logged or reported. */
  account: Record<string, string>;
  /** The name of the button that signs in, such as "Se connecter". */
  submit: string;
}

/** How long a sign-in may take before AEOM says it did not work. */
const SIGN_IN_TIMEOUT = 15_000;

/** Signing in did not work. The message names the route and the button, never a value. */
export class SignInError extends Error {}

/**
 * Signs in once, in a browser of its own, as a person would: opens the sign-in
 * route, fills each field by its label, presses the button. Returns what the
 * signed-in browser keeps, for every later capture to start from. Nothing is
 * captured while signing in.
 */
export async function signIn(browser: Browser, url: string, { path, account, submit }: SignIn): Promise<SignedIn> {
  const origin = new URL(url).origin;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const target = new URL(path, origin);
    // The sign-in route by its path alone, so a route given with a query still compares.
    const route = target.pathname;
    const response = await openPage(page, target.href);
    if (!response || response.status() >= 400) throw new SignInError(`Cannot sign in: ${path} answered ${response?.status() ?? "nothing"}.`);
    for (const label of Object.keys(account)) {
      const field = await findField(page, label);
      if (!field) throw new SignInError(`Cannot sign in: ${path} has no single field labelled "${label}", by a label, a label beside it, a placeholder or a name.`);
      await field.fill(account[label]!);
    }
    const button = page.getByRole("button", { name: submit, exact: true });
    if ((await button.count()) !== 1) throw new SignInError(`Cannot sign in: ${path} has no single button "${submit}".`);
    // The app either leaves the sign-in route, or loads it again to say no. A slow sign-in gets the whole timeout.
    const left = page.waitForURL((u) => u.pathname !== route, { timeout: SIGN_IN_TIMEOUT });
    const refused = page.waitForEvent("framenavigated", { predicate: (frame) => frame === page.mainFrame() && new URL(frame.url()).pathname === route, timeout: SIGN_IN_TIMEOUT });
    await button.click();
    await Promise.race([left, refused]).catch(() => {});
    left.catch(() => {});
    refused.catch(() => {});
    // A refused sign-in that reloads its page, then sends on from the browser, gets the whole timeout, never the short wait of a page.
    await page.waitForLoadState("networkidle", { timeout: SIGN_IN_TIMEOUT }).catch(() => {});
    if (new URL(page.url()).pathname === route) throw new SignInError(`Signing in did not work: the app stayed on ${path} after "${submit}". Check the account AEOM was given.`);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

/** Signs in from a browser of its own, closed after. */
export async function signInOnce(url: string, login: SignIn): Promise<SignedIn> {
  const browser = await chromium.launch();
  try {
    return await signIn(browser, url, login);
  } finally {
    await browser.close();
  }
}

/** A string as an XPath literal, whatever quotes it holds. */
function xpathLiteral(text: string): string {
  if (!text.includes("'")) return `'${text}'`;
  if (!text.includes('"')) return `"${text}"`;
  return `concat(${text.split("'").map((part) => `'${part}'`).join(`, "'", `)})`;
}

/**
 * The one visible field a person would fill under this label: the field the
 * label names; else, when the label names none (no `for`, the field not
 * inside it), the first field after a label with this text; else the field
 * whose placeholder, then whose name, is this text. Null when none of these
 * finds exactly one.
 */
export async function findField(scope: Page | Locator, label: string): Promise<Locator | null> {
  const fields = "self::input[not(@type='hidden') and not(@type='submit') and not(@type='button')] or self::textarea or self::select";
  const tries = [
    scope.getByLabel(label, { exact: true }),
    scope.locator(`xpath=.//label[normalize-space(.)=${xpathLiteral(label.trim())}]/following::*[${fields}][1]`),
    scope.getByPlaceholder(label, { exact: true }),
    scope.locator(`input[name="${label.replace(/["\\]/g, "\\$&")}" i], textarea[name="${label.replace(/["\\]/g, "\\$&")}" i], select[name="${label.replace(/["\\]/g, "\\$&")}" i]`),
  ];
  for (const found of tries) {
    const visible = found.filter({ visible: true });
    if ((await visible.count()) === 1) return visible;
  }
  return null;
}

type Cookie = SignedIn["cookies"][number];

/**
 * A signed-in browser from what the user gives instead of an account: a
 * browser's state as Playwright saves it, a list of cookies, or an object
 * holding one, `[{ "name": "session", "value": "…" }]`. A cookie without a
 * domain is the app's. Never says a value.
 */
export function signedInFrom(text: string, url: string): SignedIn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SignInError("The session given is not JSON: give a browser state, or a list of cookies with their name and value.");
  }
  const raw = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as { cookies?: unknown }).cookies : undefined;
  if (!Array.isArray(raw)) throw new SignInError("The session given holds no cookies: give a browser state, or a list of cookies with their name and value.");
  if (raw.some((c) => !c || typeof c !== "object" || typeof (c as Cookie).name !== "string" || typeof (c as Cookie).value !== "string")) throw new SignInError("In the session given, every cookie needs a name and a value.");
  const host = new URL(url).hostname;
  const cookies = (raw as Partial<Cookie>[]).map((c) => ({ path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const, ...c, domain: c.domain ?? host }) as Cookie);
  const origins = !Array.isArray(parsed) && Array.isArray((parsed as SignedIn).origins) ? (parsed as SignedIn).origins : [];
  return { cookies, origins };
}
