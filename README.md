# All Eyes On Me

All Eyes On Me is the art director of a product coded by agents: it sets the standard of its front, holds every pull request to it, and builds the front that follows it.

Today, most of the first works. You type `/aeom` in Claude Code on your app: it takes your front and makes a better one, fixing the UI and the UX on an art direction drawn from your product, or tells you there is nothing to redo.

> **Status: pre-alpha.** `/aeom` runs end to end on demo apps. It has not run on a real project yet.

## What it does today

`/aeom` is a Claude Code skill. It coordinates a fleet of agents (workers, each in its own git worktree, and judges), and the `aeom` CLI does the measuring.

1. **Understand.** AEOM writes what the app is for, who uses it and its main loop in `.aeom/product.md`, which you can correct, and records three to five key journeys that it replays in a real browser.
2. **Look.** Every screen is captured at 390 and 1280 px. Four checks are measured: pointer cursor, sideways scrolling, AA contrast, console errors. Eight principles are judged by three independent judges, and the majority decides.
3. **Decide.** If nothing fails, AEOM says « nothing to redo » and stops. No branch is created.
4. **A new direction.** Six art directions, each drawn from something the product's users know (an object, a document, a place, a trade), never from the looks AIs propose by default. Judges screen out the default looks, then a knockout keeps one, three votes per duel. With `--garder-le-style`, or `"style": "keep"` in `.aeom/config.json`, the app's own style is kept and fixed instead.
5. **The pages.** One worker per page, all at once, each in its own files. A page is kept only if fewer things fail on it than before.
6. **The journeys.** Journeys the judges found failing are reworked on the new direction. A guard refuses any change that adds a feature (a new call to the server, a protected file). A journey is kept only if the judges prefer it and it still reaches its end.
7. **Show.** AEOM names, at most three, the features a blocked journey would need, and builds none of them. It writes a result page on your machine, where you can say whether you agree with each verdict. It then opens a pull request in words, with no capture.

Everything the run keeps is on a branch, `aeom/<run>`: your branch does not move.

**On the demo app** in `examples/` (a deliberately ugly shop):
- the failures on its four pages went from 10, 8, 8 and 8 to 1, 1, 0 and 0;
- the measurable checks went from 10 to 0, and the journeys' failures from 14 to 7;
- « See my orders » went from four steps to three;
- no feature was added.

On the same demo given one brand charter, run with the style kept, the checks went from 16 to 1 and the charter stayed the same on every page.

**What it asks of you, and what it never does:**
- Your app runs on fake data: its journeys write to it. AEOM signs in only with a test account.
- It never builds a feature, unless you ask in so many words.
- It never sends a capture out of your machine. Captures, the result page and your feedback stay local. What leaves is the run's branch and a pull request in words, when the repository has a remote and `gh` is signed in (`--sans-pr` stops at the branch).

## Try it

AEOM is not on npm yet. From the source, with Node 22, pnpm and Claude Code:

```bash
git clone https://github.com/The-Vibe-Company/all-eyes-on-me
cd all-eyes-on-me
pnpm install
pnpm build
pnpm --filter @aeom/core exec playwright install chromium
mkdir -p ~/.local/bin
ln -s "$PWD/packages/cli/dist/index.js" ~/.local/bin/aeom   # any folder on your PATH
export PATH="$HOME/.local/bin:$PATH"                           # and in your shell profile
aeom --help
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/aeom" "$PWD/skills/aeom-judge" ~/.claude/skills/
```

Then, in your project:
- it is a git repository with a clean working tree;
- your app starts locally with one command, on fake data;
- for the pull request at the end, the repository has a remote and `gh` is signed in;
- type `/aeom` in Claude Code.

A full run is long and spawns many agents: on the demo app, about an hour of work and some sixty subagents (judges, workers). The bench will measure it properly.

## Commands

| Command | What it does |
| --- | --- |
| `aeom capture` | Find every page of a web app and screenshot it |
| `aeom check` | Run the measurable checks on every page |
| `aeom judge` | Count the judges' votes on the captures |
| `aeom principles` | Print the principles the judge uses |
| `aeom snapshot` | Keep a copy of the captures and reports, such as before a fleet run |
| `aeom compare` | Compare two snapshots page by page |
| `aeom sheet` | Lay captures side by side in one image |
| `aeom tournament` | Run a knockout between directions, three votes per duel |
| `aeom product` | Write the product sheet AEOM drafted, keeping the user's edits |
| `aeom journey` | Replay each key journey and capture every step |
| `aeom guard` | Refuse a change that adds a feature instead of fixing a journey |
| `aeom verdict` | Say whether the front needs redoing, from what AEOM measured |
| `aeom report` | Write the page of what a run gave, in the run's folder |
| `aeom features` | Name what a blocked journey would need, without building it |
| `aeom pr` | Push the run's branch and open a PR, in words, with no capture |

## What comes next

None of this is done yet:
- **Level 1, finished.** A bench of three apps with defects noted by hand, measuring what AEOM finds and fixes. A run that ends by writing the standard of the front (the direction, its tokens, its kit).
- **Level 2, keep.** On every pull request, the new screens are held to the standard. What can be measured blocks the CI check, with no model. The judges say in a comment whether it is still the same product.
- **Level 3, build.** Build what is asked, or a front from scratch, inside the standard: front only, on an existing API or fake data.
- **Later.**
  - The judges learn your taste from your feedback, which today is only counted.
  - A spend cap.
  - The npm package.
  - Codex, and mobile.

## Architecture

| Path | Role |
| --- | --- |
| `packages/cli` | The `aeom` command: the deterministic plumbing agents call (capture, checks, journeys, the guard, the verdict, the result page, the PR). |
| `packages/core` | Capture (built on Playwright), checks, journeys, the judge's tally, the ratchets, the result page. |
| `skills/` | The coordinator skill, `/aeom`, and the judges, `/aeom-judge`. They run in Claude Code and launch workers and judges as subagents. |

State lives in files:
- `.aeom/` in the project's repository: the product sheet, the key journeys, the config, and the runs (keep `.aeom/runs/` out of git).
- `~/.aeom/taste/` on your machine: your feedback on each verdict.

The vocabulary is defined in [CONTEXT.md](./CONTEXT.md).

## Development

Requires Node 22 or later and pnpm.

```bash
pnpm install
pnpm build
pnpm test
node packages/cli/dist/index.js --help
```

## License

[MIT](./LICENSE), by [The Vibe Company](https://thevibecompany.co).
