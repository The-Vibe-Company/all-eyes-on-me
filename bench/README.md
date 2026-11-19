# The bench

Apps whose defects were noted by hand, to measure what `/aeom` finds and fixes on a front whose faults are known.

Each app is a folder:
- `app/`, the app itself: a link to `examples/ugly-app` for the demo, the code itself for the others;
- `aeom/`, what its project's `.aeom/` starts with: `config.json` (how it starts, its fake account, its reset) and `journeys/`, its key journeys;
- `defects.json`, the defects noted by hand, each with where it is (a route, `*` for the whole site, or a journey's name), what is wrong, and the checks or principles that would name it, none when nothing in AEOM names it yet. It never goes into the app's project: the run never sees it.
- `overlay/`, when the app carries what would tell the run its defects, such as the demo's README written for AEOM's tests: copied over the app, it replaces it.

Only the files git tracks are copied: an app's local data, such as `data/db.json`, stays home.

| App | What it is | Where it comes from |
| --- | --- | --- |
| `ugly-app` | A four-page shop, bad on purpose | Written by hand for AEOM's tests |
| `studio-respire` | Booking classes at a yoga studio | Built by an agent from an ordinary request, without AEOM |
| `factures` | A freelancer's invoices | Built by an agent from an ordinary request, without AEOM |

## Running it

```bash
aeom bench prepare ~/aeom-bench        # each app in a git repository of its own, checked to start
# in each of ~/aeom-bench/<app>, a Claude Code session: /aeom --autonome --sans-pr
aeom bench score ~/aeom-bench          # what each run found and fixed, written to benchmark.json
```

A run never tells the person what it costs: the score measures it with `aeom cost`, from this machine's transcripts.

## Reading the score

- **Found**: the run's verdict, before it changed anything, failed the defect's screen or journey on a check or principle that names it. The failure is quoted as proof.
- **Fixed**: found, and the end no longer fails it.
- **Regressions**: a check or principle that passed before and fails at the end, a screen gone, a journey that breaks only at the end.
- **Hidden features**: a call the app never made, refused by the guard.
- **Beyond the defects noted**: what the run found that the list does not have. Add it to `defects.json` when it is right, or note why it is not.

## The judge alone

A pass of `/aeom judge` costs far less than a full run, and its verdict decides everything a run does after it. The judge bench measures it alone, over several passes, to see what it finds and whether it says the same thing twice.

```bash
aeom bench prepare ~/aeom-bench               # once, as above
# in each of ~/aeom-bench/<app>, three Claude Code sessions, one after the other: /aeom judge --autonome
aeom bench score ~/aeom-bench --judge         # the last three passes of each app, written to benchmark-judge.json
```

- **Found**: how many defects each pass found, as a mean, then its lowest and highest; each defect with how many passes found it.
- **Beyond the list**: what the passes found that the list does not have, each with how many passes said it.
- **Verdicts that change**: what some passes fail and others do not, on the same screen or journey. A judge that says the same thing every time has none.
- **Since the judge bench before**: how far each mean moved. Every judge bench is kept in `history.jsonl`, with its date and AEOM's version; the first says it has nothing to compare with.

`--passes <n>` counts the last `n` passes instead of three. The score of a full run (`aeom bench score` without `--judge`) never takes a pass of `/aeom judge` for a run.
