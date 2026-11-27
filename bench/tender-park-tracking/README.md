# Tender: a park's web maintenance tracker, one round refused

A real `/aeom directions --tender` run of 27/11/2026, on a call for tenders from a regional nature park for the maintenance of its websites in 2027: the space where the park drops a request, follows it to its resolution, reads the state of each site and the monthly report. The park, its sites, its places and the bidder are renamed here; the pages are otherwise as the workers drew them, their icons kept (Lucide, ISC, `LICENSE` beside them), their captures not.

- `source.md`: the spec, a neutral brief; `product.md`: the run's sheet; `references.md`: the products of the kind the session looked at.
- `brief-commun.md` and `brief-classique.md`: what the six workers were given. The person's two rules of taste were in it already, a summary first and the detail folded, the finish of a serious agency: the skill's « every requirement in sight » and « a direction that dares » won over them.
- `round-1/`: the six directions, `index.html` the tracker and `compte-rendu.html` the monthly report, and the screening's answer, `screening-1.json`.
- `after-fix/`: the same spec drawn again, one round, on the skill that reads in layers, with the person's rules of taste set aside so that AEOM's default alone drew it. Six directions; every page passes `aeom check` as the workers return it. The person has not judged it yet: it shows what the default now gives, not what they kept.

The person's verdict on the round, word for word: « quelque chose d'un peu ringard, très chargé, pas du tout épuré. Dans toutes les propositions, c'est un peu grossier, il y a beaucoup, beaucoup de choses », and of the accent bar along the top of a rounded card (`lauze`, its incident and its arbitration): « ce genre de banner, enfin de border là, c'est à bannir complètement ».

## What must hold

- Every direction of `round-1/` fails `aeom check`'s layers: 547 to 824 words shown on a page before anything is opened, and on the report pages nothing folds.
- `lauze`'s incident and arbitration fail side-stripe, a bar along their top; `moulinage`'s incident and `myrtilles`'s selected request, a stripe on their left.

- Every page of `after-fix/` passes layers and side-stripe: 254 to 392 words shown before anything is opened, 10 to 21 folds and tooltips a page.

`packages/core/src/checks/checks.test.ts` holds all three.
