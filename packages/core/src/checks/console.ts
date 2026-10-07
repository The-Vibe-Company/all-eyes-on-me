import type { Page } from "playwright";
import type { Issue } from "./types.js";

/**
 * Starts listening to the page's console. Call it before navigating; the
 * returned function gives every error logged or thrown so far.
 */
export function watchConsole(page: Page): () => Issue[] {
  const issues: Issue[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") issues.push({ message: `console error: ${message.text()}` });
  });
  page.on("pageerror", (error) => {
    issues.push({ message: `uncaught exception: ${error.message}` });
  });
  return () => [...issues];
}
