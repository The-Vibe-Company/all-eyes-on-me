# All Eyes On Me

All Eyes On Me is the designer of a product coded by agents: it walks its screens and journeys like a user, redesigns what gets in the way, and holds every pull request to the standard it sets.

Today, the first works. You type `/aeom redo` in Claude Code on your app: it takes your front and makes a better one, fixing the UI and the UX on an art direction drawn from your product, or tells you there is nothing to redo.

Its site: [aeom.thevibecompany.co](https://aeom.thevibecompany.co).

> **Status: pre-alpha.** `/aeom` has been run on two real projects besides demo apps: a strategy game in the browser, end to end, and a workout tracker, up to its art directions. It is not on npm yet.

## What it does today

`/aeom` is a Claude Code skill. It coordinates a fleet of agents (workers, each in its own git worktree, and judges), and the `aeom` CLI does the measuring.

1. **Understand.** AEOM reads the project's own words (its README, its docs), then writes in `.aeom/product.md`, which you can correct, what kind of product it is (a tool, a game or a creative product), what the app is for, who uses it and its main loop; for a game, its genre and fiction, the feeling it aims for, its references and its existing illustrations. It records three to five key journeys that it replays in a real browser.
2. **Look.** Every screen is captured where the front is used: 390 px for a phone, 1280 for a computer, both by default. AEOM reads it from the project (its README or PRD, a native app beside the web) and writes it in the product sheet; when nothing says it, it asks you once. `"widths"` in `.aeom/config.json` overrides it. Twenty-seven checks are measured: pointer cursor, sideways scrolling, AA contrast, console errors, a header that stays when you scroll, labels held on one line, rows of cards that keep one shape, no text cut without an ellipsis, targets big enough to tap (24 px, or 24 px apart, as WCAG 2.5.8 asks), text of 12 px at least (fields of 16 on a phone), lines of 90 characters at most, zoom left to people, images that load and keep their shape, a name for every button, link, field and image, a keyboard focus you can see, a page that does not move while it loads, no hole left unfilled (« [PRIX] », « {{nom}} », lorem ipsum, « undefined »), no text about the interface or the demo (« Ce bouton vous permet de… », « Maquette de démonstration »), no hollow word (« revolutionize », « sans effort »), no heading that leaves one word alone on its last line, a page finished (its own title, an icon, a skip link past its navigation, a description and a share image when anyone can open it, and an address that does not exist answered by a page that says so and leads back), four of the looks [impeccable](https://impeccable.style) bans: text filled with a gradient, a box marked by a coloured stripe on one side, a card inside a card, motion that bounces, and two rules of a careful designer: a rounded shape inside another follows its corner (the inner radius is the outer one less the gap), and motion has a curve of its own and never moves the layout. With the style kept, those six belong to the charter: said, never redone. `"except": {"header": ["/"]}` in `.aeom/config.json` leaves a check out of a page where it does not apply. A choice you assume, or what your spec requires, goes in the product sheet's « Accepted exceptions », with its reason and who says so (`- \`not-generic\` on every page: the violet is the brand's. (seen: Victor)`): the checks and the judges say it apart, never as a failure to redo. Every verdict says which model judged, on which principles, and `aeom compare` warns when they changed between two measures. Eight principles are judged by one judge, then two more on what it fails, and the majority decides.
3. **Decide.** If nothing fails, AEOM says « nothing to redo », writes the standard of the front as it is (step 8), and stops. No branch is created. With `/aeom judge`, or when you ask it only to judge, it stops here whatever the verdict: what fails, screen by screen and journey by journey, without redoing anything, for six judges instead of about twenty-five agents.
4. **Improve, or a new direction.** When the front already has a direction of its own (no screen fails one direction, nothing generic, no AI default look), AEOM recommends improving it, its style kept and only what fails fixed, and asks you; otherwise it recommends new directions. For new directions: three art directions by default (`/aeom --directions <n>` for more), each on a structure of its own (the image first, a workbench in panes, a timeline…), drawn by a worker who never sees your current front, only what its screens hold, and each drawn from the product's own world, never from the looks AIs propose by default: for a tool, something its users know (an object, a document, a place, a trade); for a game, its fiction, its illustrations and the interface of its genre. Each is built on two or three screens, one of them dense. A judge says which look dated, look like an AI default, come from the product's name rather than its users' world, are less polished than your current front, or stand on the skeleton of another or of your current front, beside each, and leaves none out. Then AEOM stops and shows you every one next to your current front, each in two plain sentences, with its strong point, its weak point and its fit to your product, and the one the screening would start from, as advice only; you choose one, a mix of two (« this one with the air of that one »), keep and improve yours, or none and say why. A direction you kept with `/aeom directions` is built on instead, with no new ones drawn. With `--autonome`, nobody is asked: three judges screen them and a knockout keeps one, one judge per duel, three for the final; when none is left, your front is improved instead. With `--garder-le-style`, or `"style": "keep"` in `.aeom/config.json`, the app's own style is kept and fixed instead.
5. **The pages and their journeys.** One worker per page, all at once, each in its own files, fixing its page and the journey steps that fall on it. A guard refuses any change that adds a feature (a new call to the server, a protected file). A page is kept only if fewer things fail on it than before, and no journey breaks or gets worse because of it.
6. **A journey that still breaks.** Only then, a worker for that journey. It is kept only if it reaches its end and its critique fails fewer principles than before.
7. **Show.** AEOM names, at most three, the features a blocked journey would need, and builds none of them. It writes a result page on your machine, where you can say whether you agree with each verdict.
8. **The standard, then the PR.** AEOM writes the standard of your front in `.aeom/standard.md`, in words: the direction and where it comes from, every token and every component of the kit with the file of the code it lives in, and the product's own rules. It commits it on the run's branch, then opens a pull request in words, with no capture. After « nothing to redo », it writes the standard of the front as it is, and leaves it uncommitted. What you correct in it by hand stays on the next run.

Everything the run keeps is on a branch, `aeom/<run>`: your branch does not move.

**What you teach it stays.** A preference you state during a run is kept at once: for this project in `.aeom/taste.md`, which comes first, or for you in `~/.aeom/taste/rules.md` (`aeom taste rule`). Before the next run, what you disagreed with on the result page and the directions you chose over the advice give at most five lessons, each resting on what the run showed, counted again when a later run shows it again. The workers and the screening read them as a short index (`aeom taste --brief`); the judges of the principles never do, so their verdicts stay comparable from run to run. And the order of a run is held in code: `aeom pr` refuses a run that rebuilt pages or journeys without measuring them after, replaying its journeys at the end or reaching its standard, and names the step.

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

**Every pull request, held to the standard.** `aeom review` reads what a branch changes against `.aeom/standard.md`, with no model: a colour, a font, a size or a space written in hard outside the tokens, a button or a header made by hand while the kit has one, each with its file and its line, then the checks on the screens it touches, a header that differs from the rest, and the key journeys it crosses replayed on the base and on the branch: one it breaks fails, a new call is said as a feature. `aeom review --install-check` writes the workflow that runs it on every pull request as a CI check named aeom, its summary in words.

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
mkdir -p ~/.claude/agents
ln -s "$PWD/agents/claude/aeom-worker.md" "$PWD/agents/claude/aeom-judge.md" ~/.claude/agents/
```

To update it later, `aeom update`: it pulls the latest version, installs and builds it. Once a day at most, AEOM looks whether one is out (a `git fetch`, nothing else sent) and says so after a command; `AEOM_UPDATE_CHECK=0` turns it off.

The two agents, `aeom-worker` and `aeom-judge`, are what a run launches: on Sonnet, with only the tools they use, so no step of theirs re-reads the MCP servers and skills a general agent carries. Restart Claude Code once after linking them: a new `agents` folder is read when it starts.

**Directions first, nothing touched.** `/aeom directions` draws three art directions in a few minutes, as static pages in plain HTML and CSS: of your own screens with what they hold when you give it nothing, of a prompt (`/aeom directions "a sentence"`, or the prompt `/style` writes, whose charter it keeps), or of a spec (`/aeom directions cahier.md`). No branch, no change to your app. AEOM's checks run on each, a judge says what it sees beside each, leaving none out, and you choose. The one you choose is kept in `.aeom/direction/`: `/aeom redo` then carries it into your app, `/aeom build --from-scratch` builds a front on it.

**From scratch, with no front yet.** `/aeom build --from-scratch cahier.md`, or a sentence in quotes, with `--api <url>` when an API runs on your machine, drafts the product sheet and its key journeys from it, then draws three directions for you to pick. On the one you pick, it builds the kit and the screens of the key journeys, on that API, or on fake data kept in one module and named as such, then `/aeom build --api <url>` plugs it in later without touching the screens. It replays each journey to its end, checks that no screen calls a server but that API, and writes the standard, the result page and a pull request. The front is plain HTML, CSS and JavaScript in `front/`, with no build step, which any stack can take over; open it served, `python3 -m http.server 8080 -d front`.

**Images, if you want them.** With an image key, AEOM generates the images that serve, a landing's hero, a section, an empty state, in the style of each direction; without one, it draws in CSS and SVG. In `~/.aeom/.env`:

```bash
AEOM_IMAGE_KEY=<your OpenAI key>
# or, for Azure OpenAI:
AEOM_IMAGE_URL=https://<resource>.openai.azure.com/openai/v1
AEOM_IMAGE_MODEL=<your gpt-image deployment>
```

Only the prompt leaves your machine, never a capture or your data. `aeom image --check` says whether it is set.

Then, in your project:
- it is a git repository with a clean working tree;
- your app starts locally with one command, on fake data;
- for the pull request at the end, the repository has a remote and `gh` is signed in;
- type `/aeom judge` in Claude Code for a first look, `/aeom directions` to see other directions for it, then `/aeom redo` to redo what fails (`/aeom` alone is the same as `/aeom redo`).

A full run is long and spawns many agents: some twenty-five subagents (judges, workers), all on Sonnet but the direction workers, on your session's model. For a first look at a project, `/aeom judge` stops at the verdict. If the session closes in the middle, `/aeom --reprendre` takes the run up where it stopped: every run keeps its state in `.aeom/runs/<run>/state.json`.

## Commands

| Command | What it does |
| --- | --- |
| `aeom capture` | Find every page of a web app, screenshot it, and write what it holds without its look |
| `aeom check` | Run the measurable checks on every page |
| `aeom judge` | Count the judges' votes on the captures |
| `aeom principles` | Print the principles the judge uses |
| `aeom snapshot` | Keep a copy of the captures and reports, such as before a fleet run |
| `aeom compare` | Compare two snapshots page by page |
| `aeom sheet` | Lay captures side by side in one image |
| `aeom direction` | Keep the direction chosen, until a run builds on it |
| `aeom mockups` | Capture, lay out and check every direction of a round, at once |
| `aeom image` | Generate an image the front uses, in its direction's style |
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
| `aeom cost` | Say what a run really cost, role by role, from this machine's transcripts |
| `aeom bench` | Run AEOM on apps whose defects were noted by hand, and count what it found and fixed |
| `aeom run` | Keep where a run is, and say how to take it up after a stop |
| `aeom review` | Hold a branch's changes to the standard of the front, with no model |
| `aeom taste` | Keep what the person taught AEOM: the rules they said, the lessons runs showed |
| `aeom update` | Bring AEOM up to date, or say how far behind it is |

## What comes next

None of this is done yet:
- **Level 1, finished.** A bench of three apps with defects noted by hand, measuring what AEOM finds and fixes.
- **Level 2, keep, the rest.** The judges saying in a comment whether a PR is still the same product, and a PR that changes the standard on purpose.
- **Level 3, build, the rest.** The mockup from a spec or a prompt is here (`/aeom build --from-scratch`, `--api`); next, with a front already there, what is asked in one sentence, inside the standard, and building in a framework the project already holds.
- **Later.**
  - Taking out the rules of the skill that only made up for older models, each once the bench shows it changes nothing.
  - A spend cap.
  - The npm package.
  - Codex, and mobile.

## Architecture

| Path | Role |
| --- | --- |
| `packages/cli` | The `aeom` command: the deterministic plumbing agents call (capture, checks, journeys, the guard, the verdict, the result page, the PR). |
| `packages/core` | Capture (built on Playwright), checks, journeys, the judge's tally, the ratchets, the result page. |
| `skills/` | The coordinator skill, `/aeom`, and the judges, `/aeom-judge`. They run in Claude Code and launch workers and judges as subagents. `/aeom` is split by phase: `SKILL.md` holds what every run needs, and `phase-understand.md`, `phase-directions.md` and `phase-wave.md` are read only when a run gets there. |
| `agents/` | The workers and the judges the skills launch, `aeom-worker` and `aeom-judge`: on Sonnet, with only the tools each uses. |

State lives in files:
- `.aeom/` in the project's repository: the product sheet, the standard of the front, the rules you said for this project (`taste.md`), the key journeys, the config, and the runs (keep `.aeom/runs/` out of git).
- `~/.aeom/taste/` on your machine: your feedback on each verdict, the rules you said for every project, and the lessons runs showed.
- `~/.aeom/install-id` on your machine: the random id AEOM's usage count knows it by (see [What it sends](#what-it-sends)).
- `.aeom-worktrees/<project>/`, next to the project: the workers' copies during a run, kept out of the project so its own tools never walk into them.

The vocabulary is defined in [CONTEXT.md](./CONTEXT.md).

## What it sends

To know how many people install AEOM and use it, `aeom` sends one request to PostHog each time it runs: a random id made on the first run and kept in `~/.aeom/install-id`, AEOM's version, the OS, the architecture, Node's version and the command's name (`unknown` for one it does not know). Nothing about your project: no path, no repository, no argument, no capture, no email. Like any server, PostHog sees the connection's address: it keeps it, with the rough place it reads from it (country and city). The first run says so in one line on stderr.

`AEOM_TELEMETRY=0` or `DO_NOT_TRACK=1` turns it off, and nothing is sent in CI. The request leaves from a process of its own: a command never waits for it, nor fails because of it.

Once a day at most, AEOM also runs `git fetch` in its own checkout, to say when a newer version is out: GitHub sees the fetch, nothing else leaves. It is kept in `~/.aeom/update.json`, off whenever telemetry is, and `AEOM_UPDATE_CHECK=0` turns it off alone.

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
