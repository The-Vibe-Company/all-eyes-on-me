# The bench

Three apps whose defects were noted by hand, and what `/aeom` finds and fixes of them. It measures, app by app:
- the noted defects AEOM found, and fixed, out of the total;
- the regressions: a check or a principle that passed before the run and fails at its end;
- the features slipped in: what the guard refuses over the whole run;
- what AEOM found beyond the list, to add to it or reject;
- the tokens the run used, every agent included, for information.

## What it holds

- `bench.json`: the apps. Each one names its code (`app`), the config its run starts from (`config`: how it starts, its fake sign-in, its protected files), its key journeys (`journeys`) and its defects (`defects`).
- `journeys/<app>/`: the key journeys, recorded in advance so the defects can name them, and so the guard and the ratchet measure the same journeys on every run.
- `defects/<app>.json`: the defects, noted by hand before AEOM ever ran on the app. Each names a screen (its route) or a journey (its slug), the check or principle at fault (`aeom principles` lists them; `loads` for a screen that does not load, `breaks` for a journey that breaks), and what is wrong, in words. `"sure": false` marks a defect its note-taker doubts, for whoever reviews the list; the grading counts it like the others.
- The demo app is `examples/ugly-app`. The two others, in `apps/`, were made by an agent that knew nothing of AEOM, as a first version for a client.

## Running it

One app after the other, in one Claude Code session that runs nothing else: the token count takes every model call the session and its agents made while the run lasted.

1. `node bench/prepare.mjs <app> <an empty folder>` puts the app in a fresh git repository, with its config and journeys.
2. In that folder, `/aeom` with no option, on the app's fake data. The product sheet AEOM writes keeps the recorded journeys, under their names. The repository has no remote: the run ends at its branch.
3. When the run is over, `aeom tokens .aeom/runs/<run>` (the skill's last step), then `aeom bench grade .aeom/runs/<run> --defects <this repository>/bench/defects/<app>.json --app <app>`. It writes `grading.json` in the run's folder and says, defect by defect, what AEOM said.
4. An app that does not start: `aeom bench grade .aeom/runs/<run> --defects … --app <app> --not-started "<why>"`, and go on with the others.
5. Last, `aeom bench table <the three grading.json> --out benchmark.json`.

## How a defect is matched

A noted defect is **found** when AEOM failed the same screen or journey on the same check or principle before the run (its `verdict.json`), and **fixed** when it no longer fails there at the end. A defect AEOM saw under another principle is not matched: it shows under what AEOM found beyond the list, with what AEOM said, for the list to be corrected by hand.

Captures and run folders stay on the machine that ran the bench. Only the numbers of the table leave it.
