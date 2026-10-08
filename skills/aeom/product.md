# The product sheet

`.aeom/product.md` says what AEOM understood of the app on its own, before it changes a screen. The user corrects it whenever they like; AEOM never waits for them. `aeom product <draft>` writes it. It refuses a draft that misses one of the four parts, has fewer than three or more than five journeys, has a journey without numbered steps, or has a part or journey without a source. The rest of what follows is for AEOM to follow; no command checks it.

## Its shape

```markdown
# <The app's name>

## What it is for
Two to four sentences: what the app does, in its users' words. (seen: <screen or file>)

## Who uses it
Who opens it, how often, on what device. (to confirm)

## The main loop
What a user does again and again, in order: the reason they come back. (seen: <screens>)

## Key journeys

### <A journey, named by what the user wants: "See my orders">
Why: what the user is after, in one sentence. (seen: <screen or file>)
1. Open `/`.
2. Click "Produits" in the menu.
3. …
```

- **Four parts**, with these exact headings, then **three to five journeys** under `## Key journeys`, each a `###` heading. Every `###` under `## Key journeys` is a journey: a note goes in a part of its own.
- **A journey is the user's goal**, named in their words, never a screen name ("See my orders", not "Commandes page"). Its steps are numbered and each names a screen (by its route) and one action on it, using the label the user sees.
- **The main journeys first**: the main loop, then what a first-time user does, then what someone does when something goes wrong (a dead link, an empty list).
- **Every part and every journey says where it comes from**: `(seen: /produits)` for a screen AEOM visited, `(seen: pages/produits.html)` for a file it read. What AEOM supposes without having seen it says `(to confirm)`. A sheet without sources is refused.

## What AEOM may write

Only what it saw or read. It never invents a feature the app does not have, a user it cannot see in the code or the screens, or a number it did not measure. A journey that the app does not let the user finish is still a key journey when the user would expect to finish it: write the steps up to where it breaks, and say where.

## The user's corrections

The user edits the sheet in place. `aeom product` keeps AEOM's last draft in `.aeom/product.base.md`, which is how it tells the user's corrections from its own words. The two files go together: the user commits them both, when and where they choose; AEOM never commits them. On the next run, AEOM drafts a new sheet from scratch and `aeom product` merges it: a part or journey the user changed stays as they wrote it, one they removed stays removed, one they added stays, and only what they left alone takes AEOM's new words, or goes when AEOM no longer proposes it. A correction that leaves out a required part, such as a renamed heading, is refused: the sheet stays as the user left it, and AEOM says what to restore. Read the sheet before drafting: what the user wrote there is the best source AEOM has.
