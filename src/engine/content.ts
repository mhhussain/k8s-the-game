/* ============================================================
   Content: seed data, scripted tickets, procedural tickets,
   incident tickets, upgrade catalog
   ============================================================ */
import { CONFIG } from './config';
import { misplaced } from './placement';
import { latestVersionFor } from './helpers';
import type { Criterion, GameState, Hw, Priority, Repo, Service, Ticket, Upgrade, Lang } from './types';
import type { Rng } from './rng';

export const LANGS: Record<string, string> = { Go: '#1AA6C0', Node: '#5BA641', Python: '#4C6EF5', Rust: '#D2742B', Java: '#C85B5B' };
export const langOf = (name: string): Lang => ({ name, color: LANGS[name] ?? '#777' });

export const SEED_REPOS: Repo[] = [
  { id: 'repo-1', name: 'web-storefront',   lang: 'Node',   desc: 'Customer-facing shop. The money-maker.' },
  { id: 'repo-2', name: 'checkout-api',     lang: 'Go',     desc: 'Payments + cart. Hates downtime.' },
  { id: 'repo-3', name: 'image-resizer',    lang: 'Rust',   desc: 'Thumbnails on demand. Bursty.' },
  { id: 'repo-4', name: 'recommend-engine', lang: 'Python', desc: '"People also bought…" Spiky traffic.' },
  { id: 'repo-5', name: 'audit-log',        lang: 'Java',   desc: 'Compliance write-only firehose.' },
];

export const REQUESTERS: { name: string; color: string }[] = [
  { name: 'Priya · Finance',    color: '#4C6EF5' },
  { name: 'Dana · Growth',      color: '#5BA641' },
  { name: 'Marcus · Compliance',color: '#D2742B' },
  { name: 'Sam · Ops',          color: '#C85B5B' },
  { name: 'Lena · Product',     color: '#9B5DE5' },
  { name: 'Theo · Support',     color: '#0E9BB8' },
  { name: 'June · Security',    color: '#E08A00' },
];

function tk(
  id: string, requester: string, avatar: string, prio: Priority, svc: string, repo: string,
  title: string, body: string, hint: string, reward: number, xp: number, criteria: Criterion[], createdTick = 0,
): Ticket {
  return { id, type: 'new', requester, avatar, prio, svc, repo, title, body, hint, reward, xp, criteria, status: 'todo', createdTick, paid: false };
}

/* ---------- scripted campaign (staggered) ---------- */
export function scriptedTickets(): { atTick: number; ticket: Ticket }[] {
  return [
    { atTick: 3, ticket: { ...tk('TCK-101', 'Priya · Finance', '#4C6EF5', 'med', 'web-storefront', 'repo-1',
        'Get web-storefront live',
        'Get the storefront running so the team has something to point at. Nothing fancy yet — just make it serve.',
        'Build the image first (drag the repo onto the Registry), then deploy a service from it.',
        700, 30,
        [{ kind: 'running', svc: 'web-storefront', label: 'web-storefront is running' }]), first: true } },
    { atTick: 36, ticket: tk('TCK-102', 'Dana · Growth', '#5BA641', 'high', 'recommend-engine', 'repo-4',
        'Make the recommendation engine highly available',
        'Marketing’s "people also bought" strip goes live for the weekend campaign. It cannot blink — it needs to survive a node going down.',
        'High availability is config-checkable: a Deployment with ≥2 replicas spread over ≥2 nodes. You’ll need to provision a second node — and unlock Deployments.',
        1100, 60,
        [ { kind: 'running', svc: 'recommend-engine', label: 'recommend-engine is running' },
          { kind: 'ha',      svc: 'recommend-engine', label: 'High availability' } ]) },
    { atTick: 72, ticket: tk('TCK-103', 'Marcus · Compliance', '#D2742B', 'med', 'audit-log', 'repo-5',
        'Stand up audit-log on DATA hardware',
        'Compliance needs audit-log running and keeping data "where the auditors expect it" — on a DATA node. And it must never be a single point of failure.',
        '"Where the auditors expect it" = a DATA-tagged node. Click the dashed + on a node card to tag it DATA (or provision a special DATA node), and keep it highly available.',
        950, 50,
        [ { kind: 'running',  svc: 'audit-log', label: 'audit-log is running' },
          { kind: 'ha',       svc: 'audit-log', label: 'High availability' },
          { kind: 'node_tag', svc: 'audit-log', tag: 'DATA', label: 'Every replica on a DATA node' } ]) },
    { atTick: 110, ticket: tk('TCK-104', 'Sam · Ops', '#C85B5B', 'low', 'image-resizer', 'repo-3',
        'Thumbnails service for sale days',
        'Stand up image-resizer so the catalog stops loading broken thumbnails. Sale days get rough — expect bursts.',
        '"Sale days get rough" = give it headroom. Thin on replicas and it buckles the first busy afternoon.',
        800, 50,
        [ { kind: 'running',  svc: 'image-resizer', label: 'image-resizer is running' },
          { kind: 'replicas', svc: 'image-resizer', n: 3, label: 'Headroom for bursts — ≥3 replicas' } ]) },
  ];
}

/* ---------- procedural tickets (after the campaign) ----------
   Picks a template that is NOT already satisfied by the live cluster, so
   every ticket asks for real work. Returns null if nothing fits. */
export function proceduralTicket(state: GameState, rng: Rng, seqNo: number): Ticket | null {
  const id = `TCK-${seqNo}`;
  const tick = state.clock.tick;
  const req = rng.pick(REQUESTERS);
  // one open request per service at a time, so the board never shows duplicates
  const busy = new Set(state.tickets.filter(t => t.status === 'todo').map(t => t.svc));
  const running = state.services.filter(s => s.replicas > 0 && !busy.has(s.name));
  const notDeployed = SEED_REPOS.filter(r => !state.services.some(s => s.name === r.name) && !busy.has(r.name));
  const hasDeployments = state.upgrades.some(u => u.owned && u.effect === 'deployments');
  const hasDash = state.upgrades.some(u => u.owned && u.effect === 'dashboard');
  const hasAffinity = state.upgrades.some(u => u.owned && u.effect === 'affinity');

  type Tpl = { w: number; make: () => Ticket | null };
  const tpls: Tpl[] = [
    // 1. a new service from an un-deployed repo
    { w: 3, make: () => {
      if (!notDeployed.length) return null;
      const r = rng.pick(notDeployed);
      const prio: Priority = rng.pick(['med', 'low', 'high']);
      const flavors = [
        [`Ship ${r.name}`, `${r.desc} Product wants it live this week — nothing fancy, just serving.`, 'Build the image, author a service, make sure it reports Running.'],
        [`${r.name} needs to exist in prod`, `Someone demoed ${r.name} to a customer. Now it has to actually run. “Just like the demo.”`, '“Just like the demo” = running and healthy. Build it, deploy it, keep it green.'],
      ];
      const [title, body, hint] = rng.pick(flavors);
      return tk(id, req.name, req.color, prio, r.name, r.id, title, body, hint, rng.int(60, 90) * 10, rng.int(3, 5) * 10,
        [{ kind: 'running', svc: r.name, label: `${r.name} is running` }], tick);
    } },
    // 2. scale up a running service
    { w: 3, make: () => {
      const cands = running.filter(s => s.replicas < CONFIG.MAX_REPLICAS - 1);
      if (!cands.length) return null;
      const s = rng.pick(cands);
      const n = Math.min(CONFIG.MAX_REPLICAS, s.replicas + rng.int(1, 2));
      const flavors = [
        [`${s.name} is "feeling slow"`, `Support says ${s.name} is feeling slow in the afternoons. They don’t have numbers, just vibes. Loud vibes.`, '“Feeling slow in the afternoons” = peak-hour load. More replicas = more capacity.'],
        [`Capacity for ${s.name} before the launch`, `There’s a launch next week and ${s.name} is in the critical path. Nobody wants to explain a timeout to the CEO.`, 'Give it headroom now. Each replica adds ~55 req/s.'],
      ];
      const [title, body, hint] = rng.pick(flavors);
      return tk(id, req.name, req.color, rng.pick(['med', 'high']), s.name, undefined as unknown as string, title, body, hint,
        rng.int(55, 80) * 10, rng.int(3, 5) * 10,
        [ { kind: 'running',  svc: s.name, label: `${s.name} is running` },
          { kind: 'replicas', svc: s.name, n, label: `Capacity — ≥${n} replicas` } ], tick);
    } },
    // 3. make an existing service HA (needs Deployments to be purchasable)
    { w: hasDeployments ? 3 : 1, make: () => {
      const cands = running.filter(s => !(s.type === 'Deployment' && s.replicas >= 2 && new Set(s.podNodes.slice(0, s.replicas)).size >= 2));
      if (!cands.length) return null;
      const s = rng.pick(cands);
      return tk(id, req.name, req.color, 'high', s.name, undefined as unknown as string,
        `${s.name} cannot go down again`,
        `${s.name} blipped during a customer call. The account team is “very keen” that it never happens again.`,
        '“Never again” = high availability: a Deployment, ≥2 replicas, spread over ≥2 nodes.',
        rng.int(90, 120) * 10, rng.int(5, 7) * 10,
        [ { kind: 'running', svc: s.name, label: `${s.name} is running` },
          { kind: 'ha',      svc: s.name, label: 'High availability' } ], tick);
    } },
    // 4. move a service onto specific hardware
    { w: 2, make: () => {
      const cands = running.filter(s => !s.affinity);
      if (!cands.length) return null;
      const s = rng.pick(cands);
      const tag: Hw = rng.pick(CONFIG.HW);
      const why: Record<Hw, string> = {
        x86: 'a vendor library that “only works on x86, don’t ask”',
        ARM: 'the cost-savings initiative (“ARM is cheaper, make it happen”)',
        GPU: 'the new ML feature that “needs a GPU, obviously”',
        DATA: 'the auditors, who want it “next to the data”',
      };
      return tk(id, req.name, req.color, 'med', s.name, undefined as unknown as string,
        `Run ${s.name} on ${tag} hardware`,
        `${s.name} has to move onto ${tag} because of ${why[tag]}. Every replica, please.`,
        `Every replica on a ${tag}-tagged node. Tag a generic node ${tag} (or provision a special ${tag} node) and re-place the pods.${hasAffinity ? ' Node Affinity keeps the scheduler honest.' : ''}`,
        rng.int(70, 95) * 10, rng.int(4, 6) * 10,
        [ { kind: 'running',  svc: s.name, label: `${s.name} is running` },
          { kind: 'node_tag', svc: s.name, tag, label: `Every replica on a ${tag} node` } ], tick);
    } },
    // 5. probes (post-dashboard)
    { w: hasDash ? 2 : 0, make: () => {
      const cands = running.filter(s => !(s.liveness && s.readiness));
      if (!cands.length) return null;
      const s = rng.pick(cands);
      return tk(id, req.name, req.color, 'low', s.name, undefined as unknown as string,
        `${s.name}: "make it self-aware"`,
        `Ops reviewed ${s.name} and wrote “no health checks?!” in red. They want it to know when it’s broken.`,
        'Turn on both health probes (Liveness + Readiness) in the service form. Probes unlock with the Service Dashboard.',
        rng.int(45, 65) * 10, rng.int(3, 4) * 10,
        [ { kind: 'running', svc: s.name, label: `${s.name} is running` },
          { kind: 'probes',  svc: s.name, label: 'Liveness + Readiness probes enabled' } ], tick);
    } },
    // 6. latest version
    { w: 2, make: () => {
      const cands = running.filter(s => {
        const img = state.images.find(i => i.id === s.imageId);
        if (!img) return false;
        const maxV = Math.max(...state.images.filter(i => !i.building && i.repoId === img.repoId).map(i => i.version));
        return img.version < maxV;
      });
      if (!cands.length) return null;
      const s = rng.pick(cands);
      return tk(id, req.name, req.color, 'med', s.name, undefined as unknown as string,
        `Roll out the new ${s.name} build`,
        `Engineering shipped a new ${s.name} build with “the fix”. Nobody knows which fix. Ship it anyway.`,
        'Redeploy the service on the latest image from the Registry — or unlock Rolling Updates to do it automatically.',
        rng.int(50, 70) * 10, rng.int(3, 4) * 10,
        [ latestCriterion(state, s),
          { kind: 'stable', svc: s.name, label: `${s.name} healthy — all pods ready` } ], tick);
    } },
  ];

  const pool = tpls.filter(t => t.w > 0);
  for (let attempt = 0; attempt < 8; attempt++) {
    const total = pool.reduce((a, t) => a + t.w, 0);
    let r = rng.next() * total;
    let chosen = pool[0];
    for (const t of pool) { r -= t.w; if (r <= 0) { chosen = t; break; } }
    const t = chosen.make();
    if (t) {
      // asks about an already-running service are changes, not new services
      if (state.services.some(sv => sv.name === t.svc)) t.type = 'change';
      t.dueTick = tick + CONFIG.TICKS_PER_DAY * CONFIG.TICKET_DUE_DAYS[t.prio];
      return t;
    }
  }
  return null;
}

/* "on the latest version" is pinned to the newest build that exists when the
   ticket opens. Builds that land later (CI!) don't move the goalposts. */
export function latestCriterion(state: GameState, s: Service): Criterion {
  const v = latestVersionFor(state, s);
  return { kind: 'latest', svc: s.name, n: v, label: v ? `${s.name} on v${v} or newer` : `${s.name} on the latest version` };
}

/* ---------- incident (BUG) tickets ---------- */
export function makeBugTicket(state: GameState, s: Service, n: number, overload: boolean): Ticket {
  const id = `BUG-${n}`;
  const mis = misplaced(state, s);
  const base: Ticket = {
    id, type: 'bug', svc: s.name, status: 'todo', createdTick: state.clock.tick, paid: false,
    requester: 'Monitoring · auto', avatar: '#DC3F32', prio: overload ? 'high' : 'med',
    reward: overload ? CONFIG.INCIDENT_REWARD_OVERLOAD : CONFIG.INCIDENT_REWARD, xp: CONFIG.INCIDENT_XP,
    title: '', body: '', hint: '',
    criteria: [{ kind: 'stable', svc: s.name, label: `${s.name} healthy again — no errors, all pods ready` }],
  };
  if (mis > 0) {
    return { ...base,
      title: `${s.name} has pods that won’t go live`,
      body: `${s.name} requires ${s.affinity} hardware, but ${mis} replica${mis > 1 ? 's are' : ' is'} scheduled on a node without that tag. The pod${mis > 1 ? 's are' : ' is'} placed but stuck unhealthy.`,
      hint: `Tag a node ${s.affinity} (generic nodes are editable), provision a ${s.affinity} node, or re-place the replicas onto matching nodes.` };
  }
  if (s.status === 'Stale') {
    return { ...base, reward: CONFIG.INCIDENT_REWARD_STALE, xp: CONFIG.INCIDENT_XP_STALE, prio: 'med',
      title: `${s.name} is serving errors`,
      body: `Users report ${s.name} is flaky and returning stale data. It looks out of date.`,
      hint: 'It’s running an old build. Redeploy it on the latest image — or unlock Rolling Updates to keep it fresh automatically.',
      criteria: [latestCriterion(state, s), base.criteria[0]] };
  }
  if (overload) {
    return { ...base,
      title: `${s.name} is crashing under load`,
      body: `${s.name} keeps falling over. Pages are timing out during busy periods.`,
      hint: 'It can’t keep up with traffic. Add replicas (or unlock the Autoscaler) so it has the capacity to cope.',
      criteria: [{ kind: 'replicas', svc: s.name, n: Math.min(s.replicas + 1, CONFIG.MAX_REPLICAS), label: `More capacity — ≥${Math.min(s.replicas + 1, CONFIG.MAX_REPLICAS)} replicas` }, base.criteria[0]] };
  }
  if (s.type === 'Pod') {
    return { ...base,
      title: `${s.name} pod died and stayed dead`,
      body: `${s.name} is a bare Pod. One of its pods crashed — and nothing is going to bring it back.`,
      hint: 'Restart it to clear the crash. A Deployment would recreate a dead pod by itself.' };
  }
  return { ...base,
    title: `${s.name} pod keeps dying`,
    body: `${s.name} is in a crash loop and restarting repeatedly. Get it stable.`,
    hint: 'Restart it to clear the loop. If it keeps happening, it needs more redundancy — or Auto-Remediation to self-heal.' };
}

/* regression: a resolved ticket's criteria stopped being true */
export function makeRegressionTicket(state: GameState, orig: Ticket, n: number): Ticket {
  return {
    id: `BUG-${n}`, type: 'bug', svc: orig.svc, status: 'todo', createdTick: state.clock.tick, paid: false,
    requester: orig.requester, avatar: orig.avatar, prio: 'high',
    reward: CONFIG.REGRESSION_REWARD, xp: CONFIG.REGRESSION_XP,
    title: `Regression: ${orig.title}`,
    body: `${orig.requester.split(' ·')[0]} is back. “${orig.title}” was closed, but it isn’t true anymore. They would like it to be true again.`,
    hint: 'Everything a resolved ticket asked for is expected to stay that way. Restore every criterion below. There’s no bonus for fixing what you broke.',
    criteria: orig.criteria.map(c => ({ ...c })),
  };
}

/* ---------- upgrade catalog ---------- */
export function upgradeCatalog(): Upgrade[] {
  return [
    { id: 'u-ci1', branch: 'Build', name: 'Continuous Integration', icon: 'ci',
      desc: 'Auto-builds a repo into the Registry every few hours. Stop dragging.', cost: 700, xp: 0, requires: [], owned: false, effect: 'ci_autobuild' },
    { id: 'u-ci2', branch: 'Build', name: 'Image Caching', icon: 'layers',
      desc: 'Builds finish ~3× faster.', cost: 1000, xp: 60, requires: ['u-ci1'], owned: false, effect: 'fast_build' },

    { id: 'u-wl1', branch: 'Workload', name: 'Deployments', icon: 'deploy',
      desc: 'Unlocks Deployment workloads — a dead pod is recreated, and re-homed when its node goes down. Required for high availability.', cost: 600, xp: 0, requires: [], owned: false, effect: 'deployments' },
    { id: 'u-wl2', branch: 'Workload', name: 'Rolling Updates', icon: 'rolling',
      desc: 'Edit live with zero downtime, and auto-refresh Stale services to the latest build.', cost: 1100, xp: 80, requires: ['u-wl1'], owned: false, effect: 'rolling' },

    { id: 'u-ob1', branch: 'Observability', name: 'Service Dashboard', icon: 'eye',
      desc: 'See live health for every service — status, restarts, error rate — and unlock health probes.', cost: 800, xp: 0, requires: [], owned: false, effect: 'dashboard' },
    { id: 'u-ob2', branch: 'Observability', name: 'Auto-Remediation', icon: 'heart',
      desc: 'Crashed pods are detected and restarted automatically — even bare Pods.', cost: 1200, xp: 120, requires: ['u-ob1'], owned: false, effect: 'self_heal' },

    { id: 'u-if1', branch: 'Infra', name: 'Large Nodes', icon: 'server',
      desc: 'Provision Large generic nodes (8 pod slots) for denser, flexible capacity.', cost: 900, xp: 40, requires: [], owned: false, effect: 'large_nodes' },
    { id: 'u-if2', branch: 'Infra', name: 'Specialized Hardware', icon: 'cpu',
      desc: 'Provision special nodes — x86 / ARM / GPU / DATA — each 16 slots and locked to one type. The way to get density.', cost: 1500, xp: 110, requires: ['u-if1'], owned: false, effect: 'special_nodes' },
    { id: 'u-if3', branch: 'Infra', name: 'Node Affinity', icon: 'pin',
      desc: 'Declare a service’s required hardware. A replica that lands on a node without the tag still schedules — but fails to go live.', cost: 1400, xp: 120, requires: ['u-if1'], owned: false, effect: 'affinity' },
    { id: 'u-if4', branch: 'Infra', name: 'Automatic Rebalance', icon: 'balance',
      desc: 'The scheduler quietly moves pods between nodes to even out utilization — and re-homes pods off overfull or wrong-tag nodes.', cost: 2100, xp: 140, requires: ['u-if2'], owned: false, effect: 'rebalance' },

    { id: 'u-sc1', branch: 'Scaling', name: 'Horizontal Autoscaler', icon: 'scale',
      desc: 'Adds replicas when a service is overloaded (if the cluster has room and the budget is positive) — and trims them when traffic fades.', cost: 2000, xp: 140, requires: ['u-wl1', 'u-ob1'], owned: false, effect: 'autoscale' },
    { id: 'u-sc2', branch: 'Scaling', name: 'Secrets & Data Tier', icon: 'lock',
      desc: 'Managed databases, secrets and backups. The last piece: with this, prod-east-1 runs itself. Completes the campaign.', cost: 3200, xp: 260, requires: ['u-sc1', 'u-ob2', 'u-if4'], owned: false, effect: 'data_tier', final: true },
  ];
}
