# Tender: a service status tool, two rounds

A real `/aeom directions --tender` run of 27/11/2026, on a call for tenders for a tool that follows a hosting service for a local authority: its status, its incidents with their deadlines in business hours, its monthly availability against 96 %. The product and the buyer are not named here.

**Round 1, refused whole.** Six directions; the person's verdict, word for word: « c'est brouillon, pas beau ; beaucoup d'infos, sans tooltip, rien de dépliable, tout affiché, il y a un effet masse pas ouf ». The screening judge named none of them and advised the loudest, a full-width red band (`screening-1.json`).

**Round 2, kept.** Same spec, same sources, same families of type; only the brief changed: `brief-round-2.md`, the person's two rules of taste, and one very finished product interface as a reference of level (`references.md`). Its screening is `screening-2.json`; its judge wrote the names without their `-2` the first time, and `aeom tournament compare` refused without saying which names it expected.

## What was measured

`measures.json`, each page at 1280 × 800, before the run's folder was lost with the temporary worktree it lived in: its pages are not kept here. `tender-park-tracking/` keeps a round refused for the same reasons, pages and all.

| | Round 1 | Round 2 |
| --- | --- | --- |
| `aeom check` through `aeom mockups` | 6 of 6 fail (overflow, cursor, header, focus, nested card, side stripe) | 6 of 6 pass |
| Folds and tooltips on a page (`<details>`, popover, `role="tooltip"`) | 0 everywhere | 7 to 17 |
| Words shown before anything is opened | 412 to 1,743 | 248 to 378 |
| Words in the home page's HTML | 480 to 2,350 | 740 to 2,430 |

Round 2 holds more text than round 1: the difference is not saying less, it is showing the summary first and folding the rest. The words shown before anything is opened tell the two rounds apart where no other measure does: `aeom check`'s layers fails a page over 400, and `packages/core/src/checks/checks.test.ts` keeps these measures on its side.

## What it changed in AEOM

- `skills/aeom/directions.md`, **For a tender**: **Layered reading**, every requirement within reach rather than in sight, **Readable first** in numbers, **Pared down, never coarse**; **A direction that dares**: one strong gesture in the calm register, and what comes first when they pull apart.
- `skills/aeom/phase-mockups.md`: the mockup brief folds without a script, keeps its working files in `.work/`, and looks at its own work and checks it before replying; references of level beside those of the kind.
- `skills/aeom/phase-directions.md`: the screening names a mass and a finish below a serious agency's, opens the pages, and keys its answer by the names it is given.
- `aeom check`: layers, on mockups; side-stripe, the bar along a block's top too.
- `aeom tournament compare`: a name without its round's suffix is taken for the one direction it names, and a name it cannot place is said with the names expected.
