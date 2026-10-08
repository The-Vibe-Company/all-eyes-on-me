# Journey files

A key journey of the product sheet, written so a browser can replay it: `.aeom/journeys/<slug>.json`, one file per journey, named after the user's goal (`see-my-orders.json`). `aeom journey` replays them all and refuses, before any browser starts, a file it cannot read.

```json
{
  "name": "See my orders",
  "steps": [
    { "do": "open", "path": "/" },
    { "do": "click", "target": { "role": "link", "name": "Commandes" }, "lands": "/commandes" },
    { "do": "see", "text": "Mes commandes" }
  ]
}
```

- **`name`** is the journey's name in the product sheet, word for word.
- **The first step opens a route.** Then, one action per step:
  - `click` and `fill` (with a `value`) act on a target;
  - `press` presses a key, such as `Enter`;
  - `see` checks that a text is on the screen.
- **A target** is what the user sees:
  - an element by its accessible role and name, `{ "role": "button", "name": "Ajouter" }`;
  - or by its text when it has no role, `{ "text": "Découvrir 🎉" }`, which is often a finding of its own.
  - When several elements match, add the container that holds the right one: `"within": { "role": "row", "name": "Lampe" }`. Its name needs only to appear in the container's.
- **A field without a role**, such as a password, is targeted by its label's text: `{ "text": "Mot de passe" }`.
- **A value from the sign-in account**: `"value": { "account": "Mot de passe" }` takes the field from the fake account of the config's `login`, so the journey file holds no secret.
- **`"signedOut": true`** marks a journey that starts without a session, such as signing in itself. Every other journey starts signed in when the config has a `login`.
- **`lands`** on a `click` or `press` gives the route the step must end on. Use it whenever the user expects to land somewhere: a click that leaves them in place is then caught.

A journey stops at the first step it cannot take, and the report says which and why:
- an element that is not there, or more than one;
- a page that answers 400 or more;
- a link that leaves the app;
- a landing elsewhere than `lands`;
- a text that is not on the screen.

What the page says in a dialog, such as an alert, is recorded, and the journey goes on. Write steps only as far as the app lets the user go: a journey that breaks where the product sheet says it breaks is a finding, not a mistake.
