/** The names of this machine: a call to one of them on a port is a call to the same server. */
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * The base of an API a front built from scratch may call, or null when the
 * address is not one running on this machine: `localhost`, `127.0.0.1`,
 * `[::1]`, or a `.localhost` or `.test` name, over http or https. AEOM
 * touches no real data, so any other address is refused. The check reads the
 * address only: a `.test` name a hosts file sends elsewhere is the user's to
 * keep local.
 */
export function localApiBase(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  if (!LOOPBACK.test(url.hostname) && !/\.(localhost|test)$/.test(url.hostname)) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The same address, with this machine's names on one port as one server. */
const sameServer = (url: URL) => `${url.protocol}//${LOOPBACK.test(url.hostname) ? "loopback" : url.hostname}:${url.port || (url.protocol === "https:" ? "443" : "80")}`;

/** True when a call's address is under the API's base: the same server, and the base's path or below it. */
export function underApi(address: string, base: string): boolean {
  let call: URL, api: URL;
  try {
    call = new URL(address);
    api = new URL(base);
  } catch {
    return false;
  }
  if (sameServer(call) !== sameServer(api)) return false;
  const root = api.pathname.replace(/\/+$/, "");
  return call.pathname === root || call.pathname.startsWith(`${root}/`) || root === "";
}
