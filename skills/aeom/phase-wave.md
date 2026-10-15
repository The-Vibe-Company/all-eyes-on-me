# /aeom: the wave

Part of the `/aeom` skill: [SKILL.md](SKILL.md) says when to read this file (**Briefing any worker** and sections 3 to 5, once a run changes the app). Everything it does not say here (section 0, **The cost, before the judges**, **The result page, served**, **The standard of the front**) is in SKILL.md.

## Briefing any worker

**Every worker runs on Sonnet**, as the judges do: launch it with the Agent tool's `model: "sonnet"`, whatever model this session coordinates on. Kit, pages, promotion, journeys: all of them. The direction workers are the one exception, on this session's own model (section 2b, step 3). A worker builds on a brief, a kit and principles written down; the session keeps its own model for deciding.

Every brief, kit or page, also says:

- **Run the CLI from inside the worktree.** The worker runs `aeom ...` from inside its worktree, so the app it starts is the worktree's copy. Inside the AEOM repository itself, where a fresh worktree has no build, it is `node "$MAIN/packages/cli/dist/index.js" ...`.
- **Its own port.** Give each worker a different port for its checks (`--start "PORT=<port> ..." --url http://localhost:<port>`), so two workers never test each other's app.
- **The run's widths.** Every `aeom capture`, `aeom check` or `aeom journey` the worker runs takes `--widths <the run's WIDTHS, written out>`.
- **Its own report folder.** The worker passes `--out <a temporary folder>` to `aeom check`, so it never touches `.aeom/reports`.
- **Only its own processes.** The worker stops the server it started and nothing else: never `pkill` or `killall` by name, which takes down the servers of the other workers in the middle of their checks.
- **Its own browser.** The worker looks at its page through `aeom capture` or its own Playwright, never through a browser pane the session shares: another worker can replace its tab at any moment.
- **A short report, in its reply.** A subagent returns what it found as text, never as a file of its own. The worker ends with ten lines at most: done or not, what it changed in one line, its kit candidates, any journey step it renamed or shortened and, for a direction, the banned look it is closest to and its two plain sentences. Nothing else: no list of what it checked, no capture paths. Keep that reply in `$MAIN/.aeom/runs/$RUN/<worker>/report.md` yourself, so a session that takes the run up finds it.
- **Commit first, check after.** The worker commits as soon as its work is in place, then checks and commits fixes. A worker that stalls during its checks leaves committed work behind.

If a worker stops without committing, look at its worktree: when the work is there and stays inside its files, commit it yourself and say so.

## 3. Kit wave: one worker

Create a worktree for the kit worker from the run branch:

```bash
git worktree add "$WT/$RUN-kit" -b aeom/$RUN-kit aeom/$RUN
```

Note the commit the worktree started from (`KIT_BASE=$(git rev-parse aeom/$RUN)`), then launch one subagent with the kit brief below. When it is done, check its diff touches only shared files (`git -C "$WT/$RUN-kit" diff --name-only $KIT_BASE HEAD`). Anything else: refuse the worker's work, say why. Otherwise merge it into the run branch.

**Kit brief.** Give the worker: the worktree path, the shared files it may edit, the kit failures with their reasons, the base principles (`aeom principles`), and the kit candidates the last run left, if any: the most recent `.aeom/runs/*/kit-candidates.md` other than this run's (`ls -t .aeom/runs/*/kit-candidates.md | grep -v "/$RUN/" | head -1`), pasted in full. Ask it to:

> Build one art direction for the whole app, held in the shared files only (partials such as a header are inserted into pages, not served on their own): colour, type and spacing tokens, the header and navigation every page will use, the buttons, links and the empty, error and loading states. It must be specific to this product, not a generic template. Every clickable thing gets a pointer cursor and a visible hover and focus. The header stays when you scroll (it sticks, or comes back on the way up) and takes a quarter of a phone's screen at most. A label holds on one line; repeated items such as cards keep one shape, a title that would wrap clamped with an ellipsis and its lines reserved; no text is cut without one. On a phone, what one taps is 24 by 24 px at least or 24 px from the next target, and a field's text 16 px; text is 12 px at least, lines 90 characters at most, and zoom is never forbidden. Text reaches AA contrast. Do not edit any page. Write at the top of the main shared file, in a comment, how pages use the kit (which file to link, which partial to include, which classes exist). Commit your work in the worktree.

**Kit brief for a style kept** (step 4). Give the worker the same, and ask instead:

> Keep this app's identity exactly as it is: its colours, its fonts, its logo, its layout conventions. It is the client's charter, not yours to improve. Where pages disagree, the home page's style is the charter, and the others come to it. Gather that style into the shared files as tokens, the header and navigation every page will use, the buttons, links and the empty, error and loading states, and fix only what fails: every clickable thing gets a pointer cursor and a visible hover and focus; the header stays when you scroll; a label holds on one line, repeated items keep one shape and cut text ends with an ellipsis; on a phone, a target is 24 px or 24 px apart and a field's text 16 px; text is 12 px at least, lines 90 characters at most, zoom never forbidden; a colour changes only where its contrast fails AA, to the nearest shade of the same hue that passes; a missing empty or error state is drawn in the existing style. Never add a colour, a font or a mark the app did not have. `not-generic` and `not-ai-default` are not yours to fix: they judge the charter, which stays. Do not edit any page. Write at the top of the main shared file, in a comment, how pages use the kit. Commit your work in the worktree.

## 4. Screen wave: one worker per page that still fails, all at once

**Who gets a worker.** Once the kit is merged (section 3, or the direction applied, section 2b step 9), measure the pages as they now are, before any page worker starts: the pages of `before` and the routes it could not load, as step 7 of « Without an option » lists them. `aeom capture --pages <them>`, `aeom check --pages <them>`, then the page judge of the `aeom-judge` skill with one voter only, its steps 2 to 4 (step 3 with `--changed-since .aeom/runs/$RUN/before`, so a page the kit did not change keeps its verdict), then `aeom judge --voters 1`; then `aeom snapshot .aeom/runs/$RUN/kit-look`. A page that would get a worker (never a screen the direction rebuilt, which joins only for its journey findings) gets none when it loads, no check fails on it, no principle fails on it but those a kept style leaves to the charter (`not-generic`, `not-ai-default`), and no journey finding falls on it: the kit fixed it alone. Write those pages in `.aeom/runs/$RUN/no-worker.json`, a JSON list of routes, and tell the user. Every other page gets a worker, and its brief gives what fails on it now, from this measure, not from before the kit. Section 5 measures every page at the end, those without a worker included, and never puts one of them back: no worker touched it. When the run has no kit (the style kept and only journeys failing, step 4), there is nothing to measure: skip this.

Note the commit every page worktree starts from (`WAVE_BASE=$(git rev-parse aeom/$RUN)`), then create each page's worktree from the run branch, which now has the kit:

```bash
git worktree add "$WT/$RUN-<page>" -b aeom/$RUN-<page> aeom/$RUN
```

Launch every page worker at the same time, in the background. Each gets the page brief. When they are done, check each diff against `$WAVE_BASE`, never against the run branch, which moves as pages merge: `git -C "$WT/$RUN-<page>" diff --name-only $WAVE_BASE HEAD` must list only that page's own files. Refuse any worker that strays. Merge the accepted ones into the run branch one after another: their files are disjoint, so they never conflict.

Collect what each worker calls a kit candidate into `.aeom/runs/$RUN/kit-candidates.md`, with the page it came from.

**Promote the kit candidates** before measuring, when there are any: two pages that each drew their own secondary button leave two secondary buttons. One worker, in its own worktree from the run branch, adds each candidate to the shared files in the kit's style, once, and makes every page that drew one use the kit's version instead. Its diff touches the shared files and the files of those pages only: refuse it otherwise. Merge it, and say in `kit-candidates.md` what was promoted. A candidate it leaves, because it belongs to one page only, stays there for the next run's kit wave.

**Page brief.** Give the worker: its worktree path, the files of its page and nothing else, the page's failing checks and principles with their reasons, as the measure after the kit found them, the journey findings that fall on its page (section 2: the journey, the step, the principle or the break, what the user lives, and the step's capture), the journey files that cross it, read-only, and where the kit says how to use it. Ask it to:

> Rebuild this page on the kit: use its header partial, its stylesheet and its classes, and drop the page's own styling of anything the kit covers. Fix every failure listed. Keep the page's content and purpose. Fix the journey findings with what a page may change: the order of its blocks, its copy and labels, a state (empty, error, done), a link or a button to an action that already exists. Never add or remove a piece of data, business logic or a call to the server, even one that fails today: render its failure as a state instead; never a state that claims something happened when nothing did. A journey finding your page cannot fix alone, such as one in the navigation, is a kit candidate: say so. If you rename something a journey clicks, or open a shorter path, say so in your reply, with the new steps. If the kit lacks something you need, add it in your page file and say in your reply that it is a kit candidate. Edit only your page's files. Commit your work in the worktree.

Before section 5 replays the journeys, rewrite in `.aeom/journeys/` the steps the workers said they renamed or shortened, the same name and goal, and commit them on the run branch: a label a worker renamed would break the old file, not the journey.

When the style is kept (step 4), add to the page brief: the page keeps the app's identity, its colours, fonts and logo, and only what fails changes; `not-generic` and `not-ai-default` are left to the charter.

## 5. Measure, keep only what got better

**The project's own files first.** A new palette can leave behind the files a project derives from its styles: icons, e-mail colours, a web manifest. On the run branch, run the scripts of the project that make them (look in `package.json` for scripts such as `icones`, `emails`, `generate`), commit what they change, then run its tests and its lint. A test that fails because a derived file is out of date is fixed by running its script again, never by changing the test; one that fails for another reason is the run's to fix, or names the worker to send back. Do the same after applying a direction (section 2b, step 9) and before the PR.

On the run branch:

```bash
aeom capture --widths "$WIDTHS"
aeom check --widths "$WIDTHS"
```

Run the judge again with the `aeom-judge` skill, judging only what changed since the before (`aeom judge --changed-since .aeom/runs/$RUN/before`, its step 3), then:

```bash
aeom snapshot .aeom/runs/$RUN/after
aeom compare .aeom/runs/$RUN/before .aeom/runs/$RUN/after
```

If the project has key journeys, check that no worker added a feature:

```bash
aeom journey --widths "$WIDTHS" --out .aeom/runs/$RUN/journeys-after
aeom guard .aeom/runs/$RUN/journeys-before .aeom/runs/$RUN/journeys-after --base $KIT_BASE
```

It refuses a call the app never made, new fields sent to a call it made, and a change to a file `protected` at `$KIT_BASE` or now. If it says there is no `protected` list, it compared the calls only: give the config one (section 0) and guard again before trusting it. Whatever it refuses, find the worker whose diff brought it and put that worker's files back (`git checkout $KIT_BASE -- <its files>` for the kit, `$WAVE_BASE` for a page), commit, and say so. Only when the user asked for a feature in so many words, pass their words with `--feature "<what they asked>"` and each call or file the request needs with `--allow`; say in the run what was let through. Both replays must walk the same journey files. If a file changed in between (a label a worker renamed), a refused call may be one the app always made on a screen the old file never reached: replay the before again with the new files, on the app as it was at `$KIT_BASE`, then guard again.

```bash
MAIN="$(git rev-parse --show-toplevel)"
git worktree add --detach "$WT/$RUN-base" $KIT_BASE
(cd "$WT/$RUN-base" && aeom journey --widths "$WIDTHS" --journeys "$MAIN/.aeom/journeys" --out "$MAIN/.aeom/runs/$RUN/journeys-before")
git worktree remove "$WT/$RUN-base"
```

The app starts from that worktree with its own start command; install its dependencies there first if it needs any.

**The journeys, judged once**, when the run judged them before (step 9 of section 2c; `/aeom --forcer-directions` judges none, and skips this). Once the guard passes, judge the replay of `journeys-after` with the journey judge of the `aeom-judge` skill, pointed at it: `aeom judge --journeys --captures .aeom/runs/$RUN/journeys-after --votes .aeom/runs/$RUN/journeys-after/votes --out .aeom/runs/$RUN/journeys-after`. The before already has its critique, step 9's: copy it beside its replay, `cp .aeom/reports/judge-journeys.json .aeom/runs/$RUN/journeys-before/`. Then, with no duel:

```bash
aeom compare --journeys .aeom/runs/$RUN/journeys-before .aeom/runs/$RUN/journeys-after --by-critique --base $KIT_BASE
```

It says, journey by journey, what the page wave cleared and what still fails. A journey it sends back because it breaks where it did not, or because its critique fails more principles than before: `aeom journey --by-page --out .aeom/runs/$RUN/journeys-after --critique .aeom/runs/$RUN/journeys-after/judge-journeys.json` names the page of that break or that step; put that page back like a page that is not `better`, below, and say why. A journey it sends back because nothing got better sends nobody back: it is as it was. When pages were put back, replay the journeys again into `journeys-after`, judge them again and run the ratchet again before step 6 reads them.

With the style kept, check that it was, page by page: the style judge of the `aeom-judge` skill, three judges comparing each page before and after, then `aeom judge --style-kept --captures .aeom/runs/$RUN/after/captures --votes .aeom/runs/$RUN/style/votes --out .aeom/runs/$RUN/style`. A page that fails `charter-kept` changed the charter: find what changed it, the page's own diff since `$WAVE_BASE` or the kit's since `$KIT_BASE`. The page's own: put its files back like a page that is not `better`, below, and say why. The kit's, or every page failing: revert the kit's merge and every page merge after it, so the run branch holds the journeys commit alone, show the user the before captures and what the kit changed, and stop the run there.

For every page that is not `better`, unless it is in `no-worker.json` (no worker touched it) or a journey the ratchet kept crosses it (a page whose worker fixed only journey findings keeps its own count, and stays for the journeys it made better), put its files back as they were before the screen wave (`git checkout $WAVE_BASE -- <the page's files>`); when journey files were rewritten for that page's new labels or paths (section 4), put them back too (`git checkout $WAVE_BASE -- .aeom/journeys/<those files>`), and commit. Such a page still renders through the new kit, so it is neither the page before the run nor the page after the wave: capture, check and judge again, snapshot to `.aeom/runs/$RUN/after-revert`, and compare that with `before`. Say which pages were put back, why, and how they now compare. If the kit itself made a page worse, say so: putting the page back cannot undo the kit.
