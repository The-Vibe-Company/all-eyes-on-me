---
name: aeom
description: Run All Eyes On Me on a web project. Captures every page, runs the measurable checks and the judge, fixes the shared kit with one worker then every page with one worker each in parallel, and keeps only the pages that got better, on a run branch with a before and after for each page. With --directions, first builds six contrasting art directions on the home page and lets the judge pick one in a knockout. Use when the user types /aeom or asks AEOM to fix, polish or redesign a project's frontend.
---

# /aeom

You are the AEOM coordinator. You do not edit the project's frontend yourself: workers do. You plan, launch, merge, measure, and keep only what got better.

`aeom` is the AEOM CLI. In the AEOM repository itself, run it as `node packages/cli/dist/index.js`.

## 0. Before you start

- **The app.** `.aeom/config.json` gives `url` and `start`. If it is missing, find how the project starts (its package.json scripts, README) and write the file; ask the user once only if nothing says it.
- **A clean tree.** `git status` must be clean. Never stash or discard the user's work: stop and say so.
- **The run.** `RUN` = `run-<YYYYMMDD-HHMM>`. Create the run branch from the current branch: `git checkout -b aeom/$RUN`. Everything this run keeps ends up on that branch, never on the user's branch.

## 1. Look

```bash
aeom capture
aeom check          # exits 1 when something fails, which is expected here
```

Then run the judge with the `aeom-judge` skill: three independent votes, then `aeom judge`. Then keep a copy:

```bash
aeom snapshot .aeom/runs/$RUN/before
```

## 2. Plan

Read `.aeom/reports/check.json` and `.aeom/reports/judge.json`, and the project tree. Sort the files into two groups:

- **Shared**: what more than one page uses (tokens, global CSS, the header or layout, shared components). In `examples/ugly-app` this is `shared/`.
- **Per page**: what only one page uses. In `examples/ugly-app` this is one file per page in `pages/`.

Sort every failure the same way. A failure that shows on several pages, or a principle that compares pages (`one-direction`, `consistent-chrome`, `not-generic`), goes to the kit. Everything else goes to its page.

## Briefing any worker

Every brief, kit or page, also says:

- **Run the CLI from the main checkout.** A fresh worktree has no `node_modules` and no build. The worker runs `node <main checkout>/packages/cli/dist/index.js ...` from inside its worktree, so the app it starts is the worktree's copy.
- **Its own port.** Give each worker a different port for its checks (`--start "PORT=<port> ..." --url http://localhost:<port>`), so two workers never test each other's app.
- **Its own report folder.** The worker passes `--out <a temporary folder>` to `aeom check`, so it never touches `.aeom/reports`.
- **Commit first, check after.** The worker commits as soon as its work is in place, then checks and commits fixes. A worker that stalls during its checks leaves committed work behind.

If a worker stops without committing, look at its worktree: when the work is there and stays inside its files, commit it yourself and say so.

## 2b. Directions (only with `/aeom --directions`)

Instead of fixing the current look, start from six new ones and keep the best.

1. **Six sources.** Follow [directions.md](directions.md): list twelve sources from the product's own world, pick six far apart, and drop any whose obvious rendering is a banned look. Give each a short slug, such as `nuancier`.
2. **Six workers, at once.** For each source, create a worktree from the run branch (`.aeom/worktrees/$RUN-dir-<source>`) and launch a worker with the direction brief. Each owns the shared files and the home page's files in its own worktree; they never see each other.
3. **Capture each one.** For each worktree, from inside it, start its app on its own port and capture the home page only:
   `aeom capture --start "<start command with PORT=<port>>" --url http://localhost:<port> --pages / --widths 1280 --out .aeom/runs/$RUN/directions/<source>`, then copy `index@1280.png` to `.aeom/runs/$RUN/directions/<source>.png`. A direction that does not start or does not build gets no capture: say so, and leave it out of the tournament.
4. **Show them.** `aeom sheet --out .aeom/runs/$RUN/directions/sheet.png <source>=<its capture>...` with all six, the failed ones included, and show the sheet to the user.
5. **Knockout.** `aeom tournament start --dir .aeom/runs/$RUN/directions <the sources that built>`. Then, until there is a champion: `aeom tournament next` names a duel and its two captures; launch three duel judges at once with the duel brief; when all three reply, record their votes one after another with `aeom tournament vote`. Never let the judges write the tournament file themselves: three writers at once lose votes. `aeom tournament status` shows the bracket and the reasons. Duels of the same round are independent: run them at once.
6. **Apply the champion.** Merge the champion's worktree branch into the run branch: its shared files become the kit and its home page is done. Skip the kit wave, and run the screen wave (section 4) on every other page, then measure (section 5) as usual.

**Direction brief.** Give the worker its worktree path, the shared files and the home page files it may edit, the product (what it sells or does, for whom, in which language), its source, the banned looks from directions.md, and the base principles. Ask it to:

> Build one art direction for this product from your source, in real code: the shared kit (tokens, header, buttons, states) and the home page rebuilt on it. Take from the source what makes it recognisable (its colours, type, layout conventions, marks) and turn it into a web kit; do not draw a picture of it, and do not imitate a famous site. Before you commit, say which banned look yours is closest to and what keeps it apart; if one of them describes it, start again. Keep the home page's content and purpose. Commit as soon as it works, then check it with `aeom check` on your own port and fix what fails.

**Duel brief.** Give each duel judge the two capture paths, the two source names, the banned looks from directions.md, and the base principles. Ask it to:

> Look at both screenshots. First: if one of the banned looks describes one page and not the other, the other wins. Then judge against the base principles, and on which is more specific to the product and less like anything an AI would propose. Reply with only a JSON object: `{"winner": "<source>", "reason": "<one sentence naming what you see>"}`.

## 3. Kit wave: one worker

Create a worktree for the kit worker from the run branch:

```bash
git worktree add .aeom/worktrees/$RUN-kit -b aeom/$RUN-kit aeom/$RUN
```

Note the commit the worktree started from (`KIT_BASE=$(git rev-parse aeom/$RUN)`), then launch one subagent with the kit brief below. When it is done, check its diff touches only shared files (`git -C .aeom/worktrees/$RUN-kit diff --name-only $KIT_BASE HEAD`). Anything else: refuse the worker's work, say why. Otherwise merge it into the run branch.

**Kit brief.** Give the worker: the worktree path, the shared files it may edit, the kit failures with their reasons, and the base principles (`aeom principles`). Ask it to:

> Build one art direction for the whole app, held in the shared files only (partials such as a header are inserted into pages, not served on their own): colour, type and spacing tokens, the header and navigation every page will use, the buttons, links and the empty, error and loading states. It must be specific to this product, not a generic template. Every clickable thing gets a pointer cursor and a visible hover and focus. Text reaches AA contrast. Do not edit any page. Write at the top of the main shared file, in a comment, how pages use the kit (which file to link, which partial to include, which classes exist). Commit your work in the worktree.

## 4. Screen wave: one worker per page, all at once

Note the commit every page worktree starts from (`WAVE_BASE=$(git rev-parse aeom/$RUN)`), then create each page's worktree from the run branch, which now has the kit:

```bash
git worktree add .aeom/worktrees/$RUN-<page> -b aeom/$RUN-<page> aeom/$RUN
```

Launch every page worker at the same time, in the background. Each gets the page brief. When they are done, check each diff against `$WAVE_BASE`, never against the run branch, which moves as pages merge: `git -C .aeom/worktrees/$RUN-<page> diff --name-only $WAVE_BASE HEAD` must list only that page's own files. Refuse any worker that strays. Merge the accepted ones into the run branch one after another: their files are disjoint, so they never conflict.

Collect what each worker calls a kit candidate into `.aeom/runs/$RUN/kit-candidates.md`, with the page it came from. The next run's kit brief includes that file, so the kit wave promotes them.

**Page brief.** Give the worker: its worktree path, the files of its page and nothing else, the page's failing checks and principles with their reasons, and where the kit says how to use it. Ask it to:

> Rebuild this page on the kit: use its header partial, its stylesheet and its classes, and drop the page's own styling of anything the kit covers. Fix every failure listed. Keep the page's content and purpose. If the kit lacks something you need, add it in your page file and say in your last message that it is a kit candidate. Edit only your page's files. Commit your work in the worktree.

## 5. Measure, keep only what got better

On the run branch:

```bash
aeom capture
aeom check
```

Run the judge again with the `aeom-judge` skill, then:

```bash
aeom snapshot .aeom/runs/$RUN/after
aeom compare .aeom/runs/$RUN/before .aeom/runs/$RUN/after
```

For every page that is not `better`, put its files back as they were before the screen wave (`git checkout $WAVE_BASE -- <the page's files>`) and commit. Such a page still renders through the new kit, so it is neither the page before the run nor the page after the wave: capture, check and judge again, snapshot to `.aeom/runs/$RUN/after-revert`, and compare that with `before`. Say which pages were put back, why, and how they now compare. If the kit itself made a page worse, say so: putting the page back cannot undo the kit.

## 6. Show

Show the user, page by page, the capture before and after (from `.aeom/runs/$RUN/before/captures` and `.aeom/runs/$RUN/after/captures`), the comparison table, what changed in the kit, and the kit candidates the workers left. End with the run branch name, ready to merge, and the commands to look at it. Remove the worker worktrees (`git worktree remove`) and their branches once merged.

## Rules

- One writer per file: the kit worker owns the shared files, each page worker owns its page. Nobody else edits them during the wave.
- Workers get only what their brief says. No worker sees another worker's work in progress.
- Never merge the run branch into the user's branch yourself.
