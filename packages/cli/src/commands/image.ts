import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { aeomHome } from "@aeom/core";

export const IMAGE_HELP = `Usage: aeom image "<prompt>" --out <file.png> [--size <WxH>] [--quality <q>] [--run <run folder>]
       aeom image --check

Generates one image with an image API that speaks OpenAI's: OpenAI itself, or
Azure OpenAI's /openai/v1 endpoint, with a gpt-image model. A prompt says
what the image shows and in which style; never text to write in it, a logo, a
real person or real data: only the prompt leaves the machine.

Configuration, from the environment or from ~/.aeom/.env, never printed:
  AEOM_IMAGE_KEY     The key; else OPENAI_API_KEY, else AZURE_OPENAI_API_KEY
  AEOM_IMAGE_URL     The API's base (default https://api.openai.com/v1; for
                     Azure, https://<resource>.openai.azure.com/openai/v1)
  AEOM_IMAGE_MODEL   The model, or Azure's deployment (default gpt-image-1)

  --size <WxH>       1536x1024 (default, wide), 1024x1024 or 1024x1536 (tall)
  --quality <q>      low, medium (default) or high
  --run <folder>     The run the image is for: its path joins the run's
                     assets.txt, the generated images aeom pr lets through
  --check            Say whether an image API is configured, calling nothing`;

const SIZES = ["1536x1024", "1024x1024", "1024x1536"];
const QUALITIES = ["low", "medium", "high"];

/** The image API's settings: the environment first, then ~/.aeom/.env, read as KEY=value lines. */
async function settings(): Promise<{ key?: string; url: string; model: string; azureOnly: boolean }> {
  const file = await readFile(join(aeomHome(), ".env"), "utf8").catch(() => "");
  const saved = Object.fromEntries(
    file
      .split("\n")
      .map((l) => /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^(["'])(.*)\1$/, "$2")]),
  );
  const get = (name: string) => process.env[name] || saved[name] || undefined;
  const key = get("AEOM_IMAGE_KEY") ?? get("OPENAI_API_KEY") ?? get("AZURE_OPENAI_API_KEY");
  const url = get("AEOM_IMAGE_URL") ?? get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";
  // An Azure key alone has no address: OpenAI's default would refuse it.
  const azureOnly = !get("AEOM_IMAGE_KEY") && !get("OPENAI_API_KEY") && Boolean(get("AZURE_OPENAI_API_KEY")) && !get("AEOM_IMAGE_URL") && !get("OPENAI_BASE_URL");
  return { ...(key ? { key } : {}), url: url.replace(/\/+$/, ""), model: get("AEOM_IMAGE_MODEL") ?? "gpt-image-1", azureOnly };
}

const HOW = `Set AEOM_IMAGE_KEY (or OPENAI_API_KEY), and for Azure AEOM_IMAGE_URL and AEOM_IMAGE_MODEL, in the environment or in ${join("~", ".aeom", ".env")}.`;

export async function runImage(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: "string" }, size: { type: "string", default: "1536x1024" }, quality: { type: "string", default: "medium" }, run: { type: "string" }, check: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(IMAGE_HELP);
    return 0;
  }
  const api = await settings();
  if (values.check) {
    if (!api.key) {
      console.log(`No image API configured: directions are drawn in CSS and SVG. ${HOW}`);
      return 1;
    }
    if (api.azureOnly) {
      console.log(`An Azure key, but no address: set AEOM_IMAGE_URL to your resource's /openai/v1 endpoint, and AEOM_IMAGE_MODEL to its deployment.`);
      return 1;
    }
    console.log(`Images from ${new URL(api.url).host}, model ${api.model}.`);
    return 0;
  }
  const prompt = positionals.join(" ").trim();
  if (!prompt || !values.out) {
    console.error(`aeom image "<what it shows, in which style>" --out <file.png>.\n\n${IMAGE_HELP}`);
    return 1;
  }
  if (!SIZES.includes(values.size)) return (console.error(`--size is one of ${SIZES.join(", ")}.`), 1);
  if (!QUALITIES.includes(values.quality)) return (console.error(`--quality is one of ${QUALITIES.join(", ")}.`), 1);
  if (!api.key) return (console.error(`No image API configured. ${HOW}`), 1);
  if (api.azureOnly) return (console.error(`An Azure key, but no address: set AEOM_IMAGE_URL to your resource's /openai/v1 endpoint, and AEOM_IMAGE_MODEL to its deployment.`), 1);

  let response: Response;
  try {
    response = await fetch(`${api.url}/images/generations`, {
      method: "POST",
      // OpenAI reads the bearer, Azure either: the key is sent as both, and never printed.
      headers: { "content-type": "application/json", authorization: `Bearer ${api.key}`, "api-key": api.key },
      body: JSON.stringify({ model: api.model, prompt, size: values.size, quality: values.quality, n: 1 }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    console.error(`The image API at ${new URL(api.url).host} did not answer: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const body = (await response.json().catch(() => null)) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } | null;
  if (!response.ok) {
    console.error(`The image API refused: ${response.status} ${body?.error?.message ?? response.statusText}`);
    return 1;
  }
  const first = body?.data?.[0];
  const bytes = first?.b64_json ? Buffer.from(first.b64_json, "base64") : first?.url ? Buffer.from(await (await fetch(first.url)).arrayBuffer()) : null;
  if (!bytes?.length) return (console.error(`The image API answered with no image.`), 1);
  await mkdir(dirname(resolve(values.out)), { recursive: true });
  await writeFile(values.out, bytes);

  // A generated image the front uses goes into its PR: the run lists it, and aeom pr lets exactly those through.
  if (values.run) {
    const root = await promisify(execFile)("git", ["rev-parse", "--show-toplevel"]).then((r) => r.stdout.trim(), () => process.cwd());
    const path = relative(root, resolve(values.out)).split("\\").join("/");
    const list = join(values.run, "assets.txt");
    const listed = existsSync(list) ? (await readFile(list, "utf8")).split("\n") : [];
    if (!listed.includes(path)) await appendFile(list, `${path}\n`);
  }
  console.log(`Wrote ${values.out} (${values.size}).`);
  return 0;
}
