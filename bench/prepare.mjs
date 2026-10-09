// Puts one bench app in a fresh git repository, ready for /aeom: the app,
// its config and its key journeys under .aeom/, committed on main.
//   node bench/prepare.mjs <slug> <folder>
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

export function prepare(slug, dest) {
  const bench = JSON.parse(readFileSync(join(root, "bench/bench.json"), "utf8"));
  const app = bench.apps.find((a) => a.slug === slug);
  if (!app) throw new Error(`No bench app "${slug}": ${bench.apps.map((a) => a.slug).join(", ")}`);
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} is not empty: give an empty folder, the bench never writes over anything.`);
  cpSync(join(root, app.app), dest, { recursive: true, filter: (src) => !/[\\/](node_modules|\.aeom|\.git)([\\/]|$)/.test(src.slice(join(root, app.app).length)) });
  mkdirSync(join(dest, ".aeom", "journeys"), { recursive: true });
  writeFileSync(join(dest, ".aeom", "config.json"), JSON.stringify(app.config, null, 2) + "\n");
  cpSync(join(root, app.journeys), join(dest, ".aeom", "journeys"), { recursive: true });
  const ignore = join(dest, ".gitignore");
  writeFileSync(ignore, `${existsSync(ignore) ? readFileSync(ignore, "utf8").replace(/\n?$/, "\n") : ""}.aeom/runs/\n`);
  const git = (...args) => execFileSync("git", ["-c", "user.name=bench", "-c", "user.email=bench@example.test", ...args], { cwd: dest, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", `the bench app ${slug}`);
  return { app, dest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, dest] = process.argv.slice(2);
  if (!slug || !dest) {
    console.error("Usage: node bench/prepare.mjs <slug> <folder>");
    process.exit(1);
  }
  try {
    prepare(slug, dest);
    console.log(`${slug} is ready in ${dest}: a git repository on main, with .aeom/config.json and its key journeys.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
