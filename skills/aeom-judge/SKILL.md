---
name: aeom-judge
description: Judge every captured page of a web app against the AEOM base principles, or every replayed key journey against the journey principles, with one vote first and three independent votes on what it fails, counted by majority; on a new measure, only the pages whose captures changed. Used by /aeom after `aeom capture` or `aeom journey`, when AEOM needs to know which principles each page or journey passes or fails; not the user's command: to judge a front, the user types /aeom judge.
---

# AEOM judge

You run the judge on the latest captures. One subagent votes on everything first; two more vote, independently, only on what it failed; then `aeom judge` counts. What the first one passed stands on its vote: most of a front passes, and three votes on all of it cost three times as much for little. Launch every judge of this skill, voter or not, as an `aeom-judge` agent, the agent AEOM installs (the Agent tool's `subagent_type: "aeom-judge"`, not this skill): it runs on Sonnet with only what a judge uses, and without the project's CLAUDE.md, since judging against written principles needs neither the model that coordinates the run nor the project's rules. When the Agent tool lists no `aeom-judge`, launch `general-purpose` with `model: "sonnet"`. Nothing calls an API.

## Steps

1. **Fresh captures.** Run `aeom capture` right before judging, every time, with `--widths "$WIDTHS"` when the run noted its widths, so the judges never see an older state of the app. It reads `url` and `start` from `.aeom/config.json`; without that file, pass `--url` and `--start`.
2. **Clear the last verdict.** Delete `.aeom/reports/judge.json`, create `.aeom/reports/judge/` if it does not exist, and delete the `*.json` files in it, so neither an old verdict nor old votes, nor an old list of what to judge, can pass for this run's.
3. **Measuring again?** When the pages were judged before in this run and a snapshot holds that verdict (`before`, `after`…), run `aeom judge --changed-since <that snapshot>`: it writes in the votes folder `to-judge.json`, the pages whose captures changed. The voters judge only those; the others keep the snapshot's verdict. When none changed, go to step 6.
4. **One voter first.** Launch one `aeom-judge` agent, with the voter brief below and the number 1. Give it nothing else: no earlier verdict, no opinion of yours.
5. **Two more on what it failed.** Run `aeom judge --to-confirm`: it writes in the votes folder `to-confirm.json`, what voter 1 failed. When it says there is nothing to confirm, go to step 6. Otherwise launch two `aeom-judge` agents at once, in the background, each with the confirm brief below and its number (2, 3), and nothing else: independent votes are the whole point.
6. **Count.** Run `aeom judge`. It writes `.aeom/reports/judge.json`, prints what fails, and exits with 1 when anything fails.
7. **Votes missing or refused.** If `aeom judge` names missing voters or votes it cannot count, relaunch only those voters with the same brief, then count again. Never edit a vote yourself.

Pass the same `--captures`, `--votes` and `--out` to every `aeom judge` of one judging, `--changed-since` and `--to-confirm` included, when the run points the judge at its own folders. Step 2 clears that votes folder, whichever it is: a folder judged before, such as a replay's `votes` judged again after a send-back, still holds the last round's votes and lists, and `aeom judge` refuses them. The briefs then name that folder in place of `.aeom/reports/judge/`.

## The voter brief

Give each voter this, with `<N>` replaced by its number:

> You are judge number <N> for AEOM. You decide, for each captured page of a web app and for each principle, whether the page passes or fails.
>
> 1. Run `aeom principles` to read the principles: an id, then what it asks for.
> 2. Read `.aeom/captures/manifest.json`. It lists the pages (`path`) and their screenshots (`files`, one per width, in `.aeom/captures/`). A screenshot with `cut` stops at the top of a longer page, whose full height `cut` gives: judge what it shows. If the votes folder holds `to-judge.json`, judge only the pages it lists, and look at the others only to compare.
> 3. Look at every screenshot of every page, at every width, before deciding anything. Principles such as `consistent-chrome` and `one-direction` compare pages with each other.
> 4. For each page and each principle, decide `pass` or `fail`, with one sentence that names what you see on the screenshot. Judge only what is visible. When in doubt, fail: a page that is only acceptable does not pass.
> 5. Write `.aeom/reports/judge/<N>.json`, exactly in this shape, with every page you judge and every principle:
>
> ```json
> {
>   "voter": "<N>",
>   "model": "<the model you run on, as your system prompt names it>",
>   "pages": {
>     "/commandes": {
>       "states": { "pass": false, "reason": "The order list is blank, with no message saying there are no orders yet." }
>     }
>   }
> }
> ```
>
> Do not read other judges' votes. Do not change any file other than yours. Reply in one line: the file you wrote.

## The confirm brief

Give each of voters 2 and 3 this, with `<N>` replaced by its number:

> You are judge number <N> for AEOM. Another judge failed some pages of a web app on some principles; you decide on your own, without reading what it said, whether each of those pages passes or fails each of those principles.
>
> 1. Run `aeom principles` to read the principles: an id, then what it asks for.
> 2. Read `.aeom/reports/judge/to-confirm.json`: for each page, the principles to decide. Read `.aeom/captures/manifest.json` for the screenshots of each page (`files`, one per width, in `.aeom/captures/`; `cut` when the screenshot stops at the top of a longer page).
> 3. Look at every screenshot of those pages, at every width, and of the other pages when a principle compares pages (`consistent-chrome`, `one-direction`).
> 4. For each page and each principle listed, decide `pass` or `fail`, with one sentence that names what you see. When in doubt, fail.
> 5. Write `.aeom/reports/judge/<N>.json` in the voter brief's shape, with only the pages and principles listed.
>
> Do not read other judges' votes. Do not change any file other than yours. Reply in one line: the file you wrote.

## Judging journeys

The same, one vote first and three on what it fails, on the key journeys instead of the pages, after `aeom journey`:

1. **Fresh replays.** Run `aeom journey` right before judging, with `--widths "$WIDTHS"` when the run noted its widths.
2. **Clear the last verdict.** Delete `.aeom/reports/judge-journeys.json` and the `*.json` files of `.aeom/reports/judge-journeys/` (or of the votes folder the run passes), creating the folder if needed.
3. **One voter first**, with the journey brief below and the number 1, an `aeom-judge` agent. Nothing else.
4. **Two more on what it failed**: `aeom judge --journeys --to-confirm` writes `to-confirm.json` in the journeys' votes folder. When there is something to confirm, launch voters 2 and 3 at once, each an `aeom-judge` agent, with the journey brief, told to judge only the journeys and principles `to-confirm.json` lists, without reading what voter 1 said.
5. **Count**: `aeom judge --journeys`. A journey that broke on replay is a failure on its own, with no vote needed; the voters still judge what its steps show.
6. **Votes missing or refused**: relaunch only those voters, then count again.

### The journey brief

> You are judge number <N> for AEOM. You decide, for each key journey of a web app and for each journey principle, whether the journey passes or fails, as the person who wants what the journey is named after.
>
> 1. Run `aeom principles --journeys` to read the journey principles.
> 2. Read `.aeom/captures/journeys/report.json`. Each journey (`slug`, `name`) was replayed at each width (`runs`); each run lists its steps in order, with the action, the route after it, the capture (`capture`, in `.aeom/captures/journeys/`; with `cut`, it stops at the top of a longer page, whose full height `cut` gives), what the page said in a dialog, and where it broke, if it did. Each run also has a sheet of all its steps (`sheet`).
> 3. Look at every journey's sheets and step captures, at every width, before deciding anything.
> 4. For each journey and each principle, decide `pass` or `fail`, with one sentence that says what the user lives, naming what you see, and the number of the step where it shows (`step`). When in doubt, fail.
> 5. Write `.aeom/reports/judge-journeys/<N>.json`, exactly in this shape, with every journey and every principle:
>
> ```json
> {
>   "voter": "<N>",
>   "model": "<the model you run on, as your system prompt names it>",
>   "pages": {
>     "see-my-orders": {
>       "result-shown": { "pass": false, "reason": "After clicking Commandes, the list under Mes commandes is blank, with no word saying there is no order yet.", "step": 3 }
>     }
>   }
> }
> ```
>
> Do not read other judges' votes. Do not change any file other than yours. Reply in one line: the file you wrote.

## Comparing journeys

After the fleet rebuilt the journeys, three judges choose, journey by journey, between the old version and the new one. Launch them at once, each an `aeom-judge` agent with the duel brief below and its number, and nothing else.

### The journey duel brief

> You are judge number <N> for AEOM. For each key journey of a web app, you choose between its old version and its new one, as the person who wants what the journey is named after.
>
> 1. Run `aeom principles --journeys` to read what a good journey does.
> 2. The old replay is in `<before-dir>`, the new one in `<after-dir>`: each holds `report.json` and, for each journey (`slug`) and width, a sheet of its steps (`<slug>@<width>.png`).
> 3. For each journey, look at the old and the new sheets side by side, at every width, then choose the version that gets the user to their goal more surely: fewer steps they must hunt for, results they can see, no dead end, the same words all along. A version that looks nicer but takes the user longer loses.
> 4. Write `<after-dir>/duels/<N>.json`, exactly in this shape, with every journey:
>
> ```json
> { "voter": "<N>", "journeys": { "see-my-orders": { "winner": "after", "reason": "Mes commandes is now in the home menu, one step instead of a detour through the products." } } }
> ```
>
> `winner` is `before` or `after`. Do not read other judges' votes. Do not change any file other than yours. Reply in one line: the file you wrote.

## Judging a kept style

When a run keeps the app's style, three judges check, page by page, that it did. Launch them at once, each an `aeom-judge` agent with the style brief below and its number, and nothing else. Then count: `aeom judge --style-kept --captures <after-dir>/captures --votes <votes-dir> --out <out-dir>`.

### The style brief

> You are judge number <N> for AEOM. This app's style is a client's charter: the run was asked to fix what fails without changing it. You decide, for each page, whether it kept the charter.
>
> 1. Run `aeom principles --style-kept` to read the principle.
> 2. The captures before the run are in `<before-dir>/captures`, after it in `<after-dir>/captures`; each folder's `manifest.json` lists the pages (`path`) and their screenshots (`files`, one per width).
> 3. For each page, look at its before and after side by side, at every width: the colours, the fonts, the logo, the header.
> 4. Decide `pass` or `fail` for `charter-kept`, with one sentence naming what you see: a colour, a font, a mark that changed, or that nothing did but a shade for contrast. When in doubt, fail.
> 5. Write `<votes-dir>/<N>.json`, exactly in this shape, with every page of the after manifest:
>
> ```json
> { "voter": "<N>", "pages": { "/contact": { "charter-kept": { "pass": false, "reason": "The pink buttons are now green." } } } }
> ```
>
> Do not read other judges' votes. Do not change any file other than yours. Reply in one line: the file you wrote.
