/* ============================================================
   Reducer — every player action. Pure: (state, action) → state.
   ============================================================ */
import { CONFIG } from './config';
import { scriptedTickets, SEED_REPOS, upgradeCatalog } from './content';
import { effectiveReward, ticketMet } from './grader';
import { hasUpgrade, latestImages, money, nextId, pushToast, dayOf, nodeProvisionCost } from './helpers';
import { autoSpread, freeSlots, podsOnNode, resizePlacement, totalFree } from './placement';
import { makeRng, randomSeed } from './rng';
import { tick } from './tick';
import type { Action, Draft, GameState, Hw, NodeTier, Service, LogEntry, ToastKind } from './types';

export function seedState(seed: number = randomSeed()): GameState {
  return {
    version: CONFIG.SAVE_VERSION,
    clock: { tick: 0, paused: true, speed: 1, mins: CONFIG.START_MINS },
    meters: { sla: 100, budget: CONFIG.START_BUDGET, xp: 0 },
    nodes: [{ id: 'node-alpha', name: 'node-alpha', kind: 'generic', tier: 'Normal', slots: 4, tags: [], downFor: 0, provisionedTick: 0 }],
    repos: SEED_REPOS.map(r => ({ ...r })),
    images: [],
    services: [],
    tickets: [],
    pending: scriptedTickets(),
    upgrades: upgradeCatalog(),
    events: [],
    toasts: [],
    form: { open: false, editingId: null, draft: null },
    ui: { screen: 'tickets', infraTab: 'cluster', boardView: 'cards', addNode: false, openTicket: null },
    seq: { ticket: 105, uid: 0, bug: 1 },
    rng: seed >>> 0,
    firstBeat: null,
    flash: { bad: null, rebalance: null },
    stats: { ticketsResolved: 0, incidentsResolved: 0, incidentsRaised: 0, moneyEarned: 0, moneySpent: 0, nodesProvisioned: 1,
      imagesBuilt: 0, peakServices: 0, worstSla: 100, outagesSurvived: 0, outagesFelt: 0, bailouts: 0, revenueEarned: 0 },
    outcome: null,
    endless: false,
    nextProcTick: CONFIG.PROC_FIRST,
    budgetDebtTicks: 0,
    lastOutageTick: 0,
    settings: { drama: 0.6, pauseOnTicket: true },
    log: [],
    lastBailoutDay: 0,
    toastStamp: {},
  };
}

export function mkService(o: Partial<Service> & { name: string; imageId: string; type: Service['type']; replicas: number; id: string; createdTick: number }, demand: number): Service {
  return {
    id: o.id, name: o.name, imageId: o.imageId, type: o.type, replicas: o.replicas,
    liveness: o.liveness ?? false, readiness: o.readiness ?? false,
    affinity: o.affinity ?? null, spread: o.spread ?? 'auto', podNodes: o.podNodes ?? [],
    status: o.status ?? 'Pending', ready: o.ready ?? [0, o.replicas],
    restarts: 0, errorRate: 0.002, health: 100, demand,
    age: 0, settleIn: o.status === 'Running' ? 0 : CONFIG.SETTLE_TICKS, incidentCooldown: 0,
    crashFor: 0, lowLoadTicks: 0, createdTick: o.createdTick,
  };
}

export function blankDraft(state: GameState, imageId?: string): Draft {
  const imgs = latestImages(state);
  const img = (imageId && imgs.find(i => i.id === imageId)) || imgs[0];
  let name = '';
  if (img) { const repo = state.repos.find(r => r.id === img.repoId); name = repo ? repo.name : ''; }
  const replicas = 2;
  return { name, imageId: img ? img.id : '', type: 'Pod', replicas, liveness: false, readiness: false,
    affinity: null, spread: 'auto', podNodes: autoSpread(state, replicas, { affinity: null }) };
}

export function withToast(state: GameState, kind: ToastKind, title: string, msg: string): GameState {
  return { ...state, toasts: pushToast(state.toasts, kind, title, msg, state.clock.tick), log: addLog(state.log, state.clock.tick, kind, title, msg) };
}
export function addLog(log: LogEntry[], tick: number, kind: ToastKind, title: string, msg: string): LogEntry[] {
  const id = (log.length ? log[log.length - 1].id : 0) + 1;
  return [...log.slice(-(CONFIG.LOG_MAX - 1)), { id, tick, kind, title, msg }];
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NAV':        return { ...state, ui: { ...state.ui, screen: action.screen } };
    case 'INFRA_TAB':  return { ...state, ui: { ...state.ui, infraTab: action.tab } };
    case 'BOARD_VIEW': return { ...state, ui: { ...state.ui, boardView: action.view } };
    case 'CLEAR_BEAT': return { ...state, firstBeat: null };
    case 'OPEN_TICKET': return { ...state, ui: { ...state.ui, screen: action.id ? 'tickets' : state.ui.screen, openTicket: action.id } };
    case 'PAUSE':      return { ...state, clock: { ...state.clock, paused: action.paused } };
    case 'SPEED':      return state.outcome && !state.endless ? state : { ...state, clock: { ...state.clock, speed: action.speed, paused: false } };
    case 'SET_DRAMA':  return { ...state, settings: { ...state.settings, drama: Math.max(0, Math.min(1, action.drama)) } };
    case 'SET_PAUSE_ON_TICKET': return { ...state, settings: { ...state.settings, pauseOnTicket: action.on } };
    case 'TOAST':      return withToast(state, action.kind, action.title, action.msg);
    case 'DISMISS_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case 'LOAD_STATE': return { ...action.state, clock: { ...action.state.clock, paused: true }, toasts: [], form: { open: false, editingId: null, draft: null } };
    case 'NEW_GAME':   return seedState(action.seed);
    case 'CONTINUE_ENDLESS': return { ...state, endless: true, clock: { ...state.clock, paused: true } };

    /* ---- nodes ---- */
    case 'TOGGLE_ADDNODE': return { ...state, ui: { ...state.ui, addNode: action.open ?? !state.ui.addNode } };
    case 'PROVISION_NODE': {
      const tier: NodeTier = action.kind === 'special' ? 'Special' : (action.tier ?? 'Normal');
      if (tier === 'Large' && !hasUpgrade(state, 'large_nodes')) return state;
      if (tier === 'Special' && !hasUpgrade(state, 'special_nodes')) return state;
      const cost = CONFIG.NODE_PROVISION[tier];
      if (state.meters.budget < cost) return withToast(state, 'warn', 'Not enough budget', `Provisioning needs ${money(cost)}.`);
      const used = new Set(state.nodes.map(n => n.name));
      const base = CONFIG.NODE_NAMES.find(nm => !used.has('node-' + nm));
      const name = base ? 'node-' + base : 'node-n' + (state.nodes.length + 1);
      const [id, st] = nextId(state, 'node');
      const hw = action.hw as Hw | undefined;
      const node = tier === 'Special' && hw
        ? { id, name, kind: 'special' as const, tier, slots: CONFIG.SLOTS.Special, tags: [hw], hw, downFor: 0, provisionedTick: state.clock.tick }
        : { id, name, kind: 'generic' as const, tier, slots: CONFIG.SLOTS[tier], tags: [] as Hw[], downFor: 0, provisionedTick: state.clock.tick };
      const label = node.kind === 'special' ? `${node.hw} · 16 slots` : `${tier} · ${node.slots} slots`;
      return withToast({ ...st, nodes: [...st.nodes, node], ui: { ...st.ui, addNode: false },
        meters: { ...st.meters, budget: st.meters.budget - cost },
        stats: { ...st.stats, nodesProvisioned: st.stats.nodesProvisioned + 1, moneySpent: st.stats.moneySpent + cost } },
        'ok', 'Node provisioned', `${name} · ${label}`);
    }
    case 'DECOMMISSION_NODE': {
      const n = state.nodes.find(x => x.id === action.id);
      if (!n) return state;
      if (state.nodes.length <= 1) return withToast(state, 'warn', 'Can’t decommission', 'You need at least one node.');
      if (podsOnNode(state, n.id) > 0) return withToast(state, 'warn', 'Node has pods', `Move or remove the pods on ${n.name} first.`);
      const refund = Math.round(nodeProvisionCost(n) * CONFIG.NODE_DECOMMISSION_REFUND);
      return withToast({ ...state, nodes: state.nodes.filter(x => x.id !== n.id),
        meters: { ...state.meters, budget: state.meters.budget + refund } },
        'info', 'Node decommissioned', `${n.name} returned · ${money(refund)} refunded`);
    }
    case 'NODE_ADD_TAG':
      return { ...state, nodes: state.nodes.map(n => (n.id === action.id && n.kind === 'generic' && !n.tags.includes(action.tag) && n.tags.length < CONFIG.MAX_TAGS)
        ? { ...n, tags: [...n.tags, action.tag] } : n) };
    case 'NODE_REMOVE_TAG':
      return { ...state, nodes: state.nodes.map(n => (n.id === action.id && n.kind === 'generic') ? { ...n, tags: n.tags.filter(t => t !== action.tag) } : n) };

    /* ---- tickets ---- */
    case 'TICKET_RESOLVE': {
      const t = state.tickets.find(x => x.id === action.id);
      if (!t || t.status === 'done') return state;
      if (!ticketMet(state, t)) return withToast(state, 'warn', 'Not yet', `${t.id} — acceptance criteria not met`);
      const tickNow = state.clock.tick;
      const pay = t.paid ? 0 : effectiveReward(t, tickNow, CONFIG.TICKS_PER_DAY, CONFIG.DEADLINE_DECAY_PER_DAY, CONFIG.DEADLINE_DECAY_MIN);
      const onTime = !t.paid && t.type !== 'bug' && (t.dueTick == null || tickNow <= t.dueTick);
      const xp = t.paid ? 0 : t.xp + (onTime && t.dueTick != null ? CONFIG.ON_TIME_XP : 0);
      const tickets = state.tickets.map(x => x.id === action.id
        ? { ...x, status: 'done' as const, paid: true, paidAmount: t.paid ? t.paidAmount : pay, resolvedTick: tickNow, regressed: false } : x);
      const first = !t.paid;
      const stats = { ...state.stats,
        ticketsResolved: state.stats.ticketsResolved + (first && t.type !== 'bug' ? 1 : 0),
        incidentsResolved: state.stats.incidentsResolved + (first && t.type === 'bug' ? 1 : 0),
        moneyEarned: state.stats.moneyEarned + pay };
      const st = { ...state, tickets, stats, meters: { ...state.meters, budget: state.meters.budget + pay, xp: state.meters.xp + xp } };
      const late = pay < t.reward && !t.paid ? ' (late — reward reduced)' : '';
      return withToast(st, 'ok', t.type === 'bug' ? 'Incident resolved' : 'Ticket resolved',
        t.paid ? `${t.id} closed again · already paid` : `${t.id} closed · +${money(pay)} · +${xp} XP${late}`);
    }
    case 'TICKET_REOPEN':
      return { ...state, tickets: state.tickets.map(x => x.id === action.id ? { ...x, status: 'todo' } : x) };

    /* ---- build ---- */
    case 'BUILD_IMAGE': {
      const repo = state.repos.find(r => r.id === action.repoId);
      if (!repo) return state;
      if (state.images.some(i => i.repoId === repo.id && i.building)) return withToast(state, 'info', 'Already building', `${repo.name} is in the pipeline.`);
      const fast = hasUpgrade(state, 'fast_build');
      const maxV = Math.max(0, ...state.images.filter(i => i.repoId === repo.id).map(i => i.version));
      const version = maxV + 1;
      const [id, st] = nextId(state, 'img');
      const rng = makeRng(st.rng ^ (version * 7919));
      const digest = 'sha256:' + rng.int(0x1000, 0xffff).toString(16) + '…' + rng.int(0x10, 0xff).toString(16);
      const img = { id, repoId: repo.id, version, tag: `${repo.name}:${version}.0.0`, digest, builtTick: st.clock.tick, building: true, progress: 0, fast };
      return withToast({ ...st, images: [...st.images, img] }, 'info', 'Build started', `${repo.name} → v${version} (${fast ? 'cached' : 'cold'} build)`);
    }
    case 'BUILD_TICK': return buildTick(state);

    /* ---- service form ---- */
    case 'FORM_NEW':  return { ...state, form: { open: true, editingId: null, draft: blankDraft(state, action.imageId) } };
    case 'FORM_EDIT': {
      const s = state.services.find(x => x.id === action.id);
      if (!s) return state;
      const draft: Draft = { name: s.name, imageId: s.imageId, type: s.type, replicas: s.replicas, liveness: s.liveness, readiness: s.readiness,
        affinity: s.affinity, spread: s.spread, podNodes: [...s.podNodes] };
      return { ...state, form: { open: true, editingId: action.id, draft } };
    }
    case 'FORM_SET': {
      const cur = state.form.draft;
      if (!cur) return state;
      const patch: Partial<Draft> = { ...action.patch };
      if (patch.imageId) {
        const img = state.images.find(i => i.id === patch.imageId);
        const repo = img && state.repos.find(r => r.id === img.repoId);
        const curImg = state.images.find(i => i.id === cur.imageId);
        // an existing service keeps its identity: only images from its own repo
        if (state.form.editingId && curImg && img && img.repoId !== curImg.repoId) delete patch.imageId;
        else if (repo) patch.name = repo.name;
      }
      if (patch.type === 'Deployment' && !hasUpgrade(state, 'deployments')) delete patch.type;
      if (patch.affinity && !hasUpgrade(state, 'affinity')) delete patch.affinity;
      if ((patch.liveness || patch.readiness) && !hasUpgrade(state, 'dashboard')) { delete patch.liveness; delete patch.readiness; }
      if (patch.replicas != null) patch.replicas = Math.max(0, Math.min(CONFIG.MAX_REPLICAS, Math.round(patch.replicas)));
      const next: Draft = { ...cur, ...patch };
      const sizingChanged = 'replicas' in patch || 'affinity' in patch || 'spread' in patch;
      if (next.spread === 'auto' && (sizingChanged || next.podNodes.length !== next.replicas)) {
        next.podNodes = autoSpread(state, next.replicas, { affinity: next.affinity, exceptId: state.form.editingId });
      }
      if (next.spread === 'manual' && 'replicas' in patch) {
        next.podNodes = resizePlacement(state, next.podNodes, next.replicas, state.form.editingId);
      }
      return { ...state, form: { ...state.form, draft: next } };
    }
    case 'FORM_PLACE': {
      const d = state.form.draft;
      if (!d) return state;
      const pn = [...d.podNodes];
      if (action.delta > 0) { if (pn.length < d.replicas) pn.push(action.nodeId); }
      else { const idx = pn.lastIndexOf(action.nodeId); if (idx >= 0) pn.splice(idx, 1); }
      return { ...state, form: { ...state.form, draft: { ...d, podNodes: pn } } };
    }
    case 'FORM_RESPREAD': {
      const d = state.form.draft;
      if (!d) return state;
      return { ...state, form: { ...state.form, draft: { ...d, podNodes: autoSpread(state, d.replicas, { affinity: d.affinity, exceptId: state.form.editingId }) } } };
    }
    case 'FORM_CLOSE': return { ...state, form: { open: false, editingId: null, draft: null } };

    case 'SERVICE_SAVE': {
      const d = state.form.draft;
      if (!d || !d.imageId) return state;
      const rolling = hasUpgrade(state, 'rolling');
      const isNew = !state.form.editingId;
      const prev = isNew ? null : state.services.find(s => s.id === state.form.editingId);
      if (isNew && state.services.some(s => s.name === d.name)) return withToast(state, 'warn', 'Already deployed', `${d.name} exists — edit it from the Cluster board.`);
      const addedPods = d.replicas - (prev ? prev.replicas : 0);
      if (addedPods > 0 && (state.meters.budget < 0 || state.meters.budget < addedPods * CONFIG.POD_COST)) {
        return withToast(state, 'bad', 'Budget too low', 'Clear a paying ticket before adding pods.');
      }
      if (d.replicas > totalFree(state, state.form.editingId)) return withToast(state, 'bad', 'Out of slots', 'Provision another node first.');
      if (d.spread === 'manual' && d.podNodes.length !== d.replicas) return withToast(state, 'warn', 'Placement incomplete', 'Place every replica or switch to Auto-spread.');
      const podNodes = d.podNodes.length === d.replicas ? d.podNodes : autoSpread(state, d.replicas, { affinity: d.affinity, exceptId: state.form.editingId });
      {
        const free = freeSlots(state, state.form.editingId);
        const want: Record<string, number> = {};
        for (const nid of podNodes) want[nid] = (want[nid] ?? 0) + 1;
        const over = Object.entries(want).find(([nid, n]) => n > (free[nid] ?? 0));
        if (over) { const nm = state.nodes.find(n => n.id === over[0])?.name ?? 'a node'; return withToast(state, 'bad', 'Node over capacity', `${nm} doesn’t have room for ${over[1]} pods. Re-distribute.`); }
      }
      if (isNew) {
        const [id, st] = nextId(state, 'svc');
        const rng = makeRng(st.rng ^ st.seq.uid);
        const ns = mkService({ ...d, id, podNodes, status: d.replicas === 0 ? 'Idle' : 'Pending', ready: [0, d.replicas], createdTick: st.clock.tick }, rng.range(30, 70));
        ns.settleIn = d.replicas === 0 ? 0 : CONFIG.SETTLE_TICKS;
        const services = [...st.services, ns];
        const n = new Set(podNodes).size;
        return withToast({ ...st, services, form: { open: false, editingId: null, draft: null },
          ui: { ...st.ui, screen: 'infra', infraTab: 'cluster' },
          stats: { ...st.stats, peakServices: Math.max(st.stats.peakServices, services.length) } },
          'info', 'Service scheduled', `${d.name} → ${n} node${n === 1 ? '' : 's'}`);
      }
      const services = state.services.map(s => {
        if (s.id !== state.form.editingId) return s;
        if (d.replicas === 0) return { ...s, ...d, podNodes, status: 'Idle' as const, ready: [0, 0] as [number, number], settleIn: 0, crashFor: 0 };
        // a rolling update keeps a healthy service serving; anything not yet healthy (re)settles
        const settling = s.status === 'Idle' || s.status === 'Pending' || s.status === 'CrashLoopBackOff' || s.settleIn > 0;
        if (rolling && !settling) {
          return { ...s, ...d, podNodes, ready: [Math.min(s.ready[0], d.replicas), d.replicas] as [number, number], settleIn: 0 };
        }
        return { ...s, ...d, podNodes, status: 'Pending' as const,
          ready: [rolling ? Math.min(s.ready[0], d.replicas) : 0, d.replicas] as [number, number],
          settleIn: rolling && s.settleIn > 0 ? s.settleIn : CONFIG.SETTLE_TICKS, crashFor: 0 };
      });
      return withToast({ ...state, services, form: { open: false, editingId: null, draft: null } },
        rolling ? 'ok' : 'info', rolling ? 'Rolling update' : 'Redeploying', `${d.name} · ${rolling ? 'zero downtime' : 'pods restarting'}`);
    }
    case 'SERVICE_DELETE': {
      const s = state.services.find(x => x.id === action.id);
      if (!s) return state;
      return withToast({ ...state, services: state.services.filter(x => x.id !== action.id), form: { open: false, editingId: null, draft: null } },
        'warn', 'Service removed', s.name);
    }
    case 'SERVICE_RESTART': {
      const services = state.services.map(s => s.id === action.id
        ? { ...s, status: s.replicas === 0 ? 'Idle' as const : 'Pending' as const, ready: [0, s.replicas] as [number, number],
            settleIn: s.replicas === 0 ? 0 : CONFIG.RESTART_SETTLE_TICKS, errorRate: 0.002, health: 100, age: 0, crashFor: 0, restarts: s.restarts + 1 }
        : s);
      return withToast({ ...state, services }, 'info', 'Manual restart', 'Rolling pods…');
    }

    /* ---- upgrades ---- */
    case 'BUY_UPGRADE': {
      const u = state.upgrades.find(x => x.id === action.id);
      if (!u || u.owned) return state;
      if (!u.requires.every(r => state.upgrades.find(x => x.id === r)?.owned)) return state;
      if (state.meters.budget < u.cost || state.meters.xp < u.xp) return state;
      const upgrades = state.upgrades.map(x => x.id === action.id ? { ...x, owned: true } : x);
      let st: GameState = { ...state, upgrades,
        meters: { ...state.meters, budget: state.meters.budget - u.cost, xp: state.meters.xp - u.xp },
        stats: { ...state.stats, moneySpent: state.stats.moneySpent + u.cost } };
      st = withToast(st, 'ok', 'Upgrade unlocked', u.name);
      if (u.effect === 'dashboard') st = withToast(st, 'ok', 'Observability online', 'Live health is now visible on the Cluster board.');
      if (u.final && !st.outcome) {
        st = { ...st, outcome: { kind: 'won', atTick: st.clock.tick, reason: 'Secrets & Data Tier online — prod-east-1 runs itself.' }, clock: { ...st.clock, paused: true } };
      }
      return st;
    }

    case 'BAILOUT': {
      const day = dayOf(state.clock.tick);
      if (state.meters.budget >= 0) return state;
      if (state.lastBailoutDay === day) return withToast(state, 'warn', 'Finance said no', 'Emergency funding is once per day.');
      const xpCost = Math.min(CONFIG.BAILOUT_XP, state.meters.xp);
      return withToast({ ...state, lastBailoutDay: day,
        meters: { ...state.meters, budget: state.meters.budget + CONFIG.BAILOUT_AMOUNT, xp: state.meters.xp - xpCost },
        stats: { ...state.stats, bailouts: state.stats.bailouts + 1 } },
        'warn', 'Emergency funding', `+${money(CONFIG.BAILOUT_AMOUNT)} · −${xpCost} XP · Finance is “disappointed”.`);
    }

    case 'TICK': return tick(state);
    default: return state;
  }
}

export function buildTick(state: GameState): GameState {
  let any = false;
  const images = state.images.map(im => {
    if (!im.building) return im;
    any = true;
    const progress = im.progress + (im.fast ? CONFIG.BUILD_STEP_FAST : CONFIG.BUILD_STEP);
    return progress >= 100 ? { ...im, building: false, progress: 100 } : { ...im, progress };
  });
  if (!any) return state;
  const finished = images.filter((im, i) => state.images[i].building && !im.building);
  let st: GameState = { ...state, images, stats: { ...state.stats, imagesBuilt: state.stats.imagesBuilt + finished.length } };
  for (const im of finished) st = withToast(st, 'ok', 'Image built', im.tag);
  return st;
}
