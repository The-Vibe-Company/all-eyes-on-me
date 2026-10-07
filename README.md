# All Eyes On Me

Coding agents can now build a backend on their own, because tests tell them when they got it right. The frontend has no such oracle, so agents improvise. You get generic screens, a different header on every page, buttons without a pointer cursor, missing empty states, and an art direction nobody actually chose.

All Eyes On Me (`aeom`) gives the frontend that oracle. A fleet of agents rebuilds your app's frontend in parallel. Every screen is checked against measurable rules and a taste judge. The fleet learns from your feedback until it stops needing you.

> **Status: pre-alpha.** Nothing works yet. V1 is being built in the open, see the [roadmap](#roadmap).

## How it works

1. **`aeom init`** detects the stack and the screens, starts the app on fake data and sets up capture.
2. **Audit.** Every screen is captured at every size, checked, and inconsistencies are listed. A finding is kept only once a second pass confirms it.
3. **Six directions.** Six contrasting art directions, drawn from archetypes that sit far apart on a few axes (dense or airy, sober or expressive, warm or cold, light or dark, serif or sans) and never the ones proposed on recent projects. Each one is built in real code on two or three real screens, in parallel worktrees.
4. **Tournament.** The judge compares the directions two by two and keeps the winner.
5. **Kit wave.** One worker turns the winner into tokens and shared components.
6. **Screen wave.** One worker per screen, each confined to its own folder, so workers never conflict.
7. **Ratchet.** A screen is merged only if it passes every check and the judge prefers it to the current version.
8. **Loop.** Steps 2 to 7 repeat until no new version beats the best one, or the spend cap is reached.

## The judge

**Measurable checks, blocking.** Pointer cursor on everything clickable. No horizontal scroll at 375, 768 and 1280 px. AA contrast. Visible hover and focus. No console errors. No overflowing text or stretched images. No hard-coded values outside the tokens. Kit components only. The same header and navigation on every screen.

**Checks judged on screenshots, blocking.** Visual hierarchy, alignment, density, empty, error and loading states present, nothing generic. The judge votes three times and the majority wins.

**Taste.** Pairwise comparisons only. A model compares two screens far more reliably than it scores one.

## Taste

Every install starts from the same **base principles**, written as plain text, with no images.

When you give feedback in a session, AEOM fixes the screen, offers to turn it into a rule for the whole project, and records the before and after. Over time it distills your feedback into principles, each with the feedback that backs it. Those principles live in your **personal layer** in `~/.aeom/taste/`, on top of the base principles. Screenshots never leave your machine.

AEOM measures how well it predicts your feedback, category by category, and stops asking about a category once it gets it right.

## Working alongside other agents

AEOM does not need to own the repository. It writes a section in `AGENTS.md` that points other agents to the kit and the tokens, and catches drift after other agents merge. Its checks can also run in CI, so any fleet that waits for green checks before merging follows the same rules.

## Architecture

| Path | Role |
| --- | --- |
| `packages/cli` | The `aeom` command: the deterministic plumbing agents call (capture, checks, worktrees and ports, feedback journal, taste profile). |
| `packages/core` | Capture (built on [e2e](https://github.com/tester-army/e2e)), checks, judge and memory. |
| `skills/` | The coordinator skill. It runs in Claude Code (Codex later) and launches workers as subagents. |

State lives in files:

- `.aeom/` in the project's repository: art direction, rules, history of directions, feedback journal.
- `~/.aeom/taste/` on your machine: your personal layer.

The vocabulary is defined in [CONTEXT.md](./CONTEXT.md).

## Roadmap

**V1, in progress.** Redesign mode on the web. Claude Code. Capture through e2e. Blocking checks. Six directions and the tournament. Kit and screen waves with the ratchet. Feedback journal and distillation. Base principles v0. Spend cap. The npm package.

**V2.** Launch mode for new projects. Codex. Mobile (iOS and Android, through e2e). Per-category autonomy. The CI check for other fleets. A landing page, designed by AEOM.

## Development

Requires Node 22 or later and pnpm.

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js --help
```

## License

[MIT](./LICENSE), by [The Vibe Company](https://thevibecompany.co).
