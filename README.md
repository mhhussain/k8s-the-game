# Kubernetes: The Game

A menu-driven Kubernetes management sim that runs entirely in the browser. No terminal, no backend: you work tickets, build images, author services, grow a cluster of nodes, and buy automation until `prod-east-1` runs itself.

**Play it:** open `dist/index.html` in any modern browser, or host the `dist/` folder on any static host (GitHub Pages, Netlify, S3, a USB stick). Everything, including saves, lives in the browser.

```
k8s-the-game/
├── dist/index.html          ← the whole game, one self-contained file (built output, committed)
├── index.html               ← Vite entry
├── src/
│   ├── engine/              ← pure simulation (no React): reducer, tick, grader, placement, content, save
│   │   └── __tests__/       ← Vitest unit, regression and balance tests
│   ├── ui/                  ← screens, title screen, press kit, primitives
│   ├── assets/promo/        ← press-kit screenshots (inlined into the build)
│   └── styles/styles.css    ← design system (3 themes)
├── e2e/                     ← Playwright smoke playthrough against the built bundle
├── IT Guy Menu Simulator/   ← original design handoff + in-browser prototype (reference only)
└── .github/workflows/       ← optional GitHub Pages deploy
```

## Developing

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests + balance simulation
npm run build      # typecheck + single-file build → dist/index.html
npm run e2e        # Playwright smoke test against the build (needs Chromium)
```

All simulation numbers live in `src/engine/config.ts`.

## Promotional material

Built into the game itself:

- **Title screen** on every launch: animated cluster backdrop, logo, tagline and a rotating feature reel. Continue, New game, Load, How to play and Press kit live here. Click the logo in the top-left corner to come back to it.
- **Press kit** (title screen or Help): fact sheet, short and long descriptions with copy buttons, six key features, four screenshots with a lightbox and downloads, the logo mark, wordmark and a 1200×630 social card (SVG or PNG download), and ready-to-post social copy.

The logo is original art (a hexagonal cluster with three pods). It does not reproduce the Kubernetes helm logo. Kubernetes® is a registered trademark of The Linux Foundation; this is an unaffiliated fan project, and the title screen and press kit say so.

## The loop

Read ticket → build image (drag a Repo onto the Registry) → author a service → grow the cluster → **Mark done** (the engine grades the *live* cluster against the ticket's acceptance criteria) → spend budget and XP on the Upgrades tree.

Keyboard: `Space` pause/resume · `1` `2` `3` switch screens · `Esc` close panels.

## Save / load

- **Autosave** to the browser every 12 ticks and on every pause; the game resumes where you left it.
- **3 manual slots** (Save icon in the top bar).
- **Export / Import JSON** to carry a save between browsers or machines. Saves are versioned and migrated forward, so old files keep working after updates.

## What changed from the design handoff (adversarial review)

The prototype's loop worked for about two minutes and then had nothing to push back. An adversarial pass found the economy ran only on breakage, several upgrades were cosmetic, and two actions were infinite-money exploits. Changes, all tunable in `config.ts`:

| Problem | Change |
|---|---|
| Re-open → Mark done paid again forever | Tickets carry a `paid` flag; a ticket pays once. |
| Resolve a ticket, scale to 0, keep the money | Resolved requests are standing SLOs. If their criteria stop being true for 6 ticks, a **Regression** incident lands (pays nothing, pauses the clock). |
| Only breakage produced income | **Served traffic pays**: each req/s a healthy service actually serves earns $3.20/day. The HUD shows traffic income next to upkeep. A healthy, right-sized cluster is now profitable. |
| Building a new image and "fixing" the Stale incident was a money printer | Stale incidents pay $150/10 XP (self-inflicted). CI builds only repos that have a live service, every 14 ticks. |
| No content after tick 96, no win, no lose | **Procedural tickets** (6 templates that only ask for things the cluster doesn't already satisfy, with soft deadlines and reward decay). **Win**: buy *Secrets & Data Tier*. **Lose**: two days below −$2,000. Endless mode after either. |
| Softlock when broke with nothing to fix | **Emergency funding** once per day when the budget is negative (+$1,000, −20 XP). |
| Pod vs Deployment, HA, probes did nothing in the sim | **Node outages** take a node offline for a few hours. Deployments re-home their pods; bare Pods on it go down. A crashed Deployment pod is recreated in 3 ticks; a crashed bare Pod stays dead until you restart it. Liveness probes speed crash recovery and lower crash risk; Readiness probes stop half-started pods from serving errors. |
| Load was invisible but drove everything | Post-dashboard cards, grid and table show **Load** and **Demand**. Demand follows a time-of-day curve; **flash sales** (announced a day ahead) spike one service ×2.2. |
| Autoscaler ignored slots and budget, never scaled down | It respects free slots, positive budget and the replica cap, and trims replicas after sustained low load. |
| No way to remove a service or a node | Remove service (with regression warning) and Decommission node (50% refund, must be empty). |
| XP only came from incidents | +4 XP per healthy service each day, +10 XP for on-time requests; tree XP costs trimmed. |
| Large Nodes were a 5% edge for $900 | Large: $650 to provision, $190/day. Auto-Remediation $1,200. |
| Tweaks panel was prototype-only | Replaced by a Settings modal: theme, board layout, drift drama, pause-on-ticket, autosave. Plus an Activity Log and a Help panel. |

Everything else (visual design, copy, the four scripted tickets, affinity schedule-but-fail, config-checkable HA) is as specified in the handoff.
