# ugly-app

A deliberately bad four-page app to test AEOM on: a different header on every page, buttons that do not look clickable, an order list with no empty state that calls a missing API, faint text below AA contrast, a home page that scrolls sideways on a phone, and a broken "Aide" link that returns a 500.

```bash
node examples/ugly-app/server.mjs   # http://localhost:4317, or set PORT
```

`pages/` holds one file per page; `shared/` holds what every page shares (`kit.css`, served at `/shared/kit.css`, and partials such as `header.html`, inserted where a page writes `<!-- include: header -->`). The kit starts empty: every page styles itself, which is the problem AEOM fixes.
