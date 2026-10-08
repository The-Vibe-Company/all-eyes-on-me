# ugly-app

A deliberately bad four-page app to test AEOM on: a different header on every page, buttons that do not look clickable, an order list with no empty state that calls a missing API, faint text below AA contrast, a home page that scrolls sideways on a phone, and a broken "Aide" link that returns a 500.

The orders page is for signed-in customers only: without a session, `/commandes` leads to `/connexion`. The fake account is in `fixtures/compte.json`, a test value only this app accepts. To let AEOM in, give `.aeom/config.json` a `login`:

```json
{ "login": { "path": "/connexion", "account": "examples/ugly-app/fixtures/compte.json", "submit": "Se connecter" } }
```

```bash
node examples/ugly-app/server.mjs   # http://localhost:4317, or set PORT
```

`pages/` holds one file per page; `shared/` holds what every page shares. Today it holds only `kit.css`, empty and served at `/shared/kit.css`: every page styles itself, which is the problem AEOM fixes. The server also supports partials: a page that writes `<!-- include: header -->` gets `shared/header.html` in its place. No page uses one yet, so AEOM's kit worker creates them.
