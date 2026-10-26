import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { aeomHome } from "@aeom/core";

export const IMAGE_HELP = `Usage: aeom image "<prompt>" --out <file.png> [--size <WxH>] [--quality <q>] [--run <run folder>]
       aeom image --adopt <file> --run <run folder>
       aeom image --check

Generates one image with an image API that speaks OpenAI's: OpenAI itself, or
Azure OpenAI's /openai/v1 endpoint, with a gpt-image model. A prompt says
what the image shows and in which style; never text to write in it, a logo, a
real person or real data: only the prompt leaves the machine.

Nothing is generated until AEOM_IMAGE_KEY is set, in the environment or in
~/.aeom/.env (never printed); another key of the machine never turns it on:
  AEOM_IMAGE_KEY     The key
  AEOM_IMAGE_URL     The API's base, https (default https://api.openai.com/v1;
                     for Azure, https://<resource>.openai.azure.com/openai/v1)
  AEOM_IMAGE_MODEL   The model, or Azure's deployment (default gpt-image-1)

  --out <file>       A .png, .jpg or .webp file: the image is written in that format
  --size <WxH>       1536x1024 (default, wide), 1024x1024 or 1024x1536 (tall)
  --quality <q>      low, medium (default) or high
  --run <folder>     The run the image is for: the image, by its content and
                     its path, joins the run's assets.txt, the generated
                     images aeom pr lets through, and no other
  --adopt <file>     List an image already generated, such as one of the
                     direction kept, copied into the front: --run required
  --check            Say whether image generation is set, calling nothing`;

const SIZES = ["1536x1024", "1024x1024", "1024x1536"];
const QUALITIES = ["low", "medium", "high"];
const FORMATS: Record<string, string> = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp" };
const HOW = `Set AEOM_IMAGE_KEY, and for Azure AEOM_IMAGE_URL and AEOM_IMAGE_MODEL, in the environment or in ${join("~", ".aeom", ".env")}.`;

/** A value of a .env line: what the quotes hold, or the text before an unquoted comment. */
const valueOf = (raw: string) => {
  const quoted = /^(["'])(.*?)\1/.exec(raw);
  return quoted ? quoted[2]! : raw.replace(/\s+#.*$/, "").trim();
};

/** The image API's settings: the environment first, then ~/.aeom/.env. Its address is https, or this machine's for a test. */
async function settings(): Promise<{ key?: string; url?: URL; model: string; problem?: string }> {
  const file = await readFile(join(aeomHome(), ".env"), "utf8").catch(() => "");
  const saved = Object.fromEntries(
    file
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, valueOf(m[2]!)]),
  );
  const get = (name: string) => process.env[name] || saved[name] || undefined;
  const key = get("AEOM_IMAGE_KEY");
  const model = get("AEOM_IMAGE_MODEL") ?? "gpt-image-1";
  let url: URL;
  try {
    url = new URL((get("AEOM_IMAGE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, ""));
  } catch {
    return { ...(key ? { key } : {}), model, problem: `AEOM_IMAGE_URL is not an address: give the API's base, such as https://<resource>.openai.azure.com/openai/v1.` };
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return { ...(key ? { key } : {}), model, problem: `AEOM_IMAGE_URL is ${url.protocol}: the key goes over https only.` };
  return { ...(key ? { key } : {}), url, model };
}

/** The image's own format, read from its first bytes: an answer that is not one is never written. */
const formatOf = (bytes: Buffer) =>
  bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "png"
  : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpeg"
  : bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP" ? "webp"
  : null;

/** The run's folder, checked before anything is paid for. */
function runFolder(run: string | undefined): string | null | undefined {
  if (run === undefined) return undefined;
  const folder = resolve(run);
  return existsSync(folder) && statSync(folder).isDirectory() ? folder : null;
}

/** An image in the run's list, by git's hash of its content and its path from the repository's root: the PR lets that exact file through. */
async function list(file: string, folder: string): Promise<string> {
  const git = (args: string[]) => promisify(execFile)("git", args).then((r) => r.stdout.trim());
  const root = await git(["rev-parse", "--show-toplevel"]).catch(() => process.cwd());
  const path = relative(root, resolve(file)).split("\\").join("/");
  const blob = await git(["hash-object", "--", resolve(file)]);
  const assets = join(folder, "assets.txt");
  const text = existsSync(assets) ? await readFile(assets, "utf8") : "";
  const line = `${blob} ${path}`;
  if (!text.split("\n").includes(line)) await appendFile(assets, `${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`);
  return path;
}

export async function runImage(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: "string" }, size: { type: "string", default: "1536x1024" }, quality: { type: "string", default: "medium" }, run: { type: "string" }, adopt: { type: "string" }, check: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(IMAGE_HELP);
    return 0;
  }
  const folder = runFolder(values.run);
  if (folder === null) return (console.error(`${values.run} is not a run's folder: give it absolute from a worktree, such as "$MAIN/.aeom/runs/$RUN".`), 1);
  if (values.adopt !== undefined) {
    if (!folder) return (console.error(`aeom image --adopt <file> --run <run folder>.`), 1);
    const bytes = await readFile(values.adopt).catch(() => null);
    if (!bytes || !formatOf(bytes)) return (console.error(`${values.adopt} is not a PNG, JPEG or WebP image.`), 1);
    console.log(`Listed ${await list(values.adopt, folder)} for the run's PR.`);
    return 0;
  }
  const api = await settings();
  if (values.check) {
    if (!api.key) return (console.log(`No image generation: AEOM_IMAGE_KEY is not set. ${HOW}`), 1);
    if (api.problem) return (console.log(api.problem), 1);
    console.log(`Images from ${api.url!.host}, model ${api.model}.`);
    return 0;
  }
  const prompt = positionals.join(" ").trim();
  if (!prompt || !values.out) return (console.error(`aeom image "<what it shows, in which style>" --out <file.png>.\n\n${IMAGE_HELP}`), 1);
  const format = FORMATS[extname(values.out).toLowerCase()];
  if (!format) return (console.error(`--out is a .png, .jpg or .webp file.`), 1);
  if (!SIZES.includes(values.size)) return (console.error(`--size is one of ${SIZES.join(", ")}.`), 1);
  if (!QUALITIES.includes(values.quality)) return (console.error(`--quality is one of ${QUALITIES.join(", ")}.`), 1);
  if (!api.key) return (console.error(`No image generation: AEOM_IMAGE_KEY is not set. ${HOW}`), 1);
  if (api.problem) return (console.error(api.problem), 1);

  let bytes: Buffer | null = null;
  try {
    const response = await fetch(`${api.url!.href.replace(/\/+$/, "")}/images/generations`, {
      method: "POST",
      // The key goes to the address set, and nowhere a redirect would lead.
      headers: { "content-type": "application/json", authorization: `Bearer ${api.key}`, "api-key": api.key },
      body: JSON.stringify({ model: api.model, prompt, size: values.size, quality: values.quality, output_format: format, n: 1 }),
      signal: AbortSignal.timeout(180_000),
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) return (console.error(`The image API refused the key (${response.status}): check AEOM_IMAGE_KEY, and for Azure its URL and deployment.`), 1);
    const body = (await response.json().catch(() => null)) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } | null;
    if (!response.ok) return (console.error(`The image API refused: ${response.status}${body?.error?.message ? ` ${body.error.message.replace(/(sk-|key)[\w-]{4,}/gi, "$1…")}` : ""}`), 1);
    const first = body?.data?.[0];
    if (first?.b64_json) bytes = Buffer.from(first.b64_json, "base64");
    else if (first?.url && new URL(first.url).protocol === "https:") {
      const image = await fetch(first.url, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
      if (image.ok) bytes = Buffer.from(await image.arrayBuffer());
    }
  } catch (error) {
    return (console.error(`The image API at ${api.url!.host} did not answer: ${error instanceof Error ? error.message : String(error)}`), 1);
  }
  if (!bytes?.length || !formatOf(bytes)) return (console.error(`The image API answered with no image: nothing written.`), 1);
  try {
    await mkdir(dirname(resolve(values.out)), { recursive: true });
    await writeFile(values.out, bytes);
    const listed = folder ? await list(values.out, folder) : null;
    console.log(`Wrote ${values.out} (${values.size})${listed ? `, listed for the run's PR` : ""}.`);
    return 0;
  } catch (error) {
    return (console.error(`Cannot write ${values.out}: ${error instanceof Error ? error.message : String(error)}`), 1);
  }
}
