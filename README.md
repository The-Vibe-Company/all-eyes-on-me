# All Eyes On Me

Coding agents can now build a backend on their own, because tests tell them when they got it right. The frontend has no such oracle, so agents improvise. You get generic screens, a different header on every page, buttons without a pointer cursor, missing empty states, and an art direction nobody actually chose.

All Eyes On Me (`aeom`) gives the frontend that oracle. A fleet of agents rebuilds your app's frontend in parallel. Every screen is checked against measurable rules and a taste judge. The fleet learns from your feedback until it stops needing you.

> **Status: pre-alpha.** Nothing works yet. V1 is being built in the open, see the [roadmap](#roadmap).

## How it works

1. **`aeom init`** detects the stack and the screens, starts the app on fake data and sets up capture.
2. **Audit.** Every screen is captured at every size, checked, and inconsistencies are listed. A finding is kept only once a second pass confirms it.
3. **Six directions** (with `/aeom --directions`). Six art directions, each taken from a source in the product's own world (an object, a document, a place, a trade its customers know), never from a design movement, and checked against a list of the looks AIs propose by default. Each one is built in real code on the home page, in parallel worktrees.
4. **Tournament.** Judges first remove any direction that looks like an AI default, then compare the rest two by two and keep the winner. Its shared files become the kit.
5. **Kit wave.** Without directions, one worker turns the failures shared by several pages into tokens and shared components.
6. **Screen wave.** One worker per page, each confined to its own files, so workers never conflict.
7. **Ratchet.** A page is kept only if fewer checks and principles fail on it than before.
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

**V0, done.** The crudest version that runs end to end, tested on a deliberately ugly demo app in `examples/`. It captures every page with Playwright, runs four measurable checks, judges each page against the base principles inside the Claude Code session, fixes things with parallel workers, and proposes six directions from the product's own world. The tickets are in `.veebee/tickets/`.

**First iteration after V0.** This project's landing page, built with AEOM.

**V1.** Redesign mode on the web. Claude Code. Capture through e2e. Blocking checks. Six directions and the tournament. Kit and screen waves with the ratchet. Feedback journal and distillation. Base principles v0. Spend cap. The npm package.

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
