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

/** What a person fills: a text field, a text area, a list; never a hidden, disabled, checkbox, radio, file or button input. */
const FIELD = "self::input[not(@disabled)][not(@type) or not(contains(' hidden submit button checkbox radio file image reset ', concat(' ', translate(@type, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), ' ')))] or self::textarea[not(@disabled)] or self::select[not(@disabled)]";

/**
 * The fields a person would fill under this label, by the first of these
 * that finds any on the screen: the field the label names; the only field in
 * the box that holds a label with this text (a label after its field
 * included), or the field right after that label or its box; the field whose
 * placeholder, then whose name, is this text. It never reaches beyond the
 * label's box and its next sibling, and never counts a field off the screen,
 * such as a trap for robots. Null when none finds any.
 */
export async function findFields(scope: Page | Locator, label: string): Promise<{ fields: Locator; onScreen: number[] } | null> {
  const text = xpathLiteral(label.trim());
  const name = label.replace(/["\\]/g, "\\$&");
  const tries = [
    scope.getByLabel(label, { exact: true }),
    scope.locator(`xpath=.//label[normalize-space(.)=${text}]/ancestor::*[position()<=3][count(.//*[${FIELD}])=1][1]//*[${FIELD}]`),
    scope.locator(`xpath=.//label[normalize-space(.)=${text}]/ancestor-or-self::*[position()<=2][following-sibling::*[1][${FIELD}]][1]/following-sibling::*[1]`),
    scope.getByPlaceholder(label, { exact: true }),
    scope.locator(`input[name="${name}" i], textarea[name="${name}" i], select[name="${name}" i]`),
  ];
  for (const found of tries) {
    const onScreen = await found.evaluateAll((els) =>
      els.flatMap((el, i) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const seen = box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > -window.scrollY && box.left < document.documentElement.scrollWidth && style.visibility !== "hidden" && !el.closest("[aria-hidden='true']");
        return seen ? [i] : [];
      }),
    );
    if (onScreen.length) return { fields: found, onScreen };
  }
  return null;
}

/** The one field a person would fill under this label, as findFields finds them; null when there is none, or more than one to tell apart. */
export async function findField(scope: Page | Locator, label: string): Promise<Locator | null> {
  const found = await findFields(scope, label);
  return found && found.onScreen.length === 1 ? found.fields.nth(found.onScreen[0]!) : null;
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
  const { hostname, protocol } = new URL(url);
  const now = Date.now() / 1000;
  // As browser extensions export them too: sameSite in any case or "no_restriction", expirationDate in seconds.
  const SAME_SITE: Record<string, Cookie["sameSite"]> = { lax: "Lax", strict: "Strict", none: "None", no_restriction: "None" };
  const cookies = (raw as (Partial<Cookie> & { expirationDate?: number; sameSite?: string | null })[]).map((c) => {
    const sameSite = SAME_SITE[String(c.sameSite ?? "").toLowerCase()] ?? "Lax";
    const expires = typeof c.expires === "number" && c.expires > 0 ? c.expires : typeof c.expirationDate === "number" && c.expirationDate > 0 ? c.expirationDate : -1;
    if (expires > 0 && expires < now) throw new SignInError(`A cookie of the session given has expired: save a new session.`);
    const secure = c.secure === true || protocol === "https:" || sameSite === "None" || /^__(Secure|Host)-/.test(c.name!);
    return { name: c.name!, value: c.value!, domain: c.domain ?? hostname, path: c.path ?? "/", expires, httpOnly: c.httpOnly === true, secure, sameSite };
  });
  const origins = !Array.isArray(parsed) && Array.isArray((parsed as SignedIn).origins) ? (parsed as SignedIn).origins : [];
  if (!cookies.length && !origins.length) throw new SignInError("The session given holds no cookie and no storage: AEOM would capture signed out.");
  return { cookies, origins };
}

/** The session, once a browser has taken it; a SignInError that names no value when a browser refuses one of its cookies, its domain or its path. */
export async function usableSession(signedIn: SignedIn): Promise<SignedIn> {
  const browser = await chromium.launch();
  try {
    await (await browser.newContext({ storageState: signedIn })).close();
    return signedIn;
  } catch {
    throw new SignInError("A cookie of the session given cannot be set in a browser: check its domain, its path and its sameSite.");
  } finally {
    await browser.close();
  }
}
