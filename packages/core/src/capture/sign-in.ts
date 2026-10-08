import { chromium, type Browser, type BrowserContext } from "playwright";

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
    const response = await page.goto(origin + path, { waitUntil: "networkidle" });
    if (!response || response.status() >= 400) throw new SignInError(`Cannot sign in: ${path} answered ${response?.status() ?? "nothing"}.`);
    for (const label of Object.keys(account)) {
      const field = page.getByLabel(label, { exact: true });
      if ((await field.count()) !== 1) throw new SignInError(`Cannot sign in: ${path} has no single field labelled "${label}".`);
      await field.fill(account[label]!);
    }
    const button = page.getByRole("button", { name: submit, exact: true });
    if ((await button.count()) !== 1) throw new SignInError(`Cannot sign in: ${path} has no single button "${submit}".`);
    await Promise.all([page.waitForLoadState("networkidle"), button.click()]);
    // The sign-in route by its path alone, so a route given with a query still compares.
    const route = new URL(path, origin).pathname;
    await page.waitForURL((u) => u.pathname !== route, { timeout: 5_000 }).catch(() => {});
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
