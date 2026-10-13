import { describe, expect, test } from 'vitest';
import { CONFIG } from '../config';
import { scriptedTickets } from '../content';
import { reducer, seedState } from '../reducer';
import type { Action, GameState, Service } from '../types';

/* ---------- helpers ---------- */
const run = (state: GameState, ...actions: Action[]) => actions.reduce(reducer, state);
const lastToast = (st: GameState) => st.toasts[st.toasts.length - 1];

/** seed + build repo-1 to completion */
function withImage(st = seedState(7), repoId = 'repo-1'): GameState {
  st = reducer(st, { type: 'BUILD_IMAGE', repoId });
  let guard = 0;
  while (st.images.some(i => i.building) && guard++ < 50) st = reducer(st, { type: 'BUILD_TICK' });
  return st;
}
/** deploy a Pod service from the first built image of repo-1 */
function withService(st = withImage(), replicas = 2): GameState {
  return run(st, { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { replicas } }, { type: 'SERVICE_SAVE' });
}
function own(st: GameState, ...ids: string[]): GameState {
  return { ...st, upgrades: st.upgrades.map(u => ids.includes(u.id) ? { ...u, owned: true } : u) };
}
const forceRunning = (s: Service): Service => ({ ...s, status: 'Running', ready: [s.replicas, s.replicas], settleIn: 0 });

/* ---------- builds ---------- */
describe('BUILD_IMAGE / BUILD_TICK', () => {
  test('a cold build takes ceil(100/BUILD_STEP) ticks and lands in the registry', () => {
    let st = reducer(seedState(7), { type: 'BUILD_IMAGE', repoId: 'repo-1' });
    expect(st.images).toHaveLength(1);
    expect(st.images[0]).toMatchObject({ repoId: 'repo-1', version: 1, building: true, progress: 0, fast: false, tag: 'web-storefront:1.0.0' });
    const ticksNeeded = Math.ceil(100 / CONFIG.BUILD_STEP);
    for (let i = 0; i < ticksNeeded - 1; i++) st = reducer(st, { type: 'BUILD_TICK' });
    expect(st.images[0].building).toBe(true);
    st = reducer(st, { type: 'BUILD_TICK' });
    expect(st.images[0]).toMatchObject({ building: false, progress: 100 });
    expect(st.stats.imagesBuilt).toBe(1);
    expect(lastToast(st)).toMatchObject({ kind: 'ok', title: 'Image built' });
    // BUILD_TICK with nothing building is a no-op (same object)
    expect(reducer(st, { type: 'BUILD_TICK' })).toBe(st);
  });

  test('refuses a second concurrent build of the same repo; versions increment', () => {
    let st = reducer(seedState(7), { type: 'BUILD_IMAGE', repoId: 'repo-1' });
    st = reducer(st, { type: 'BUILD_IMAGE', repoId: 'repo-1' });
    expect(st.images).toHaveLength(1);
    expect(lastToast(st).title).toBe('Already building');
    st = withImage(st, 'repo-1');
    st = reducer(st, { type: 'BUILD_IMAGE', repoId: 'repo-1' });
    expect(st.images[1].version).toBe(2);
    expect(reducer(st, { type: 'BUILD_IMAGE', repoId: 'nope' })).toBe(st);
  });

  test('Image Caching builds faster', () => {
    let st = own(seedState(7), 'u-ci1', 'u-ci2');
    st = reducer(st, { type: 'BUILD_IMAGE', repoId: 'repo-2' });
    expect(st.images[0].fast).toBe(true);
    let n = 0;
    while (st.images[0].building) { st = reducer(st, { type: 'BUILD_TICK' }); n++; }
    expect(n).toBe(Math.ceil(100 / CONFIG.BUILD_STEP_FAST));
  });
});

/* ---------- service form ---------- */
describe('FORM_NEW / FORM_SET / SERVICE_SAVE', () => {
  test('creates a Pending service and navigates to the cluster board', () => {
    const st0 = withImage();
    let st = reducer(st0, { type: 'FORM_NEW' });
    expect(st.form.open).toBe(true);
    expect(st.form.draft).toMatchObject({ name: 'web-storefront', imageId: st0.images[0].id, type: 'Pod', replicas: 2, spread: 'auto' });
    expect(st.form.draft?.podNodes).toHaveLength(2);
    st = reducer(st, { type: 'FORM_SET', patch: { replicas: 3 } });
    expect(st.form.draft?.podNodes).toHaveLength(3);
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(1);
    const s = st.services[0];
    expect(s).toMatchObject({ name: 'web-storefront', replicas: 3, status: 'Pending', ready: [0, 3], settleIn: CONFIG.SETTLE_TICKS, type: 'Pod' });
    expect(s.podNodes).toEqual(['node-alpha', 'node-alpha', 'node-alpha']);
    expect(s.createdTick).toBe(st.clock.tick);
    expect(st.form.open).toBe(false);
    expect(st.ui.screen).toBe('infra');
    expect(st.ui.infraTab).toBe('cluster');
    expect(st.stats.peakServices).toBe(1);
    expect(lastToast(st).title).toBe('Service scheduled');
  });

  test('SERVICE_SAVE with no draft or no image is a no-op', () => {
    const st = seedState(7);
    expect(reducer(st, { type: 'SERVICE_SAVE' })).toBe(st);
    const noImg = reducer(st, { type: 'FORM_NEW' });
    expect(noImg.form.draft?.imageId).toBe('');
    expect(reducer(noImg, { type: 'SERVICE_SAVE' })).toBe(noImg);
  });

  test('refuses when over capacity', () => {
    let st = run(withImage(), { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { replicas: 5 } });
    expect(st.form.draft?.replicas).toBe(5);
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(0);
    expect(st.form.open).toBe(true);
    expect(lastToast(st)).toMatchObject({ kind: 'bad', title: 'Out of slots' });
  });

  test('refuses when the budget is too low for the added pods', () => {
    let st = withImage();
    st = { ...st, meters: { ...st.meters, budget: 2 * CONFIG.POD_COST - 1 } };
    st = run(st, { type: 'FORM_NEW' }, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(0);
    expect(lastToast(st)).toMatchObject({ kind: 'bad', title: 'Budget too low' });
    // exactly enough is fine
    st = withImage();
    st = { ...st, meters: { ...st.meters, budget: 2 * CONFIG.POD_COST } };
    st = run(st, { type: 'FORM_NEW' }, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(1);
    // negative budget refuses even for a single pod
    st = withImage();
    st = { ...st, meters: { ...st.meters, budget: -1 } };
    st = run(st, { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { replicas: 1 } }, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(0);
  });

  test('refuses a duplicate service name', () => {
    let st = withService();
    st = run(st, { type: 'FORM_NEW' }, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(1);
    expect(lastToast(st).title).toBe('Already deployed');
  });

  test('replicas are clamped to [0, MAX_REPLICAS] and 0 replicas yields Idle', () => {
    let st = run(withImage(), { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { replicas: 99 } });
    expect(st.form.draft?.replicas).toBe(CONFIG.MAX_REPLICAS);
    st = reducer(st, { type: 'FORM_SET', patch: { replicas: -3 } });
    expect(st.form.draft?.replicas).toBe(0);
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services[0]).toMatchObject({ replicas: 0, status: 'Idle', settleIn: 0 });
  });

  test('FORM_SET ignores Deployment / affinity / probes when the upgrades are not owned', () => {
    let st = reducer(withImage(), { type: 'FORM_NEW' });
    st = reducer(st, { type: 'FORM_SET', patch: { type: 'Deployment', affinity: 'GPU', liveness: true, readiness: true } });
    expect(st.form.draft).toMatchObject({ type: 'Pod', affinity: null, liveness: false, readiness: false });
    // and honours them once owned
    const owned = own(st, 'u-wl1', 'u-if1', 'u-if3', 'u-ob1');
    const d = reducer(owned, { type: 'FORM_SET', patch: { type: 'Deployment', affinity: 'GPU', liveness: true, readiness: true } }).form.draft;
    expect(d).toMatchObject({ type: 'Deployment', affinity: 'GPU', liveness: true, readiness: true });
  });

  test('manual placement must be complete', () => {
    let st = run(withImage(), { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { spread: 'manual', replicas: 2 } });
    st = reducer(st, { type: 'FORM_PLACE', nodeId: 'node-alpha', delta: -1 });
    st = reducer(st, { type: 'FORM_PLACE', nodeId: 'node-alpha', delta: -1 });
    expect(st.form.draft?.podNodes).toHaveLength(0);
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(0);
    expect(lastToast(st).title).toBe('Placement incomplete');
    st = run(st, { type: 'FORM_PLACE', nodeId: 'node-alpha', delta: 1 }, { type: 'FORM_PLACE', nodeId: 'node-alpha', delta: 1 }, { type: 'FORM_PLACE', nodeId: 'node-alpha', delta: 1 });
    expect(st.form.draft?.podNodes).toHaveLength(2); // cannot exceed replicas
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(1);
  });

  test('FORM_EDIT + SERVICE_SAVE redeploys (Pending) without Rolling Updates, keeps ready with it', () => {
    const st0 = withService();
    const s = forceRunning(st0.services[0]);
    const st = { ...st0, services: [s] };
    const re = run(st, { type: 'FORM_EDIT', id: s.id }, { type: 'FORM_SET', patch: { replicas: 3 } }, { type: 'SERVICE_SAVE' });
    expect(re.services[0]).toMatchObject({ replicas: 3, status: 'Pending', ready: [0, 3], settleIn: CONFIG.SETTLE_TICKS });
    const rolling = run(own(st, 'u-wl1', 'u-wl2'), { type: 'FORM_EDIT', id: s.id }, { type: 'FORM_SET', patch: { replicas: 3 } }, { type: 'SERVICE_SAVE' });
    expect(rolling.services[0]).toMatchObject({ replicas: 3, status: 'Running', ready: [2, 3], settleIn: 0 });
    expect(lastToast(rolling).title).toBe('Rolling update');
  });

  test('SERVICE_DELETE / SERVICE_RESTART', () => {
    const st0 = withService();
    const id = st0.services[0].id;
    const del = reducer(st0, { type: 'SERVICE_DELETE', id });
    expect(del.services).toHaveLength(0);
    const rs = reducer({ ...st0, services: [forceRunning(st0.services[0])] }, { type: 'SERVICE_RESTART', id });
    expect(rs.services[0]).toMatchObject({ status: 'Pending', ready: [0, 2], settleIn: CONFIG.RESTART_SETTLE_TICKS, restarts: 1, crashFor: 0 });
  });
});

/* ---------- nodes ---------- */
describe('PROVISION_NODE', () => {
  test('deducts the cost and names the node node-bravo', () => {
    const st = reducer(seedState(7), { type: 'PROVISION_NODE', kind: 'generic' });
    expect(st.nodes).toHaveLength(2);
    expect(st.nodes[1]).toMatchObject({ name: 'node-bravo', tier: 'Normal', kind: 'generic', slots: CONFIG.SLOTS.Normal, tags: [], downFor: 0 });
    expect(st.meters.budget).toBe(CONFIG.START_BUDGET - CONFIG.NODE_PROVISION.Normal);
    expect(st.stats.nodesProvisioned).toBe(2);
    expect(st.stats.moneySpent).toBe(CONFIG.NODE_PROVISION.Normal);
    expect(st.ui.addNode).toBe(false);
    const st2 = reducer(st, { type: 'PROVISION_NODE', kind: 'generic' });
    expect(st2.nodes[2].name).toBe('node-charlie');
  });

  test('refuses when unaffordable', () => {
    const poor = { ...seedState(7), meters: { ...seedState(7).meters, budget: CONFIG.NODE_PROVISION.Normal - 1 } };
    const st = reducer(poor, { type: 'PROVISION_NODE', kind: 'generic' });
    expect(st.nodes).toHaveLength(1);
    expect(st.meters.budget).toBe(poor.meters.budget);
    expect(lastToast(st)).toMatchObject({ kind: 'warn', title: 'Not enough budget' });
  });

  test('refuses locked tiers silently; allows them once unlocked', () => {
    const st = seedState(7);
    expect(reducer(st, { type: 'PROVISION_NODE', kind: 'generic', tier: 'Large' })).toBe(st);
    expect(reducer(st, { type: 'PROVISION_NODE', kind: 'special', hw: 'GPU' })).toBe(st);
    const large = reducer(own(st, 'u-if1'), { type: 'PROVISION_NODE', kind: 'generic', tier: 'Large' });
    expect(large.nodes[1]).toMatchObject({ tier: 'Large', slots: CONFIG.SLOTS.Large });
    expect(large.meters.budget).toBe(CONFIG.START_BUDGET - CONFIG.NODE_PROVISION.Large);
    const special = reducer(own(st, 'u-if1', 'u-if2'), { type: 'PROVISION_NODE', kind: 'special', hw: 'GPU' });
    expect(special.nodes[1]).toMatchObject({ tier: 'Special', kind: 'special', slots: CONFIG.SLOTS.Special, tags: ['GPU'], hw: 'GPU' });
  });
});

describe('DECOMMISSION_NODE', () => {
  test('refuses the last node', () => {
    const st = reducer(seedState(7), { type: 'DECOMMISSION_NODE', id: 'node-alpha' });
    expect(st.nodes).toHaveLength(1);
    expect(lastToast(st).title).toBe('Can’t decommission');
  });
  test('refuses a node with pods', () => {
    let st = reducer(withService(), { type: 'PROVISION_NODE', kind: 'generic' });
    st = reducer(st, { type: 'DECOMMISSION_NODE', id: 'node-alpha' });
    expect(st.nodes).toHaveLength(2);
    expect(lastToast(st).title).toBe('Node has pods');
  });
  test('refunds 50% of the provision cost', () => {
    let st = reducer(seedState(7), { type: 'PROVISION_NODE', kind: 'generic' });
    const before = st.meters.budget;
    st = reducer(st, { type: 'DECOMMISSION_NODE', id: st.nodes[1].id });
    expect(st.nodes.map(n => n.name)).toEqual(['node-alpha']);
    expect(st.meters.budget).toBe(before + Math.round(CONFIG.NODE_PROVISION.Normal * CONFIG.NODE_DECOMMISSION_REFUND));
    expect(reducer(st, { type: 'DECOMMISSION_NODE', id: 'node-ghost' })).toBe(st);
  });
});

describe('NODE_ADD_TAG / NODE_REMOVE_TAG', () => {
  test('caps at MAX_TAGS, de-duplicates, and only touches generic nodes', () => {
    let st = seedState(7);
    st = run(st,
      { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'x86' },
      { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'x86' },
      { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'ARM' },
      { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'GPU' },
      { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'DATA' });
    expect(st.nodes[0].tags).toEqual(['x86', 'ARM', 'GPU']);
    st = reducer(st, { type: 'NODE_REMOVE_TAG', id: 'node-alpha', tag: 'ARM' });
    expect(st.nodes[0].tags).toEqual(['x86', 'GPU']);
    // special node: tags are locked
    let sp = reducer(own(seedState(7), 'u-if1', 'u-if2'), { type: 'PROVISION_NODE', kind: 'special', hw: 'DATA' });
    const sid = sp.nodes[1].id;
    sp = run(sp, { type: 'NODE_ADD_TAG', id: sid, tag: 'GPU' }, { type: 'NODE_REMOVE_TAG', id: sid, tag: 'DATA' });
    expect(sp.nodes[1].tags).toEqual(['DATA']);
  });
});

/* ---------- tickets ---------- */
describe('TICKET_RESOLVE / TICKET_REOPEN', () => {
  const tck101 = scriptedTickets()[0].ticket;
  function withTicket(): GameState {
    const st = withService();
    return { ...st, tickets: [{ ...tck101, createdTick: st.clock.tick, dueTick: st.clock.tick + 100 }] };
  }

  test('refuses when the criteria are unmet (service still Pending)', () => {
    const st0 = withTicket();
    const st = reducer(st0, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.tickets[0].status).toBe('todo');
    expect(st.meters.budget).toBe(st0.meters.budget);
    expect(lastToast(st)).toMatchObject({ kind: 'warn', title: 'Not yet' });
    expect(reducer(st0, { type: 'TICKET_RESOLVE', id: 'nope' })).toBe(st0);
  });

  test('pays once (+ on-time XP), and re-open + resolve again pays 0', () => {
    let st = withTicket();
    st = { ...st, services: st.services.map(forceRunning) };
    const budget0 = st.meters.budget, xp0 = st.meters.xp;
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.tickets[0]).toMatchObject({ status: 'done', paid: true, resolvedTick: st.clock.tick, regressed: false });
    expect(st.meters.budget).toBe(budget0 + tck101.reward);
    expect(st.meters.xp).toBe(xp0 + tck101.xp + CONFIG.ON_TIME_XP);
    expect(st.stats.ticketsResolved).toBe(1);
    expect(st.stats.moneyEarned).toBe(tck101.reward);
    // resolving a done ticket is a no-op
    expect(reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' })).toBe(st);
    // anti-exploit
    st = reducer(st, { type: 'TICKET_REOPEN', id: 'TCK-101' });
    expect(st.tickets[0].status).toBe('todo');
    const budget1 = st.meters.budget, xp1 = st.meters.xp;
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.tickets[0].status).toBe('done');
    expect(st.meters.budget).toBe(budget1);
    expect(st.meters.xp).toBe(xp1);
    expect(st.stats.ticketsResolved).toBe(1);
    expect(lastToast(st).msg).toContain('already paid');
  });

  test('late resolution pays the decayed reward and no on-time XP', () => {
    let st = withTicket();
    st = { ...st, services: st.services.map(forceRunning), clock: { ...st.clock, tick: 1000 } };
    st = { ...st, tickets: [{ ...st.tickets[0], dueTick: 1000 - CONFIG.TICKS_PER_DAY }] };
    const budget0 = st.meters.budget;
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.meters.budget).toBe(budget0 + Math.round(tck101.reward * (1 - CONFIG.DEADLINE_DECAY_PER_DAY)));
    expect(st.meters.xp).toBe(tck101.xp);
    expect(lastToast(st).msg).toContain('late');
  });

  test('bug tickets count as incidents and never get on-time XP', () => {
    let st = withTicket();
    st = { ...st, services: st.services.map(forceRunning), tickets: [{ ...st.tickets[0], type: 'bug' }] };
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.stats.incidentsResolved).toBe(1);
    expect(st.stats.ticketsResolved).toBe(0);
    expect(st.meters.xp).toBe(tck101.xp);
  });
});

/* ---------- upgrades ---------- */
describe('BUY_UPGRADE', () => {
  test('checks requires, budget and xp', () => {
    const st = seedState(7);
    // u-ci2 requires u-ci1
    expect(reducer(st, { type: 'BUY_UPGRADE', id: 'u-ci2' })).toBe(st);
    // budget
    const poor = { ...st, meters: { ...st.meters, budget: 699 } };
    expect(reducer(poor, { type: 'BUY_UPGRADE', id: 'u-ci1' })).toBe(poor);
    // xp: u-if1 needs 40 xp
    expect(reducer(st, { type: 'BUY_UPGRADE', id: 'u-if1' })).toBe(st);
    const xp = { ...st, meters: { ...st.meters, xp: 40 } };
    const bought = reducer(xp, { type: 'BUY_UPGRADE', id: 'u-if1' });
    expect(bought.upgrades.find(u => u.id === 'u-if1')?.owned).toBe(true);
    expect(bought.meters.budget).toBe(CONFIG.START_BUDGET - 900);
    expect(bought.meters.xp).toBe(0);
    expect(bought.stats.moneySpent).toBe(900);
    // already owned → no-op
    expect(reducer(bought, { type: 'BUY_UPGRADE', id: 'u-if1' })).toBe(bought);
    expect(reducer(st, { type: 'BUY_UPGRADE', id: 'nope' })).toBe(st);
  });

  test('the final upgrade sets outcome won and pauses', () => {
    let st = own(seedState(7), 'u-wl1', 'u-ob1', 'u-ob2', 'u-if1', 'u-if2', 'u-if4', 'u-sc1');
    st = { ...st, meters: { ...st.meters, budget: 10000, xp: 1000 }, clock: { ...st.clock, paused: false, tick: 500 } };
    st = reducer(st, { type: 'BUY_UPGRADE', id: 'u-sc2' });
    expect(st.upgrades.find(u => u.id === 'u-sc2')?.owned).toBe(true);
    expect(st.outcome).toMatchObject({ kind: 'won', atTick: 500 });
    expect(st.clock.paused).toBe(true);
    // SPEED is refused after the outcome unless endless
    expect(reducer(st, { type: 'SPEED', speed: 4 })).toBe(st);
    const endless = reducer(st, { type: 'CONTINUE_ENDLESS' });
    expect(endless.endless).toBe(true);
    expect(reducer(endless, { type: 'SPEED', speed: 4 }).clock).toMatchObject({ speed: 4, paused: false });
  });
});

/* ---------- bailout ---------- */
describe('BAILOUT', () => {
  test('only when the budget is negative, once per day', () => {
    const st = seedState(7);
    expect(reducer(st, { type: 'BAILOUT' })).toBe(st);
    let broke = { ...st, meters: { ...st.meters, budget: -300, xp: 50 }, clock: { ...st.clock, tick: 10 } };
    broke = reducer(broke, { type: 'BAILOUT' });
    expect(broke.meters.budget).toBe(-300 + CONFIG.BAILOUT_AMOUNT);
    expect(broke.meters.xp).toBe(50 - CONFIG.BAILOUT_XP);
    expect(broke.stats.bailouts).toBe(1);
    expect(broke.lastBailoutDay).toBe(1);
    // same day again → refused
    const again = reducer({ ...broke, meters: { ...broke.meters, budget: -50 } }, { type: 'BAILOUT' });
    expect(again.meters.budget).toBe(-50);
    expect(lastToast(again).title).toBe('Finance said no');
    // next day → allowed; xp cost never goes below 0
    const next = reducer({ ...broke, meters: { ...broke.meters, budget: -50, xp: 5 }, clock: { ...broke.clock, tick: CONFIG.TICKS_PER_DAY + 1 } }, { type: 'BAILOUT' });
    expect(next.meters.budget).toBe(-50 + CONFIG.BAILOUT_AMOUNT);
    expect(next.meters.xp).toBe(0);
    expect(next.stats.bailouts).toBe(2);
  });
});

/* ---------- misc ---------- */
describe('LOAD_STATE / NEW_GAME / misc', () => {
  test('LOAD_STATE pauses and clears transient UI', () => {
    let src = withService();
    src = { ...src, clock: { ...src.clock, paused: false, tick: 77 }, toasts: src.toasts, form: { open: true, editingId: null, draft: null } };
    const st = reducer(seedState(1), { type: 'LOAD_STATE', state: src });
    expect(st.clock).toMatchObject({ paused: true, tick: 77 });
    expect(st.toasts).toEqual([]);
    expect(st.form).toEqual({ open: false, editingId: null, draft: null });
    expect(st.services).toBe(src.services);
  });

  test('NEW_GAME seeds deterministically', () => {
    const a = reducer(seedState(1), { type: 'NEW_GAME', seed: 42 });
    const b = seedState(42);
    expect(a).toEqual(b);
    expect(a.rng).toBe(42);
  });

  test('navigation, settings and toasts', () => {
    let st = seedState(7);
    st = run(st, { type: 'NAV', screen: 'tree' }, { type: 'INFRA_TAB', tab: 'ci' }, { type: 'BOARD_VIEW', view: 'table' }, { type: 'TOGGLE_ADDNODE' });
    expect(st.ui).toEqual({ screen: 'tree', infraTab: 'ci', boardView: 'table', addNode: true, openTicket: null });
    st = run(st, { type: 'SET_DRAMA', drama: 5 }, { type: 'SET_PAUSE_ON_TICKET', on: false });
    expect(st.settings).toEqual({ drama: 1, pauseOnTicket: false });
    st = reducer(st, { type: 'TOAST', kind: 'info', title: 'hi', msg: 'there' });
    expect(st.toasts).toHaveLength(1);
    expect(st.log).toHaveLength(1);
    st = reducer(st, { type: 'DISMISS_TOAST', id: st.toasts[0].id });
    expect(st.toasts).toHaveLength(0);
    st = reducer(st, { type: 'PAUSE', paused: false });
    expect(st.clock.paused).toBe(false);
    st = { ...st, firstBeat: { id: 'x', title: 'y' } };
    expect(reducer(st, { type: 'CLEAR_BEAT' }).firstBeat).toBeNull();
  });
});

/* ---------- review regressions ---------- */
describe('review fixes', () => {
  test('a rolling edit while Pending keeps settling and reaches Running', () => {
    let st = own(withService(withImage(), 2), 'u-wl1', 'u-wl2');
    const id = st.services[0].id;
    st = run(st, { type: 'FORM_EDIT', id }, { type: 'FORM_SET', patch: { replicas: 3 } }, { type: 'SERVICE_SAVE' });
    expect(st.services[0].status).toBe('Pending');
    for (let i = 0; i < CONFIG.SETTLE_TICKS + 1; i++) st = reducer(st, { type: 'TICK' });
    expect(st.services[0].status).toBe('Running');
    expect(st.services[0].ready[0]).toBe(3);
  });
  test('editing a service cannot switch it to another repo’s image', () => {
    let st = withService(withImage(withImage(), 'repo-2'), 2);
    const svc = st.services[0];
    const other = st.images.find(i => i.repoId !== st.images.find(x => x.id === svc.imageId)!.repoId)!;
    st = run(st, { type: 'FORM_EDIT', id: svc.id }, { type: 'FORM_SET', patch: { imageId: other.id } });
    expect(st.form.draft!.imageId).toBe(svc.imageId);
    expect(st.form.draft!.name).toBe(svc.name);
  });
  test('manual placement can never overfill a node', () => {
    let st = run(withImage(), { type: 'PROVISION_NODE', kind: 'generic', tier: 'Normal' });
    st = run(st, { type: 'FORM_NEW' }, { type: 'FORM_SET', patch: { spread: 'manual' } }, { type: 'FORM_SET', patch: { replicas: 0 } }, { type: 'FORM_SET', patch: { replicas: 8 } });
    const counts: Record<string, number> = {};
    for (const n of st.form.draft!.podNodes) counts[n] = (counts[n] ?? 0) + 1;
    for (const n of st.nodes) expect(counts[n.id] ?? 0).toBeLessThanOrEqual(n.slots);
    // a hand-crafted overfilled draft is refused on save
    st = { ...st, form: { ...st.form, draft: { ...st.form.draft!, podNodes: Array(8).fill(st.nodes[0].id) } } };
    st = reducer(st, { type: 'SERVICE_SAVE' });
    expect(st.services).toHaveLength(0);
    expect(lastToast(st).title).toBe('Node over capacity');
  });
  test('a resolved ticket remembers what it actually paid', () => {
    let st = withService(withImage(), 2);
    st = { ...st, services: st.services.map(forceRunning) };
    const tck = { ...scriptedTickets()[0].ticket, dueTick: 0 };
    st = { ...st, clock: { ...st.clock, tick: CONFIG.TICKS_PER_DAY }, tickets: [tck] };
    st = reducer(st, { type: 'TICKET_RESOLVE', id: tck.id });
    expect(st.tickets[0].paidAmount).toBe(Math.round(tck.reward * (1 - CONFIG.DEADLINE_DECAY_PER_DAY)));
  });
});
