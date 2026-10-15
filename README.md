# All Eyes On Me

All Eyes On Me is the designer of a product coded by agents: it walks its screens and journeys like a user, redesigns what gets in the way, and holds every pull request to the standard it sets.

Today, the first works. You type `/aeom redo` in Claude Code on your app: it says what the run will cost, then takes your front and makes a better one, fixing the UI and the UX on an art direction drawn from your product, or tells you there is nothing to redo.

> **Status: pre-alpha.** `/aeom` has been run on two real projects besides demo apps: a strategy game in the browser, end to end, and a workout tracker, up to its art directions. It is not on npm yet.

## What it does today

`/aeom` is a Claude Code skill. It coordinates a fleet of agents (workers, each in its own git worktree, and judges), and the `aeom` CLI does the measuring.

1. **Understand.** AEOM reads the project's own words (its README, its docs), then writes in `.aeom/product.md`, which you can correct, what kind of product it is (a tool, a game or a creative product), what the app is for, who uses it and its main loop; for a game, its genre and fiction, the feeling it aims for, its references and its existing illustrations. It records three to five key journeys that it replays in a real browser.
2. **Look.** Every screen is captured where the front is used: 390 px for a phone, 1280 for a computer, both by default. AEOM reads it from the project (its README or PRD, a native app beside the web) and writes it in the product sheet; when nothing says it, it asks you once. `"widths"` in `.aeom/config.json` overrides it. Twelve checks are measured: pointer cursor, sideways scrolling, AA contrast, console errors, a header that stays when you scroll, labels held on one line, rows of cards that keep one shape, no text cut without an ellipsis, targets big enough to tap (24 px, or 24 px apart, as WCAG 2.5.8 asks), text of 12 px at least (fields of 16 on a phone), lines of 90 characters at most, and zoom left to people. `"except": {"header": ["/"]}` in `.aeom/config.json` leaves a check out of a page where it does not apply. Eight principles are judged by one judge, then two more on what it fails, and the majority decides.
3. **Decide.** If nothing fails, AEOM says « nothing to redo », writes the standard of the front as it is (step 8), and stops. No branch is created. Before the first judge, AEOM says what the run will cost, phase by phase (agents, tokens, time), and waits for your go. With `/aeom judge`, or when you ask it only to judge, it stops here whatever the verdict: what fails, screen by screen and journey by journey, without redoing anything, for six judges instead of about twenty-five agents.
4. **Improve, or a new direction.** When the front already has a direction of its own (no screen fails one direction, nothing generic, no AI default look), AEOM recommends improving it, its style kept and only what fails fixed, and asks you; otherwise it recommends new directions. For new directions: three art directions by default (`/aeom --directions <n>` for more), each drawn from the product's own world, never from the looks AIs propose by default: for a tool, something its users know (an object, a document, a place, a trade); for a game, its fiction, its illustrations and the interface of its genre. Each is built on two or three screens, one of them dense. A judge first screens out any that look dated, look like an AI default, come from the product's name rather than its users' world, or are less polished than your current front. Then AEOM stops and shows you the ones left next to your current front, each in two plain sentences, and you choose one, keep and improve yours, or none and say why. With `--autonome`, nobody is asked: three judges screen them and a knockout keeps one, one judge per duel, three for the final; when none is left, your front is improved instead. With `--garder-le-style`, or `"style": "keep"` in `.aeom/config.json`, the app's own style is kept and fixed instead.
5. **The pages and their journeys.** One worker per page, all at once, each in its own files, fixing its page and the journey steps that fall on it. A guard refuses any change that adds a feature (a new call to the server, a protected file). A page is kept only if fewer things fail on it than before, and no journey breaks or gets worse because of it.
6. **A journey that still breaks.** Only then, a worker for that journey. It is kept only if it reaches its end and its critique fails fewer principles than before.
7. **Show.** AEOM names, at most three, the features a blocked journey would need, and builds none of them. It writes a result page on your machine, where you can say whether you agree with each verdict.
8. **The standard, then the PR.** AEOM writes the standard of your front in `.aeom/standard.md`, in words: the direction and where it comes from, every token and every component of the kit with the file of the code it lives in, and the product's own rules. It commits it on the run's branch, then opens a pull request in words, with no capture. After « nothing to redo », it writes the standard of the front as it is, and leaves it uncommitted. What you correct in it by hand stays on the next run.

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
- type `/aeom judge` in Claude Code for a first look, then `/aeom redo` to redo what fails (`/aeom` alone is the same as `/aeom redo`).

A full run is long and spawns many agents: some twenty-five subagents (judges, workers), all on Sonnet but the direction workers, on your session's model, and under three million tokens for eight screens and four journeys. `aeom estimate` says it for your project before anything starts, and `/aeom` asks before its first judge. For a first look at a project, `/aeom judge` stops at the verdict. If the session closes in the middle, `/aeom --reprendre` takes the run up where it stopped: every run keeps its state in `.aeom/runs/<run>/state.json`.

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
| `aeom tournament` | Run a knockout between directions, one vote per duel, three for the final |
| `aeom product` | Write the product sheet AEOM drafted, keeping the user's edits |
| `aeom journey` | Replay each key journey and capture every step |
| `aeom guard` | Refuse a change that adds a feature instead of fixing a journey |
| `aeom verdict` | Say whether the front needs redoing, from what AEOM measured |
| `aeom report` | Write the page of what a run gave, in the run's folder |
| `aeom features` | Name what a blocked journey would need, without building it |
| `aeom pr` | Push the run's branch and open a PR, in words, with no capture |
| `aeom standard` | Write the standard of the front, keeping the user's edits |
| `aeom estimate` | Say what a run would cost, phase by phase, before it starts |
| `aeom run` | Keep where a run is, and say how to take it up after a stop |

## What comes next

None of this is done yet:
- **Level 1, finished.** A bench of three apps with defects noted by hand, measuring what AEOM finds and fixes.
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
| `skills/` | The coordinator skill, `/aeom`, and the judges, `/aeom-judge`. They run in Claude Code and launch workers and judges as subagents. `/aeom` is split by phase: `SKILL.md` holds what every run needs, and `phase-understand.md`, `phase-directions.md` and `phase-wave.md` are read only when a run gets there. |

State lives in files:
- `.aeom/` in the project's repository: the product sheet, the standard of the front, the key journeys, the config, and the runs (keep `.aeom/runs/` out of git).
- `~/.aeom/taste/` on your machine: your feedback on each verdict.
- `.aeom-worktrees/<project>/`, next to the project: the workers' copies during a run, kept out of the project so its own tools never walk into them.

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
