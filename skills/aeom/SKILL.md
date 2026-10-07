---
name: aeom
description: Run All Eyes On Me on a web project. Captures every page, runs the measurable checks and the judge, fixes the shared kit with one worker then every page with one worker each in parallel, and keeps only the pages that got better, on a run branch with a before and after for each page. Use when the user types /aeom or asks AEOM to fix, polish or redesign a project's frontend.
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

## 3. Kit wave: one worker

Create a worktree for the kit worker from the run branch:

```bash
git worktree add .aeom/worktrees/$RUN-kit -b aeom/$RUN-kit aeom/$RUN
```

Launch one subagent with the kit brief below. When it is done, check its diff touches only shared files (`git -C .aeom/worktrees/$RUN-kit diff --name-only aeom/$RUN`). Anything else: refuse the worker's work, say why. Otherwise merge it into the run branch.

**Kit brief.** Give the worker: the worktree path, the shared files it may edit, the kit failures with their reasons, and the base principles (`aeom principles`). Ask it to:

> Build one art direction for the whole app, held in the shared files only: colour, type and spacing tokens, the header and navigation every page will use, the buttons, links and the empty, error and loading states. It must be specific to this product, not a generic template. Every clickable thing gets a pointer cursor and a visible hover and focus. Text reaches AA contrast. Do not edit any page. Write at the top of the main shared file, in a comment, how pages use the kit (which file to link, which partial to include, which classes exist). Commit your work in the worktree.

## 4. Screen wave: one worker per page, all at once

For each page, create its worktree from the run branch, which now has the kit:

```bash
git worktree add .aeom/worktrees/$RUN-<page> -b aeom/$RUN-<page> aeom/$RUN
```

Launch every page worker at the same time, in the background. Each gets the page brief. When they are done, check each diff touches only that page's own files; refuse any worker that strays. Merge the accepted ones into the run branch one after another: their files are disjoint, so they never conflict.

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

For every page that is not `better`, put its files back as they were before the screen wave (`git checkout <run branch commit before the screen wave> -- <the page's files>`), commit, and say which pages kept their old version and why.

## 6. Show

Show the user, page by page, the capture before and after (from `.aeom/runs/$RUN/before/captures` and `.aeom/runs/$RUN/after/captures`), the comparison table, and what changed in the kit. End with the run branch name, ready to merge, and the commands to look at it. Remove the worker worktrees (`git worktree remove`) and their branches once merged.

## Rules

- One writer per file: the kit worker owns the shared files, each page worker owns its page. Nobody else edits them during the wave.
- Workers get only what their brief says. No worker sees another worker's work in progress.
- Never merge the run branch into the user's branch yourself.
