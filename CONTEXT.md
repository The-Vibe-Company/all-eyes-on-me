# Context

The words AEOM uses, in code, tickets and sessions. The French term in parentheses is the one used in tickets.

## The app being worked on

- **Project** (projet): the app AEOM runs on. Its repository holds `.aeom/`.
- **Screen** (écran): one page or view of the project, reachable at a route.
- **State** (état): a screen in a given condition. Every screen has a **default** state and, where they apply, **empty**, **error** and **loading** states.
- **Fake data** (données fictives): the data AEOM runs the project on. AEOM never reads or writes production data.
- **Capture** (capture): a screenshot of one screen, in one state, at one width.
- **Product sheet** (fiche produit): `.aeom/product.md`, what AEOM understood of the project on its own: what it is for, who uses it, its main loop and three to five key journeys. The user corrects it; AEOM keeps their corrections.
- **Feature guard** (garde-fou): `aeom guard`, which refuses a change that adds a feature instead of fixing a journey: a server call the app never made, new fields sent to one, or a change to a file listed as `protected`. Only the user's explicit request lets one through.
- **Journey** (parcours): what a user does to reach one goal, as numbered steps across screens, such as "see my orders". Named by the goal, never by a screen.

## Judging

- **Check** (contrôle): a rule with a pass or fail answer. **Measurable checks** are computed from the page (cursor, overflow, contrast). **Judged checks** are decided by the judge on screenshots (hierarchy, alignment, density). Every check is **blocking**: a screen that fails one is not merged.
- **Judge** (juge): the model that decides judged checks and compares versions. It votes three times; the majority wins.
- **Pairwise comparison** (comparaison par paires): the judge picks the better of two versions. AEOM never asks it for a score.
- **Tournament** (tournoi): a knockout between directions, two by two, three votes per duel, until one wins. Its shared files become the kit.
- **Ratchet** (cliquet): a new version of a screen is merged only if the judge prefers it to the current one, so quality never goes down.
- **Finding** (constat): something wrong that the audit reports. A finding is shown only once a second pass confirms it.
- **Audit** (état des lieux): capturing and checking every screen to list findings before or between waves.

## Building

- **Mode**: **redesign** (refonte) on a project that already has a frontend, **launch** (lancement) on one that does not yet. V1 has redesign only.
- **Direction**: one art direction, built in real code on the home page. With `/aeom --directions`, AEOM builds six per run and keeps one.
- **Source** (source): where a direction starts: something from the product's own world that its customers know (an object, a document, a place, a trade). Never a design movement.
- **Banned looks** (liste noire): the looks an AI proposes by default when asked to be bold, listed in `skills/aeom/directions.md`. A direction one of them describes is removed before the tournament.
- **Kit** (couche design): the tokens and shared components (header, buttons, layout) every screen uses.
- **Token**: a named design value (color, size, radius, shadow, spacing). Any value outside the tokens fails a check.
- **Wave** (vague): one round of parallel work. The **kit wave** has a single worker. The **screen wave** has one worker per screen, each confined to its screen's folder.
- **Kit candidate** (candidat kit): a variant a screen worker needs and creates locally; the next kit wave promotes it.
- **Coordinator** (coordinateur): the session that runs the skill, plans waves and launches workers.
- **Worker**: a subagent in its own worktree, doing one direction, the kit, or one screen.
- **Spend cap** (plafond): the most one run may spend. AEOM stops cleanly when it reaches it.

## Taste

- **Feedback** (retour): what the person running AEOM says about a screen during a session.
- **Rule** (règle): feedback promoted to the whole project, stored in `.aeom/`. A rule a machine can verify becomes a check.
- **Before / after pair** (paire avant / après): the two captures around a piece of feedback. Stored in `~/.aeom/taste/`, never in the repository, never published.
- **Principle** (principe): a short statement of taste, such as "more air around titles", with the feedback that backs it and its **strength** (how often it came up).
- **Base principles** (principes de base): the principles every install starts from. Plain text, no images, shipped in this repository.
- **Personal layer** (couche perso): the principles distilled from one person's feedback, in `~/.aeom/taste/`, on top of the base principles. It always wins over them.
- **Distillation**: turning feedback into principles.
- **Calibration** (rodage): the period when AEOM still asks for feedback. It ends category by category, once AEOM predicts the feedback well enough.
- **Pilot** (pilote): a real project used to calibrate AEOM. Carnet first, Road-To-Mastock second.
