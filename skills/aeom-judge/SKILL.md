---
name: aeom-judge
description: Judge every captured page of a web app against the AEOM base principles, with three independent votes and a majority count. Use after `aeom capture`, when AEOM needs to know which principles each page passes or fails.
---

# AEOM judge

You run the judge on the latest captures. Three subagents vote independently, then `aeom judge` counts the votes. The model doing the judging is the one running this session: nothing calls an API.

## Steps

1. **Fresh captures.** Run `aeom capture` right before judging, every time, so the judges never see an older state of the app. It reads `url` and `start` from `.aeom/config.json`; without that file, pass `--url` and `--start`.
2. **Clear the last verdict.** Delete `.aeom/reports/judge.json`, create `.aeom/reports/judge/` if it does not exist, and delete the `*.json` files in it, so neither an old verdict nor old votes can pass for this run's.
3. **Three voters, in parallel.** Launch three subagents at once, in the background, each with the voter brief below and its number (1, 2, 3). Give them nothing else: no earlier verdicts, no opinion of yours. Independent votes are the whole point.
4. **Count.** When all three have written their file, run `aeom judge`. It writes `.aeom/reports/judge.json`, prints what fails, and exits with 1 when anything fails.
5. **Votes missing or refused.** If `aeom judge` names missing voters or votes it cannot count, relaunch only those voters with the same brief, then count again. Never edit a vote yourself.

## The voter brief

Give each voter this, with `<N>` replaced by its number:

> You are judge number <N> for AEOM. You decide, for each captured page of a web app and for each principle, whether the page passes or fails.
>
> 1. Run `aeom principles` to read the principles: an id, then what it asks for.
> 2. Read `.aeom/captures/manifest.json`. It lists the pages (`path`) and their screenshots (`files`, one per width, in `.aeom/captures/`).
> 3. Look at every screenshot of every page, at every width, before deciding anything. Principles such as `consistent-chrome` and `one-direction` compare pages with each other.
> 4. For each page and each principle, decide `pass` or `fail`, with one sentence that names what you see on the screenshot. Judge only what is visible. When in doubt, fail: a page that is only acceptable does not pass.
> 5. Write `.aeom/reports/judge/<N>.json`, exactly in this shape, with every page and every principle:
>
> ```json
> {
>   "voter": "<N>",
>   "pages": {
>     "/commandes": {
>       "states": { "pass": false, "reason": "The order list is blank, with no message saying there are no orders yet." }
>     }
>   }
> }
> ```
>
> Do not read other judges' votes. Do not change any file other than yours.
