---
name: aeom
description: Run All Eyes On Me on a web project. Captures every page, runs the measurable checks and the judge, fixes the shared kit with one worker then every page with one worker each in parallel, and keeps only the pages that got better, on a run branch with a before and after for each page. With --directions, first builds six contrasting art directions on the home page and lets the judge pick one in a knockout. With --ux, first understands the product on its own and writes .aeom/product.md: what the app is for, who uses it, its main loop and its key journeys. Use when the user types /aeom or asks AEOM to fix, polish or redesign a project's frontend.
---

# /aeom

You are the AEOM coordinator. You do not edit the project's frontend yourself: workers do. You plan, launch, merge, measure, and keep only what got better.

`aeom` is the AEOM CLI. In the AEOM repository itself, run it as `node packages/cli/dist/index.js`.

## 0. Before you start

- **The app.** `.aeom/config.json` gives `url` and `start`. If it is missing, find how the project starts (its package.json scripts, README), check that the app starts with that command (`aeom capture --start "<command>" --url <url> --pages / --out .aeom/runs/start-check`, which starts the app and stops it after), and only then write the file; ask the user once only if nothing says it.
- **A sign-in, when the app needs one.** AEOM signs in only with a fake account, never a real one: the project's own test account, or one the user gives. Give the config a `login`: `{ "path": "/connexion", "account": "<a JSON file of the account's fields by label>", "submit": "<the button's name>" }`. Capture, check and journeys then sign in once, before they start, and never print or report the account's values. No fake account and no way to make one: stop and ask the user for one.
- **What only a feature touches.** Give the config a `protected` list of the files that hold the app's data or logic, as globs: the database schema and migrations, the API routes, the server code, such as `["src/lib/db/**", "src/app/api/**"]`. `aeom guard` refuses any change to them.
- **A clean tree.** `git status` must be clean. Never stash or discard the user's work: stop and say so.
- **The run.** `RUN` = `run-<YYYYMMDD-HHMM>`. Create the run branch from the current branch: `git checkout -b aeom/$RUN`. Everything this run keeps ends up on that branch, never on the user's branch.

## Show as you go

The user follows the run through its captures, not through a report at the end. Send images into the session (as files when the session can, otherwise their paths) every time something visible lands, without waiting to be asked:

- **Before**: the captures of section 1, with the count of what fails.
- **Each direction** as soon as it is captured, then the sheet of all six.
- **The screening and the champion**, with the reasons that decided it.
- **The kit** once merged, on the page that shows it best.
- **Each page** as it merges, before and after side by side.
- **The end**: the comparison table and every page before and after.

One message per checkpoint, a line of context with the images, no more. A long wave still sends something at least every few minutes: the latest page that landed. The user reacting to a capture is feedback, not an interruption: take it and keep going.

## 1. Look

```bash
aeom capture
aeom check          # exits 1 when something fails, which is expected here
```

Then run the judge with the `aeom-judge` skill: three independent votes, then `aeom judge`. Then keep a copy:

```bash
aeom snapshot .aeom/runs/$RUN/before
```

If the project has key journeys (`.aeom/journeys/`), replay them now, before anything changes: `aeom journey --out .aeom/runs/$RUN/journeys-before`. It is what `aeom guard` compares with in section 5.

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
- **Only its own processes.** The worker stops the server it started and nothing else: never `pkill` or `killall` by name, which takes down the servers of the other workers in the middle of their checks.
- **Its own browser.** The worker looks at its page through `aeom capture` or its own Playwright, never through a browser pane the session shares: another worker can replace its tab at any moment.
- **Commit first, check after.** The worker commits as soon as its work is in place, then checks and commits fixes. A worker that stalls during its checks leaves committed work behind.

If a worker stops without committing, look at its worktree: when the work is there and stays inside its files, commit it yourself and say so.

## 2b. Directions (only with `/aeom --directions`)

Instead of fixing the current look, start from six new ones and keep the best.

1. **Six sources.** Follow [directions.md](directions.md): list twelve sources from the product's own world, pick six far apart, and drop any whose obvious rendering is a banned look. Give each a short slug, such as `nuancier`.
2. **Six workers, at once.** Note the run checkout's root first (`MAIN="$(git rev-parse --show-toplevel)"`): every path below that starts with `$MAIN` must stay absolute, because commands run from inside other worktrees. For each source, create a worktree from the run branch (`.aeom/worktrees/$RUN-dir-<source>`) and launch a worker with the direction brief. Each owns the shared files and the home page's files in its own worktree; they never see each other.
3. **Capture each one.** For each worktree, from inside it, start its app on its own port and capture the home page only, with the run checkout's CLI, since a fresh worktree has no build:
   `node "$MAIN/packages/cli/dist/index.js" capture --start "<start command with PORT=<port>>" --url http://localhost:<port> --pages / --widths 1280 --out "$MAIN/.aeom/runs/$RUN/directions/<source>"`, then copy `index@1280.png` to `"$MAIN/.aeom/runs/$RUN/directions/<source>.png"`. A direction that does not start or does not build gets no capture: say so, and leave it out of the tournament.
4. **Show them.** `aeom sheet --out .aeom/runs/$RUN/directions/sheet.png <source>=<its capture>...` with all six, the failed ones included, and show the sheet to the user.
5. **Screen out the banned looks.** Before the bracket, launch three screening judges at once, each with the sheet and the banned looks from directions.md, and ask each to name the directions one of the banned looks describes. A direction named by two of the three is out; say which and why. If exactly one remains, it is the champion without a tournament; say so. If none remains, stop and say so: build six new directions rather than crown a banned one.
6. **Knockout.** `aeom tournament start --dir "$MAIN/.aeom/runs/$RUN/directions" <the sources still in>`. Then, until there is a champion: `aeom tournament next --dir "$MAIN/.aeom/runs/$RUN/directions"` names a duel and its two captures; launch three duel judges at once with the duel brief; when all three reply, record their votes one after another with `aeom tournament vote --dir "$MAIN/.aeom/runs/$RUN/directions" --duel <n> --voter <v> --winner <source> --reason "<why>"`. Never let the judges write the tournament file themselves: three writers at once lose votes. `aeom tournament status --dir "$MAIN/.aeom/runs/$RUN/directions"` shows the bracket and the reasons. Duels of the same round are independent: run them at once.
7. **Apply the champion.** Merge the champion's worktree branch into the run branch: its shared files become the kit and its home page is done. Skip the kit wave, and run the screen wave (section 4) on every other page, then measure (section 5) as usual.

**Direction brief.** Give the worker its worktree path, the shared files and the home page files it may edit, the product (what it sells or does, for whom, in which language), its source, the banned looks from directions.md, and the base principles. Ask it to:

> Build one art direction for this product from your source, in real code: the shared kit (tokens, header, buttons, states) and the home page rebuilt on it. Take from the source what makes it recognisable (its colours, type, layout conventions, marks) and turn it into a web kit; do not draw a picture of it, and do not imitate a famous site. Before you commit, say which banned look yours is closest to and what keeps it apart; if one of them describes it, start again. Keep the home page's content and purpose. Commit as soon as it works, then check it with `aeom check` on your own port and fix what fails.

**Duel brief.** Give each duel judge the two capture paths, the two source names, the banned looks from directions.md, and the base principles. Ask it to:

> Look at both screenshots. First: if one of the banned looks describes one page and not the other, the other wins. Then judge against the base principles, and on which is more specific to the product and less like anything an AI would propose. Reply with only a JSON object: `{"winner": "<source>", "reason": "<one sentence naming what you see>"}`.

## 2c. Understand the product (only with `/aeom --ux`)

AEOM finds out on its own what the app is for and writes it down in `.aeom/product.md`, the product sheet. The user corrects it later, whenever they like: never ask them, never wait for them. [product.md](product.md) gives the sheet's shape and what AEOM may write in it.

Set `RUN` as in section 0, but create no run branch before step 10. The clean-tree rule of section 0 does not count `.aeom/product.md`, `.aeom/product.base.md` and `.aeom/journeys/`: AEOM writes them in this mode, and the user's uncommitted corrections there are exactly what the next run keeps; any other uncommitted change still stops the run. Until step 10, AEOM changes nothing in the project but `.aeom/`, launches no worker and commits nothing; step 10 is the only one that changes the app, on a run branch, which carries the journey files with it. The run ends after the steps below; sections 3 to 6 belong to the visual redesign.

1. **Start from what is there.** If `.aeom/product.md` exists, read it first: what the user wrote in it is the best source there is.
2. **Read the code.** The routes and screens, what each one shows (lists, forms, empty and error states), the actions a user can take and where they lead, the words the app uses. Note the files you read: they become sources.
3. **Use the app.** `aeom capture --out .aeom/runs/$RUN/look` visits every screen reachable from the start page at both widths. Look at every capture, then follow what a user would do: which screen they land on, what they click next, where they get stuck. Send the captures to the user as you go, a few at a time, with one line on what you are looking at. If the app does not start, stop: say why, with the start command's output, and write nothing.
4. **Draft the sheet** in `.aeom/runs/$RUN/product.md`, following [product.md](product.md): what the app is for, who uses it, the main loop, three to five key journeys in numbered steps. Every part and every journey names its source, `(seen: <route or file>)`, or says `(to confirm)`. Write only what you saw or read.
5. **Write it**: `aeom product .aeom/runs/$RUN/product.md`. It refuses a draft that misses a part, a journey's steps or a source, and says what to fix: fix the draft and run it again. It keeps what the user corrected since the last run. Tell the user what it printed (what was kept, updated, added), and show the sheet.
6. **Record each journey as you walk it.** For each key journey of the sheet, write `.aeom/journeys/<slug>.json`, the same steps as a browser can replay them; [journeys.md](journeys.md) gives the format. Name each target by its role and name as the page exposes them, by its text when it has no role, inside its container when several match.
7. **Replay them**: `aeom journey`. Every journey runs in a fresh browser at both widths, with a capture after each step and a sheet per journey and width. A step that does not exist in the app is a mistake, not a finding. A mistake in the journey file: fix the file and replay. A mistake in the sheet (a journey the app never offered): fix the draft, run `aeom product` again, record the journey again, then replay. A journey that breaks where the sheet says the app breaks it is right: keep it, it is the first finding. Show the user each journey's sheets, one per width. If the app keeps data (accounts, orders, sessions), give `.aeom/config.json` a `reset` command that puts it back, so every replay starts from the same state; AEOM warns when there is none.
8. **No feature, ever, unless asked.** AEOM changes navigation, the order of steps, how screens group, shortcuts to actions that already exist, copy and states; never data, business logic or a call to the server. Steps 1 to 9 change nothing in the app, so nothing there can add one: `aeom guard` runs wherever AEOM does change it, before each merge of step 10 and after the visual waves (section 5).
9. **Critique each journey**: run the journey judge of the `aeom-judge` skill (three votes, then `aeom judge --journeys`). It says, journey by journey, which principles fail, at which step, with the step's capture, and which journeys break. Show the user each journey's sheet with its findings, one journey per message, worst first.
10. **Rebuild the journeys.** If the critique found nothing, stop here and say so: the app is not touched and no run branch is made; only `.aeom/product.md` and `.aeom/journeys/` were written. Steps 1 to 9 change nothing but `.aeom/`. To fix what the critique found, AEOM now works like a fleet run: create the run branch (`git checkout -b aeom/$RUN`), commit the journey files and the config on it (`git add .aeom/journeys .aeom/config.json && git commit -m "aeom: the key journeys"`), so every worker's worktree has them, the `reset` of step 7 included, and the user's branch keeps none of the run's changes, then note where it starts, `BASE=$(git rev-parse HEAD)`, and the run checkout's root, `MAIN="$(git rev-parse --show-toplevel)"`. `.aeom/runs/` exists only there: a command run from a worker's worktree gives its folders from `$MAIN`.
    1. **Keep a before**: first `aeom capture` (into `.aeom/captures`, where `aeom check` and the judge read), `aeom check` and the page judge, as in section 1, then `aeom snapshot .aeom/runs/$RUN/before`; only then `aeom journey --out .aeom/runs/$RUN/journeys-before`. The journeys change the app's data and nothing resets it after the last one, so the pages are measured before they run.
    2. **Plan**: `aeom journey --plan --out .aeom/runs/$RUN/journeys-before` says which screens several journeys cross and which belong to one journey. Read the code to find the files behind each route. A file behind screens of two groups goes to the shared worker: two workers never write the same file.
    3. **Shared wave, one worker**: the navigation and every shared file, with every finding on a screen those files render, a journey's own screen included, since that journey's worker cannot touch them. Then **journey wave, one worker per journey** with the files only its screens use and the findings left on them, all at once, each in its own worktree (the rules of "Briefing any worker" apply).
    4. **The journey brief** gives the worker its files, the findings (principle, step, what the user lives, the capture), and the only changes it may make: the order of steps, how screens group, a shortcut to an action that already exists, the copy, a state (empty, error, done). Never a new piece of data, business logic or a call to the server; never a state that claims something happened when nothing did. A finding those changes cannot fix stays: the worker says so instead of working around it. The brief also gives the journey files the worker's screens appear in, read-only: a worker never edits `.aeom/journeys/`, since other workers' journeys cross the same files. When it renames something a journey clicks, or opens a shorter path, it says so in its reply, with the new steps.
    5. **Before merging a worker**, check its version as the user would now walk it, since a label it renamed or a step it removed breaks the old journey files. Note the commit its worktree started from, `START`, when you create it. Copy the run branch's `.aeom/journeys/` to `$MAIN/.aeom/runs/$RUN/<worker>/journeys/` and rewrite there the journeys its reply changes: the same name and goal, the new labels, the shorter path. If the config has a `login`, its account file is not in the repository: copy it from `$MAIN` into the worktree at the same path, never commit it, and delete it with the worktree. Then, from its worktree, with its own port (`<its app>` below stands for `--start "PORT=<port> <start command>" --url http://localhost:<port>`), in this order:
        - `git diff --name-only $START HEAD` lists only the files it was given: a worker that edited another's files, or committed the account file, is refused, whatever its replay shows;
        - its checks, before any journey changes the data: `aeom check <its app> --out "$MAIN/.aeom/runs/$RUN/<worker>/check"` exits 1 as soon as anything fails, failures the app already had included, so its exit says nothing here. Read its `check.json` against the before's, `$MAIN/.aeom/runs/$RUN/before/reports/check.json`, page by page and width by width: a check that passed before and fails now refuses the worker; a failure the before already had does not;
        - `aeom journey <its app> --journeys "$MAIN/.aeom/runs/$RUN/<worker>/journeys" --out "$MAIN/.aeom/runs/$RUN/<worker>/replay"` takes every journey that went to its end before to its end. The `reset` of the config must put back that worker's own data: if it resets something every worker shares, such as one database, replay the workers one after another;
        - `aeom guard "$MAIN/.aeom/runs/$RUN/journeys-before" "$MAIN/.aeom/runs/$RUN/<worker>/replay" --base $BASE` passes. A call it refuses on a path the old files never took may be one the app always made: replay the worker's journey files on the app at `$BASE` (the commands of section 5, with `$BASE`) and guard against that before counting it as a feature.

       Anything short of that is not merged: say why. Merge what passes into the run branch with `git merge --no-ff`, so that a worker can be sent back later as one merge, copy its journey files into `.aeom/journeys/` and commit them on the run branch. Show the user each changed journey's sheet before and after, with its step count.
11. **Keep only what got better**, journey by journey, once both waves are merged.
    1. **Critique both versions in their own folders**: `aeom journey --out .aeom/runs/$RUN/journeys-after`, then the journey judge on each replay. Step 9's verdict is in `.aeom/reports`, not beside the before replay, so judge the before too. Point each cohort of judges at that replay's captures and its own vote folder, never at the defaults of `aeom-judge`, then count:
        - `aeom judge --journeys --captures .aeom/runs/$RUN/journeys-before --votes .aeom/runs/$RUN/journeys-before/votes --out .aeom/runs/$RUN/journeys-before`;
        - the same with `journeys-after`.
    2. **Duels**: three judges compare each journey's old and new sheets (the duel brief of `aeom-judge`), writing into `.aeom/runs/$RUN/journeys-after/duels/`.
    3. **The ratchet**: `aeom compare --journeys .aeom/runs/$RUN/journeys-before .aeom/runs/$RUN/journeys-after --base $BASE`. A journey stays only if it goes to its end wherever it did before, the guard refuses nothing it does, and the judges prefer it. A call the guard refuses may be one the app already made at `$BASE` on a screen the old journey never reached: replay the new journey files there (the commands of section 5, with `--out .aeom/runs/$RUN/journeys-known`), then run the ratchet again with `--known .aeom/runs/$RUN/journeys-known`, whose calls count as made before. A finding counts as cleared only if the critique of the new version no longer finds it.
    4. **Send back what lost**: revert the merge of the worker whose journey came back (`git revert -m 1 <merge>`), and the commit of the journey files that came with it, so the files walk the app as it is again. A shared change stays only if every journey crossing its screens stays: if one comes back, revert the shared merge too. Then replay, critique, duel and compare again, until every journey left stays.
    5. **Show the end**: for each journey, the old and the new sheets side by side, the steps before and after, what was cleared and what still fails, and for each journey that came back, why. Everything the run kept is on `aeom/$RUN`, never on the user's branch.

## 3. Kit wave: one worker

Create a worktree for the kit worker from the run branch:

```bash
git worktree add .aeom/worktrees/$RUN-kit -b aeom/$RUN-kit aeom/$RUN
```

Note the commit the worktree started from (`KIT_BASE=$(git rev-parse aeom/$RUN)`), then launch one subagent with the kit brief below. When it is done, check its diff touches only shared files (`git -C .aeom/worktrees/$RUN-kit diff --name-only $KIT_BASE HEAD`). Anything else: refuse the worker's work, say why. Otherwise merge it into the run branch.

**Kit brief.** Give the worker: the worktree path, the shared files it may edit, the kit failures with their reasons, the base principles (`aeom principles`), and the kit candidates the last run left, if any: the most recent `.aeom/runs/*/kit-candidates.md` other than this run's (`ls -t .aeom/runs/*/kit-candidates.md | grep -v "/$RUN/" | head -1`), pasted in full. Ask it to:

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

If the project has key journeys, check that no worker added a feature:

```bash
aeom journey --out .aeom/runs/$RUN/journeys-after
aeom guard .aeom/runs/$RUN/journeys-before .aeom/runs/$RUN/journeys-after --base $KIT_BASE
```

It refuses a call the app never made, new fields sent to a call it made, and a change to a file `protected` at `$KIT_BASE` or now. If it says there is no `protected` list, it compared the calls only: give the config one (section 0) and guard again before trusting it. Whatever it refuses, find the worker whose diff brought it and put that worker's files back (`git checkout $KIT_BASE -- <its files>` for the kit, `$WAVE_BASE` for a page), commit, and say so. Only when the user asked for a feature in so many words, pass their words with `--feature "<what they asked>"` and each call or file the request needs with `--allow`; say in the run what was let through. Both replays must walk the same journey files. If a file changed in between (a label a worker renamed), a refused call may be one the app always made on a screen the old file never reached: replay the before again with the new files, on the app as it was at `$KIT_BASE`, then guard again.

```bash
MAIN="$(git rev-parse --show-toplevel)"
git worktree add --detach "$MAIN/.aeom/worktrees/$RUN-base" $KIT_BASE
(cd "$MAIN/.aeom/worktrees/$RUN-base" && aeom journey --journeys "$MAIN/.aeom/journeys" --out "$MAIN/.aeom/runs/$RUN/journeys-before")
git worktree remove "$MAIN/.aeom/worktrees/$RUN-base"
```

The app starts from that worktree with its own start command; install its dependencies there first if it needs any.

For every page that is not `better`, put its files back as they were before the screen wave (`git checkout $WAVE_BASE -- <the page's files>`) and commit. Such a page still renders through the new kit, so it is neither the page before the run nor the page after the wave: capture, check and judge again, snapshot to `.aeom/runs/$RUN/after-revert`, and compare that with `before`. Say which pages were put back, why, and how they now compare. If the kit itself made a page worse, say so: putting the page back cannot undo the kit.

## 6. Show

Show the user, page by page, the capture before and after (from `.aeom/runs/$RUN/before/captures` and `.aeom/runs/$RUN/after/captures`), the comparison table, what changed in the kit, and the kit candidates the workers left. End with the run branch name, ready to merge, and the commands to look at it. Remove the worker worktrees (`git worktree remove`) and their branches once merged.

## Rules

- One writer per file: the kit worker owns the shared files, each page worker owns its page. Nobody else edits them during the wave.
- Workers get only what their brief says. No worker sees another worker's work in progress.
- Never merge the run branch into the user's branch yourself.
