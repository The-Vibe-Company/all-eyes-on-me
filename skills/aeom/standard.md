# The standard of the front

`.aeom/standard.md` says what defines the front from now on: the art direction kept, its tokens and its kit, each where it lives in the code, and the product's own rules. Every later pull request will be held to it. `aeom standard <draft>` writes it. It refuses a draft that misses one of the four parts, still holds a `<…>` placeholder, holds an image, or names a token, a value or a component the code does not hold. The rest of what follows is for AEOM to follow; no command checks it.

## Its shape

```markdown
# The standard of <the app's name>
What the front holds to from now on: its direction, its tokens and its kit, each where it lives in the code, and its own rules.

## Direction
nuancier: the upholsterer's swatch book. It serves the main loop the product sheet gives: choose a piece, add it, follow the order, as one follows a length of fabric from the window to the workshop.

## Tokens
- `--petrole: #1f4b57` in `shared/kit.css`: the house colour, for actions
- `--goutiere: 32px` in `shared/kit.css`, under `@media (min-width: 768px)`
- `accent: '#c0392b'` in `tailwind.config.js`

## Components
- `.bouton` in `shared/kit.css`: the one button
- `Header` in `src/components/Header.tsx`
- `shared/header.html`: the header every page includes

## Rules
- Only the main action of a screen is petrol.
```

- **Four parts**, with these exact headings, after a `#` title.
- **The direction** names the direction kept (a later run with no new direction drafts the one AEOM last wrote), the thing from its users' world it is drawn from, and what it takes from the product sheet: what the app is for, who uses it, its main loop. With the style kept, it says the app's own style is kept and where it was read. After « rien à refaire », it says what the front is as it stands.
- **One line per token**: `` `name: value` in `file` ``, the value exactly as the file writes it, then `, under` the rule it sits in when it is not the root, then `:` and what it is for when the code says it. A value the code does not hold is never written.
- **One line per component**: `` `.class` in `file` ``, `` `Name` in `file` ``, or `` `file` `` for a file that is a component of its own, such as a partial.
- **Nothing else in those two parts** but `###` headings that group the lines, such as `### Colours`: a table, a numbered list or a sentence there would name values no check reads, so it is refused.
- **The rules** are the product's own, one per line: what the tokens and the kit do not say alone, read in the code or the pages, never invented.
- **Words only**: no capture, no image, no link to one.

## The user's corrections

The user edits the standard in place: a word on what a token is for, a rule of their own, a line taken out. `aeom standard` keeps AEOM's last draft in `.aeom/standard.base.md`, which is how it tells the user's corrections from its own words; the two files go together. On the next run, AEOM drafts the standard again from the code, and `aeom standard` merges it, part by part and line by line: a line the user changed stays as they wrote it, one they took out stays out, one they added stays, and only what they left alone takes AEOM's new words, or goes when the code no longer holds it. A correction the code does not hold, such as a value the user wrote that the code does not have, is refused: the standard stays as the user left it, and AEOM says which line.

A run that keeps something commits the standard and its base on its branch, with the rest, when `aeom standard` wrote them. After « rien à refaire », they stay uncommitted, as the product sheet does: the user commits them.
