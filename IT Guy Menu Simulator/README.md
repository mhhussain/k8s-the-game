# Handoff: Cluster — IT Architect Simulator

## Overview
**Cluster** is a menu-driven management sim. The player runs a production cluster (`prod-east-1`) with **no terminal** — only menus, forms and drag-and-drop. Work arrives as **tickets**; the player builds container images, authors services, provisions/tags nodes, then hits **Mark done** and the engine grades the *live* cluster against each ticket's acceptance criteria. Budget and XP earned are spent on an **Upgrades** tech tree that progressively automates the grind (CI, Deployments, Dashboard, Affinity, Auto-Rebalance, Autoscaler…).

Core loop: **Read ticket → Build image (Repo → Registry) → Author service → Grow cluster → Get validated → Automate.**

## About the Design Files
Files in this bundle are **design references created in HTML/React (in-browser Babel)** — a working prototype showing intended look, behavior and simulation rules. They are **not production code to ship**. Recreate them in the target codebase's environment (React, Vue, Svelte, native, game engine, etc.) using its patterns. If no environment exists, a Vite + React + TypeScript app with a reducer/Zustand store is a natural fit — the prototype already maps 1:1 onto that structure.

`v1/` (in the source project, not bundled) is an earlier dark "control-room" iteration that was **rejected** in favour of the light & playful direction documented here.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, interactions and simulation tuning. Recreate pixel-accurately. Simulation numbers (costs, tick rates, probabilities) are tuned first-pass values — keep them as defaults but expose as config.

---

## Design decisions (settled in discussion)
1. **Light & playful, not dark ops.** Dark control-room look was dropped. Three light directions were explored (`Style Directions.html`); all three ship as a theme switch. **Daylight is the default.**
2. **Hard status rule:** green = healthy, amber = degrading, red = failing, indigo/violet = pending, grey = idle. Rendered as tinted pill fill + saturated text + glowing LED — never solid color walls.
3. **Blank-slate start.** One small untagged generic node, nothing built, nothing running. Time starts **paused**. First ticket lands ~3 ticks after play.
4. **Limited visibility until the Service Dashboard is bought.** Pre-dashboard the player sees only what's running (grey LEDs); problems surface as incident tickets. Post-dashboard: live health, SLA meter, Cards/Grid/Table board.
5. **Replicas are the only sizing knob.** No CPU/memory. Each replica = 1 pod slot, 55 req/s capacity, $60/day.
6. **Service name is derived 1:1 from the image's repo** (not editable).
7. **Placement auto-spreads by default** (one pod per node first, maximising distinct nodes for HA), with a **Manual** override (+/− per node).
8. **High availability is config-checkable**, not luck-based: Deployment workload + ≥2 replicas + spread across ≥2 nodes. Shown as a composite criterion with 3 sub-checks.
9. **Two node kinds.** *Generic* (Normal 4 slots / Large 8 slots) with **editable tags** (up to 3 of x86/ARM/GPU/DATA). *Special* (16 slots, locked to one hardware type, dense).
10. **Affinity = schedule-but-fail.** A replica placed on a node lacking the required tag still schedules but never goes live (red slot, Degraded/CrashLoopBackOff, generates an incident). Deploy is *not* blocked — it's a visible, teachable bug.
11. **Tickets "read between the lines."** Each has an amber hint box translating vague stakeholder language ("cannot blink", "where the auditors expect it", "sale days get rough") into concrete config.
12. **Ticket board is two columns** (Open / Resolved), not a 3-column kanban.

---

## App shell
- CSS grid: `grid-template-columns: 76px 1fr; grid-template-rows: 62px 1fr;` areas `"brand hud" "nav main"`. `height:100vh; min-width:1180px`. Body `overflow:hidden`; each screen's body scrolls.
- **Brand cell** (76×62): 36×36 mark, radius 11, `linear-gradient(155deg, accent, accent-dim)`, white hexagon outline + center dot, shadow `0 6px 16px -6px accent-glow`.
- **Side nav** (76 wide, bg-1, right border): 56×56 buttons, radius 14, icon 21px + 9px/600 label. Items: **Tickets** (badge = open count), **Cluster** (badge = failing services, post-dashboard only, red), **Upgrades** (badge = affordable count, accent-colored). Active: bg-2, border, shadow, accent text, 3px accent bar at left edge (`left:-14px; top/bottom:15px`). Badge: 17px min, radius 9, bad bg, white mono 9.5/700.
- **Keyboard:** Space toggles pause/resume (ignored in inputs/selects).

## HUD (top bar, 62px, bg-1, bottom border, padding 0 22px, gap 16)
- Title stack: "Cluster" 16/800 + "prod-east-1" mono 10.5 faint.
- **Meters** (flex row gap 12). Meter = bg-2, border, radius `--r`, padding `8px 14px 10px`, shadow; label 10.5 uppercase .05em 600 dim; value mono 16/600; 5px bar on bg-inset.
  - **Budget (hero)**: flex 1.4, max 330, gradient bg-2→bg-3, value 21px. Right of label: `−$X/day upkeep`. Color: >$2000 ok, >0 warn, ≤0 bad. Bar = budget/6000. When negative: flash animation + "PROVISIONING LOCKED — CLEAR A TICKET" (mono 9.5 bad).
  - **Open tickets**: value = non-done count, sub `· N incidents` or `to work`. ≤2 ok, ≤4 warn, else bad. Bar = 100 − count×14.
  - **Uptime / SLA** (only after Dashboard): `99.xx %`. ≥99 ok, ≥96 warn, else bad. Bar = (sla−80)/20. Flashes red ring when a service first goes bad.
- **XP chip**: bolt icon (accent) + `N XP`.
- **Clock**: `HH:MM` mono 15 + `DAY 01` mono 10 faint; pause button + segmented 1×/2×/4× (31px cbtns, active = accent fill white text).
- **Paused banner**: fixed bottom-center pill, accent bg, white mono 11/700 uppercase: "⏸ Paused — configure freely · press space to run".

## Screens

### 1. Intro modal (first visit only; `localStorage cluster_seen_intro_v2`)
700px panel, centered over blurred overlay. Title "Welcome, Architect." 19/800; sub: "You run the **prod-east-1** cluster. No terminal — just menus, forms, and drag-and-drop. You're starting from a blank slate." Two-column grid (gap 16) of 6 numbered steps, each with 36×36 accent-soft icon tile:
1. Read a ticket 2. Build an image 3. Author a service 4. Grow the cluster 5. Get it validated 6. Automate it (copy in `src/app.jsx`).
Footer: "Time is paused. Press [space] to play/pause — your first ticket lands a few seconds in." + primary **Start the shift**.

### 2. First-ticket beat
Centered 420px card, radius xl, pop-in (`beatpop .4s cubic-bezier(.2,.9,.3,1.3)`), 60×60 accent-soft icon tile. "Your first ticket just landed" + ticket title + explainer. Buttons: **Open the ticket** (primary) / **Later** (ghost).

### 3. Ticket Board
- Header: "Ticket Board" 23/800 −.02em; sub "Work the cluster, then resolve a ticket — the system grades it against its acceptance criteria." Right: red incidents pill (if any) + `N open` pill.
- Body: `.kanban.two` — 2 columns `1.05fr 1fr`, max-width 1080 centered, gap 16. Column = bg-1, border-soft, radius lg; head 12/800 uppercase .06em with LED (Open = pending, Resolved = ok).
- **Ticket card**: bg-2, border, radius `--r`, padding 14/15, shadow; hover lifts 2px + shadow-md. 3px priority bar on left (high = bad, med = warn, low = accent). Bug tickets get 3px bad left border. Top row: type badge (mono 9.5 uppercase, 1px currentColor border, 9% tint — "New service" accent / "Incident" bad) + ID; green "✓ ready" pill when all criteria met. Title 14/700. Footer: avatar (23px circle, initial) + requester; `met/total` count chip.
- Empty states: "All clear. Enjoy it while it lasts." / "Nothing resolved yet."
- **Ticket detail slide-over** (580px, right): badges + priority pill, title 18/800, requester. Body: "The request" paragraph → amber **Reading between the lines** box (warn-bg, warn-line, alert icon) → **Acceptance criteria** live checklist (`N/M met`). Criterion row: 23px box (met = ok fill white check, else inset + ✕), label 12.5; met row = ok-bg + ok-line. HA renders as a group with indented sub-checks (17px boxes) and a red mono hint like "needs another node". Reward (+$ ok) and XP (+N accent). Footer: status text; **Go build** / **Open cluster** (ghost); **Mark done** (primary when all met, else 75% opacity). Clicking Mark done while unmet → field shakes (.42s), unmet rows flash red, toast "Not yet". Resolved tickets show **Re-open**.

### 4. Infrastructure (nav label "Cluster")
Header "Infrastructure" + contextual sub (pre-dashboard: limited-visibility message; post: "N services need attention right now." in bad, or "All systems nominal. The board is green."). Tabs (mono 12, top-rounded 10): **Cluster · Repos · Registry · CI** with count chips; red pulsing LED on Cluster tab when services fail. "New service" primary sm button when services exist.

**Cluster tab**
- Section label (12/800 uppercase, icon) "Nodes" (+ "auto-rebalance on" accent pill when owned).
- **Nodes strip**: grid `repeat(auto-fill, minmax(264px,1fr))` gap 14. **Node card**: bg-2, radius lg, padding 16. Head: 26px icon tile + mono name; tier chip `Normal · 4` / `GPU · 16`. "POD SLOTS" + `used / slots` (warn when full, bad when over). Slot squares 19×19 radius 6: empty inset, used = accent, failed (wrong tag) = bad, overflow = bad + ring. Tags row: generic → accent-outline chips with ✕, dashed `+` button opens inline tag menu (x86/ARM/GPU/DATA/cancel), max 3, "untagged · anything schedules" when empty; special → solid accent locked chip with lock icon. Foot: pod chips `name ×N` with ok/bad LED, or "no pods"; `generic`/`special` label. Special card: `linear-gradient(165deg, accent-soft, bg-2 60%)`, accent-line border, accent icon tile. Rebalance → 1.1s accent ring pulse.
- **Provision a node** (ghost button → inline panel). Options grid of cards: Generic·Normal 4 slots $400; Generic·Large 8 slots $750 (locked until Large Nodes); special x86/ARM/GPU/DATA 16 slots $1,150 each (locked until Specialized Hardware). Cost green if affordable else red; locked = 55% opacity + lock message. Names auto-assign `node-alpha, bravo, charlie…`.
- **Empty cluster**: dashed xl box, 74px accent-soft icon, "Your cluster is empty — and quiet", contextual CTA (**Go to Repos** or **Author a service**) + **View tickets**.
- **Workloads, pre-dashboard (MinimalBoard)**: service cards with grey bar + idle LEDs, type and pod count, node chips; footer strip: lock icon + "Health, restarts and error rates are hidden… buy the **Service Dashboard**" + Upgrades button.
- **Workloads, post-dashboard**: segmented **Cards / Grid / Table** (default from Tweaks: Cards).
  - Cards: grid `minmax(310px,1fr)` gap 15; 4px status-color top bar; LED + name 14.5/700; `type · image:tag`; status pill; wrong-hardware warning; 2×2 metric tiles (Ready colored full/part/none, Restarts red >3, Error rate bar, Spread N nodes); pod placement chips. Hover reveals restart/edit icon buttons.
  - Grid: heat cells `minmax(160px,1fr)`, status-tinted gradient, big mono ready ratio 22px, status pill, restarts + spread.
  - Table: sticky mono header; columns Service/Type/Ready/Status/Restarts/Error rate/Placement/actions; bad/warn rows get left-fading tint.
  - Clicking any service opens the service form in edit mode.

**Repos / Registry / CI tab** — one 3-column pipeline (`1fr 1fr 1fr`, gap 18); active tab outlines its column.
- **Repos**: draggable cards (cursor grab, grip icon), lang dot (Go #1AA6C0, Node #5BA641, Python #4C6EF5, Rust #D2742B, Java #C85B5B), mono name, description, lang pill + state (`building…` / `✓ vN` / `not built`). Seed repos: web-storefront, checkout-api, image-resizer, recommend-engine, audit-log.
- **Registry**: dashed dropzone; hover = accent border + accent-soft fill + "Release to build". Shows latest image per repo (`name:N.0.0`, `sha256:xxxx…xx · latest`, **Deploy** button prefilling the form) and in-progress builds (dashed card, progress bar, `building 36%` / `cached`). Build = +12%/tick (+34% with Image Caching).
- **CI**: empty state "No pipelines yet" + **Open Upgrades** until Continuous Integration is owned; then per-repo `checkout → build → push` step chips (ok) with "auto" pill.

### 5. Service form (slide-over, 580px)
Header pill "New service"/"Edit service" (+ "rolling update" pill if owned), title = name or "Author a workload". Fields top→bottom:
1. **Image** select (latest images) — or amber "No images built yet…".
2. **Service name** — dashed derived field, "DERIVED FROM IMAGE".
3. **Workload type** segmented Pod / Deployment (Deployment locked until upgrade; lock note "unlock in Upgrades"). Hint text explains each.
4. **Replicas** slider 0–8, value `N×`. Thumb amber at 1 ("single point of failure"), red at 0 ("stopped" — defined but NOT running).
5. **Required hardware** segmented Any/x86/ARM/GPU/DATA (locked until Node Affinity).
6. **Placement**: Auto-spread / Manual toggle. Auto: accent-soft note "Replicas auto-spread across N nodes…" + read-only per-node pod LEDs + **Re-distribute**. Manual: per-node row (name, free slots, tags, −/count/+ steppers 26px) + "N replicas unplaced" (warn) / "all replicas placed" (ok) + **Auto-distribute**. Warnings: out of slots (blocks deploy); "N replicas on a node without GPU — they'll schedule but stay unhealthy" (does not block). Mismatched nodes render bad-bg.
7. **Health probes** Liveness / Readiness toggles (locked until Service Dashboard).
Footer: `upkeep $X/day · N pods · ~Y req/s`; Cancel; primary **Deploy service** / **Apply changes** (disabled if no image, over capacity, or manual placement incomplete). Saving a new service navigates to Infra › Cluster.

### 6. Upgrades (tech tree)
Header + budget (ok) / XP (accent) pills. 5 columns (gap 18), each headed by a colored LED: Build #0E9BB8, Workload #4C6EF5, Observability #16A34A, Infra #E08A00, Scaling #9B5DE5. Cards linked by 14px vertical connectors (lit green when previous owned). Card: 38px icon tile, name 13.5/700, desc 11.5, cost row ($ green/red, XP accent/red, "locked"). States: **owned** (ok gradient, ok icon tile, "Active" pill), **affordable** (accent-line border, hover lift, arrow, click to buy), **locked** (55% opacity), **deferred** ("Later milestone").

| ID | Branch | Name | $ | XP | Requires | Effect |
|---|---|---|---|---|---|---|
| u-ci1 | Build | Continuous Integration | 700 | 0 | — | auto-build random repo every 7 ticks |
| u-ci2 | Build | Image Caching | 1000 | 60 | ci1 | builds ~3× faster |
| u-wl1 | Workload | Deployments | 600 | 0 | — | unlock Deployment type (needed for HA) |
| u-wl2 | Workload | Rolling Updates | 1100 | 80 | wl1 | zero-downtime edits; auto-refresh Stale |
| u-ob1 | Observability | Service Dashboard | 800 | 0 | — | live health, SLA meter, rich board, probes |
| u-ob2 | Observability | Auto-Remediation | 1500 | 140 | ob1 | 50%/tick chance to self-heal crashes |
| u-if1 | Infra | Large Nodes | 900 | 40 | — | 8-slot generic nodes |
| u-if2 | Infra | Specialized Hardware | 1500 | 110 | if1 | 16-slot special nodes |
| u-if3 | Infra | Node Affinity | 1400 | 120 | if1 | required-hardware field |
| u-if4 | Infra | Automatic Rebalance | 2100 | 200 | if2 | re-home pods every 6 ticks |
| u-sc1 | Scaling | Horizontal Autoscaler | 2000 | 200 | wl1, ob1 | +1 replica when load > 0.85 (max 10) |
| u-sc2 | Scaling | Secrets & Data Tier | 3200 | 320 | sc1 | **deferred** (later milestone) |

### 7. Toasts
Fixed bottom-right, max 360px, max 5 kept. bg-2, 4px left border by kind (bad/warn/ok/info=accent), slide-in .3s. Title 12.5/700 + message 11.5 dim. Click to dismiss.

---

## Simulation rules (`src/store.jsx` is the source of truth)
- **Tick** = 1100ms / speed (1×/2×/4×). Each tick advances clock 30 game-minutes; 48 ticks = 1 day. Starts 09:00, Day 01, paused.
- **Economy**: start $4,200, 0 XP, SLA 100. Upkeep per day: $60/pod + node (Normal $120, Large $220, Special $320), deducted per tick (/48). Provision one-time: $400 / $750 / $1,150. Adding pods blocked when budget < 0.
- **Ticket queue** (staggered): TCK-101 @tick 3 (get web-storefront running, $700/30XP), TCK-102 @26 (recommend-engine HA, $1100/60), TCK-103 @60 (audit-log HA + every replica on DATA, $950/50), TCK-104 @96 (image-resizer ≥3 replicas, $800/50). Full copy in `seedState()`.
- **Criteria kinds**: `running`, `replicas ≥ n`, `deployment`, `ha` (3 sub-checks), `node_tag`, `latest`, `stable` (Running, error < 6%, all ready, no misplaced).
- **Service lifecycle**: Pending (settles over 3 ticks) → Running / Degraded (some misplaced) / CrashLoopBackOff (all misplaced). Load = demand / (replicas×55). Overload drains health; random crash risk = (1−health/100)×(0.25+drama×0.35)×0.5. Running services drift to **Stale** (18%/tick after age 6) when a newer image exists, unless Rolling Updates.
- **Incidents (BUG-xxx)**: auto-generated for troubled services (bad, Stale, or error > 18%), probability 0.16+drama×0.16, max 6 open, one per service. Variants: wrong-hardware, stale ("on latest version"), overload ("≥ replicas+1"), crash loop. Reward $500 ($650 overload), 35 XP.
- **SLA**: −0.15–0.5/tick if any bad, −0.02–0.12 if any warn, else +0.08; clamped 80–100.
- **Auto-spread algorithm**: compute free slots per node; sort affinity-matching nodes first then most-free; round-robin one pod per node per pass; if cluster full, pile remaining onto first node.

## State management
Single reducer store. Key state: `clock{tick,paused,speed,mins}`, `meters{sla,budget,xp}`, `nodes[]{id,name,kind,tier,slots,tags,hw}`, `repos[]`, `images[]{repoId,version,tag,digest,building,progress,fast}`, `services[]{name,imageId,type,replicas,affinity,spread,podNodes[],status,ready[ready,total],restarts,errorRate,health,demand,settleIn,incidentCooldown}`, `tickets[]`, `pending[]`, `upgrades[]`, `toasts[]`, `form{open,editingId,draft}`, `ui{screen,infraTab,boardView,addNode}`, `firstBeat`.
Actions: NAV, INFRA_TAB, BOARD_VIEW, PAUSE, SPEED, TOGGLE_ADDNODE, PROVISION_NODE, NODE_ADD_TAG, NODE_REMOVE_TAG, TICKET_RESOLVE, TICKET_REOPEN, BUILD_IMAGE, BUILD_TICK, FORM_NEW, FORM_EDIT, FORM_SET, FORM_PLACE, FORM_RESPREAD, FORM_CLOSE, SERVICE_SAVE, SERVICE_DELETE, SERVICE_RESTART, BUY_UPGRADE, DISMISS_TOAST, TICK, CLEAR_BEAT. Grading is derived (pure functions), never stored. No network/data fetching.

## Tweaks (designer controls → expose as settings/debug)
- **Theme**: daylight (default) / bubblegum / voltage — sets `html[data-theme]`.
- **Default board layout**: cards / grid / table.
- **Drift drama** 0–1 (default 0.6): scales crash risk, incident frequency and LED pulse speed/depth.

---

## Design tokens

### Daylight (default)
bg #F7F6F3 · bg-1 #FBFAF8 · bg-2 #FFFFFF · bg-3 #F2F0EA · bg-inset #F0EEE8 · bg-hover #F3F1EB
border #E7E3DB · border-soft #EEEBE3 · border-strong #D9D3C8
text #211E1A · text-dim #6B6459 · text-faint #A39B8D
accent #4C6EF5 · accent-soft #E9EDFE · accent-line #C3CFFB · accent-dim #3656D6 · accent-glow rgba(76,110,245,.22)
ok #16A34A / bg #E4F6EA / line #BCE6C9 · warn #C9780A / #FBF1DC / #F0D9A8 · bad #DC3F32 / #FBE7E4 / #F4C4BD · pending #6366F1 / #EAEBFE / #C9CBFB · info #0E9BB8 · idle LED #C7C0B4
Fonts: Plus Jakarta Sans (UI) + IBM Plex Mono (data). Radii sm 8 / r 11 / lg 15 / xl 20.
Shadows: `0 6px 20px -12px rgba(40,34,24,.40)` · md `0 12px 30px -16px rgba(40,34,24,.40)` · lg `0 30px 70px -28px rgba(40,34,24,.45)`.

### Bubblegum
bg #FBF7FC · bg-1 #FDFBFE · bg-2 #FFFFFF · bg-3 #F6EFF8 · inset #F4ECF7 · hover #F7F0F9 · border #ECE0F0 / soft #F2E9F4 / strong #DFCEE6 · text #2A2233 / #6E6379 / #A99CB3 · accent #9B5DE5 / soft #F2E7FB / line #DFC6F2 / dim #7E3FCE · ok #0EA47A/#DEF7EF/#A9E9D3 · warn #C0790B/#FCF0D8/#F5DAA0 · bad #E03168/#FCE3EB/#F8BDD0 · pending #8B6FE8/#EEE8FD/#D6C8F6 · info #1499B0. Fonts Nunito + Space Mono. Radii 10/14/19/24. Shadow tint rgba(123,69,160,…).

### Voltage
bg #F4F6FB · bg-1/bg-2 #FFFFFF · bg-3 #EDF1F8 · inset #EAEEF7 · hover #EEF2FA · border #E0E5F0 / soft #EAEEF6 / strong #CCD4E4 · text #141A2E / #5A647C / #9AA5BC · accent #6D3BF5 / soft #EBE5FE / line #C9BAFB / dim #5325D6 · ok #0AA047/#DDF6E6/#A6E7BD · warn #CE7400/#FDEDD6/#F6D3A0 · bad #F0382D/#FFE5E2/#FFBFB9 · pending #6D5BF5/#E8E5FE/#C7BEFB · info #0098B5. Fonts Space Grotesk + Space Mono. Radii 8/12/16/20. Shadow tint rgba(20,26,46,…).

### Typography scale (all themes)
Screen title 23/800 −.02em · modal title 18–19/800 · card title 14–14.5/700 · body 13–14 · secondary 11.5–12.5 · section/column labels 11–12/800 uppercase .04–.06em · mono data 10–16 (meter hero 21) · micro mono 9–10.5.

### Spacing
Screen padding 20–24 × 28; card padding 14–16; grid gaps 10/12/14/15/16/18; slide-over padding 20–22 × 24; base unit ≈ 4px.

### Components (key specs)
- **Button**: 12.5/700, padding 9×16, radius 11, bg-2 + border-strong + shadow; hover lift 1px. Primary = accent fill, white, glow shadow; hover accent-dim. Ghost = transparent, border, no shadow. sm = 6×12, 11.5, radius 9. Disabled 45%.
- **Pill**: mono 11/600, padding 3×10, radius 999; variants ok/warn/bad/pending/accent use `-bg` fill, `-line` border, solid text.
- **LED**: 9px dot, 2px tint halo + 7px glow. Bad and `pulse` LEDs animate `ledpulse` at `1.1s − drama×0.5s`.
- **Segmented**: inset track, 3px pad, radius 11; selected = bg-2 + shadow, or accent fill.
- **Toggle**: 42×24 track, 18px white knob; checked = accent.
- **Slider**: 7px inset track, 19px accent thumb with 3px white ring; warn/bad thumbs per zone.
- **Inputs/selects**: 13px, padding 10×12, radius 10; focus = accent border + 3px accent-soft ring.
- **Overlay**: `color-mix(text 28%, transparent)` + 3px blur. Slide-over enters `translateX(40px)` .26s `cubic-bezier(.2,.8,.2,1)`.

### Motion
Hover transitions .14–.15s; card lift 2–3px; meter flash .9s; rebalance pulse 1.1s; shake .42s; crit flash .5s; beat pop .4s overshoot; toast in .3s. Respect `prefers-reduced-motion` (slide-over and toasts already gated).

## Assets
- Icons: custom inline 24×24 stroke icons (1.6 stroke, currentColor) in `src/ui.jsx` `ICON_PATHS` — tickets, cluster, node, server, cpu, box, layers, ci, bolt, check, close, plus, minus, lock, pin, balance, scale, eye, heart, deploy, rolling, restart, edit, alert, arrow, grip, shuffle, spark, budget, backlog, sla, tree, pause, etc. Swap for the codebase's icon set (Lucide is a close match).
- Brand mark: inline hexagon SVG in `src/hud.jsx`.
- Fonts: Google Fonts (Plus Jakarta Sans, Nunito, Space Grotesk, IBM Plex Mono, Space Mono).
- No raster images.

## Files
- `Cluster.html` — the playable prototype (entry point; loads `src/*`).
- `Style Directions.html` — the three light theme directions side by side.
- `src/styles.css` — full design system: theme tokens + every component style.
- `src/store.jsx` — simulation: seed data, economy constants, auto-spread, grader, reducer, tick engine, incident generator.
- `src/app.jsx` — shell, router, intro, first-ticket beat, tweak defaults.
- `src/hud.jsx` — HUD, side nav, brand.
- `src/tickets.jsx` — ticket board, card, detail slide-over.
- `src/cluster-screen.jsx` — Infrastructure screen: nodes, provisioning, workload boards.
- `src/build.jsx` — Repos / Registry / CI pipeline.
- `src/service-form.jsx` — service authoring slide-over + placement editor.
- `src/techtree.jsx` — upgrades tree.
- `src/ui.jsx` — primitives: Icon, LED, StatusPill, Meter, Avatar, Toggle, Slider, Seg, ErrorRate, Toasts.
- `src/tweaks-panel.jsx` — prototype-only tweak panel (do not port; replace with a settings/debug menu).

## Open items / later milestones
- Secrets & Data Tier (deferred upgrade).
- Service delete has a reducer action but no UI entry point yet.
- Responsive: designed desktop-only (min-width 1180px).
