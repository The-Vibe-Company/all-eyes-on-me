# The product sheet

`.aeom/product.md` says what AEOM understood of the app on its own, before it changes a screen. The user corrects it whenever they like; AEOM never waits for them. `aeom product <draft>` writes it. It refuses a draft that does not say what kind of product the app is, misses one of the four parts (and, for a game or a creative product, one of the four parts of its world), has fewer than three or more than five journeys, has a journey without numbered steps, or has a part or journey without a source, a source left as the `<…>` placeholder, or a part or journey that appears twice. The rest of what follows is for AEOM to follow; no command checks it.

## Read before you write

The project says more about itself than its screens do. Before drafting, read its own words: the `README`, a `CONTEXT.md` or glossary, `docs/` (decisions, ADRs, roadmaps, design notes), and whatever they point to about the product, its audience, its tone or its look. A line such as « des illustrations peintes entre Clash Royale et Hearthstone » outweighs anything AEOM could guess from the code. Cite what you read as the source, `(seen: README.md)`.

## Its shape

```markdown
# <The app's name>

## What kind of product
`tool`, `game` or `creative`, then a few words: « `game`: a persistent strategy game in the browser ». (seen: README.md)

## What it is for
Two to four sentences: what the app does, in its users' words, naming what it handles: what it sells, lends or tracks, its subject. The art directions start from these words: « a small online shop » gives them nothing to start from, « a shop for lamps, chairs and rugs for the home » does. (seen: <screen or file>)

## Who uses it
Who opens it, how often, on what device. (to confirm)

## The main loop
What a user does again and again, in order: the reason they come back. (seen: <screens>)

## Genre and fiction
For a game or a creative product only: its genre, and the world its users enter, in the project's own words. (seen: <file>)

## The feeling it aims for
For a game or a creative product only: what the user should feel, in one or two sentences. (seen: <file>) or (to confirm)

## References
For a game or a creative product only: the games or works it is like, named by the project or guessed. (seen: <file>) or (to confirm)

## Visual assets
For a game or a creative product, and for a tool that has some: what already exists, one line per family, with where it is and its style in plain words.
- `public/illustrations/especes/`: painted animals, heroic and cute, in warm golden light, with a soft painted finish. (seen: public/illustrations/especes/souris.webp)
- The logo: a flat wolf head, dark ink on lemon yellow. (seen: src/components/Logo.tsx)

## Key journeys

### <A journey, named by what the user wants: "See my orders">
Why: what the user is after, in one sentence. (seen: <screen or file>)
1. Open `/`.
2. Click "Produits" in the menu.
3. …
```

- **What kind of product** comes first. It starts with one of three words, in backticks: `tool` for something used to get a task done (a shop, a dashboard, a tracker, a form), `game` for something played, `creative` for a product whose point is a world, a story or a work (a comic, a music label, an interactive story, a portfolio). It is never a guess: say it from what you read or saw. A game with a shop is a game; a tracker with badges is a tool.
- **Four parts**, with these exact headings, then **three to five journeys** under `## Key journeys`, each a `###` heading. Every `###` under `## Key journeys` is a journey: a note goes in a part of its own.
- **A game or a creative product adds its world**, four more parts with these exact headings, before the journeys: its genre and fiction, the feeling it aims for, its references and its visual assets. Their directions start from them, not from the real things the app names: a game about hiking explorers is not a hiking map.
  - **Genre and fiction**: the kind of game (persistent strategy, card battler, idle, puzzle…) and its world, with the names the project gives it.
  - **The feeling it aims for**: what the project says it wants the player to feel; when nothing says it, a guess marked `(to confirm)`.
  - **References**: the games or works the project names; others you would compare it with are a guess, `(to confirm)`, for the user to confirm.
  - **Visual assets**: every family of illustrations, icons, logos, photos or textures the project holds (`public/`, `assets/`, the logo's component), each described in plain words as a person would see it: what it shows, how it is drawn or painted, its colours and its light. Look at a few of each before you write. These assets are the strongest thing the directions must live with.
- **A journey is the user's goal**, named in their words, never a screen name ("See my orders", not "Commandes page"). Its steps are numbered and each names a screen (by its route) and one action on it, using the label the user sees.
- **The main journeys first**: the main loop, then what a first-time user does, then what someone does when something goes wrong (a dead link, an empty list).
- **Every part and every journey says where it comes from**: `(seen: /produits)` for a screen AEOM visited, `(seen: pages/produits.html)` for a file it read. What AEOM supposes without having seen it says `(to confirm)`. A sheet without sources is refused. A source ends the sentence it covers, and covers every word since the previous source: put a guess in a sentence of its own, never in the middle of one AEOM saw.

## What AEOM may write

Only what it saw or read. It never invents a feature the app does not have, a user it cannot see in the code or the screens, or a number it did not measure. A journey that the app does not let the user finish is still a key journey when the user would expect to finish it: write the steps up to where it breaks, and say where.

## The user's corrections

The user edits the sheet in place. To confirm a guess, they replace its `(to confirm)` with their own name as the source, `(seen: Antoine)`. The art directions start only from words with a `(seen: …)` source: a guess, or words with no source after them, never reach them (`aeom product --brief` lists what it leaves out). `aeom product` keeps AEOM's last draft in `.aeom/product.base.md`, which is how it tells the user's corrections from its own words. The two files go together: the user commits them both, when and where they choose; AEOM never commits them. On the next run, AEOM drafts a new sheet from scratch and `aeom product` merges it: a part or journey the user changed stays as they wrote it, one they removed stays removed, one they added stays, and only what they left alone takes AEOM's new words, or goes when AEOM no longer proposes it. A correction that leaves out a required part, such as a renamed heading, is refused: the sheet stays as the user left it, and AEOM says what to restore. Read the sheet before drafting: what the user wrote there is the best source AEOM has.
