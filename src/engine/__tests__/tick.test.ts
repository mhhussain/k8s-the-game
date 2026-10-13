import { describe, expect, test } from 'vitest';
import { CONFIG } from '../config';
import { scriptedTickets } from '../content';
import { dayOf } from '../helpers';
import { podsOnNode, totalFree } from '../placement';
import { mkService, reducer, seedState } from '../reducer';
import { tick } from '../tick';
import type { ClusterNode, GameState, Image, Service } from '../types';

const SEED = 20240613;

/* ---------- fixtures ---------- */
function node(name: string, o: Partial<ClusterNode> = {}): ClusterNode {
  return { id: `node-${name}`, name: `node-${name}`, kind: 'generic', tier: 'Normal', slots: 4, tags: [], downFor: 0, provisionedTick: 0, ...o };
}
function img(id: string, repoId: string, version = 1): Image {
  return { id, repoId, version, tag: `${repoId}:${version}.0.0`, digest: 'sha256:0', builtTick: 0, building: false, progress: 100, fast: false };
}
/** a Running, fully-ready service */
function running(name: string, replicas: number, podNodes: string[], o: Partial<Service> = {}): Service {
  const s = mkService({ id: `svc-${name}`, name, imageId: 'img-1', type: 'Pod', replicas, podNodes, createdTick: 0, status: 'Running', ready: [replicas, replicas] }, 40);
  return { ...s, ...o };
}
function pendingSvc(name: string, replicas: number, podNodes: string[], o: Partial<Service> = {}): Service {
  const s = mkService({ id: `svc-${name}`, name, imageId: 'img-1', type: 'Pod', replicas, podNodes, createdTick: 0, status: 'Pending' }, 40);
  return { ...s, ...o };
}
/** deterministic base: fixed seed, no scripted queue (tests opt back in), one built image for repo-1 */
function base(o: Partial<GameState> = {}): GameState {
  return { ...seedState(SEED), pending: [], nextProcTick: 99999, images: [img('img-1', 'repo-1')], ...o };
}
function ticks(st: GameState, n: number): GameState { for (let i = 0; i < n; i++) st = tick(st); return st; }
function own(st: GameState, ...ids: string[]): GameState {
  return { ...st, upgrades: st.upgrades.map(u => ids.includes(u.id) ? { ...u, owned: true } : u) };
}
const strip = (st: GameState) => ({ ...st, toasts: [] }); // toast ids carry Math.random()

/* ---------- clock ---------- */
describe('clock', () => {
  test('advances 30 minutes per tick and the day rolls at 48 ticks', () => {
    let st = base();
    st = tick(st);
    expect(st.clock.tick).toBe(1);
    expect(st.clock.mins).toBe(CONFIG.START_MINS + 30);
    expect(dayOf(st.clock.tick)).toBe(1);
    st = ticks(st, CONFIG.TICKS_PER_DAY - 2);
    expect(st.clock.tick).toBe(47);
    expect(dayOf(47)).toBe(1);
    st = tick(st);
    expect(st.clock.tick).toBe(48);
    expect(dayOf(48)).toBe(2);
    expect(st.clock.mins).toBe(CONFIG.START_MINS); // full lap
  });

  test('is deterministic for a fixed seed', () => {
    const a = strip(ticks(base({ pending: scriptedTickets() }), 60));
    const b = strip(ticks(base({ pending: scriptedTickets() }), 60));
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(SEED);
  });

  test('no-op once the outcome is set, unless endless', () => {
    const lost = { ...base(), outcome: { kind: 'lost' as const, atTick: 5, reason: 'x' } };
    expect(tick(lost)).toBe(lost);
    const endless = { ...lost, endless: true };
    expect(tick(endless).clock.tick).toBe(1);
  });
});

/* ---------- tickets ---------- */
describe('ticket arrival', () => {
  test('TCK-101 lands at tick 3 with firstBeat set and the clock paused', () => {
    let st = { ...base({ pending: scriptedTickets() }), clock: { ...base().clock, paused: false } };
    st = ticks(st, 2);
    expect(st.tickets).toHaveLength(0);
    expect(st.firstBeat).toBeNull();
    expect(st.clock.paused).toBe(false);
    st = tick(st);
    expect(st.clock.tick).toBe(3);
    expect(st.tickets.map(t => t.id)).toEqual(['TCK-101']);
    expect(st.tickets[0]).toMatchObject({ createdTick: 3, dueTick: 3 + CONFIG.TICKS_PER_DAY * CONFIG.TICKET_DUE_DAYS.med, status: 'todo' });
    expect(st.firstBeat).toEqual({ id: 'TCK-101', title: 'Get web-storefront live' });
    expect(st.clock.paused).toBe(true);
    expect(st.pending).toHaveLength(3);
  });

  test('later scripted tickets land on schedule and pause only when pauseOnTicket', () => {
    let st = { ...base({ pending: scriptedTickets() }), clock: { ...base().clock, paused: false } };
    st = { ...st, settings: { ...st.settings, pauseOnTicket: false } };
    st = ticks(st, 26);
    st = { ...st, clock: { ...st.clock, paused: false } };
    expect(st.tickets.map(t => t.id)).toEqual(['TCK-101', 'TCK-102']);
    expect(st.clock.paused).toBe(false); // TCK-102 is not the first beat
    expect(st.log.some(l => l.title === 'New ticket' && l.msg.includes('TCK-102'))).toBe(true);
  });

  test('procedural tickets appear once the scripted queue is empty and nextProcTick passes', () => {
    let st = base({ pending: [], nextProcTick: 1 });
    st = tick(st);
    expect(st.tickets).toHaveLength(1);
    expect(st.tickets[0]).toMatchObject({ id: 'TCK-105', type: 'new', status: 'todo', createdTick: 1 });
    expect(st.tickets[0].dueTick).toBeGreaterThan(1);
    expect(st.seq.ticket).toBe(106);
    expect(st.nextProcTick).toBeGreaterThanOrEqual(1 + CONFIG.PROC_GAP[0]);
    expect(st.nextProcTick).toBeLessThanOrEqual(1 + CONFIG.PROC_GAP[1]);
    // nothing new before nextProcTick
    const again = tick(st);
    expect(again.tickets).toHaveLength(1);
  });

  test('procedural tickets respect PROC_MAX_OPEN and wait for the scripted queue', () => {
    const open = scriptedTickets().slice(0, 3).map(p => ({ ...p.ticket, status: 'todo' as const }));
    let st = base({ pending: [], nextProcTick: 1, tickets: open });
    st = tick(st);
    expect(st.tickets).toHaveLength(3);
    expect(st.nextProcTick).toBeGreaterThan(1); // the slot is still consumed
    const queued = tick(base({ pending: scriptedTickets().slice(3), nextProcTick: 1 }));
    expect(queued.tickets).toHaveLength(0);
  });
});

/* ---------- service lifecycle ---------- */
describe('service lifecycle', () => {
  test('a Pending service settles to Running after SETTLE_TICKS', () => {
    let st = base({ services: [pendingSvc('web', 2, ['node-alpha', 'node-alpha'])] });
    st = ticks(st, CONFIG.SETTLE_TICKS - 1);
    expect(st.services[0].status).toBe('Pending');
    st = tick(st);
    expect(st.services[0]).toMatchObject({ status: 'Running', ready: [2, 2], settleIn: 0, health: 100 });
    // and keeps running: ages, drifts demand
    st = ticks(st, 3);
    expect(st.services[0].status).toBe('Running');
    expect(st.services[0].age).toBe(3);
  });

  test('misplaced pods → CrashLoopBackOff (all) or Degraded (some)', () => {
    const nodes = [node('alpha'), node('bravo', { tags: ['GPU'] })];
    let all = base({ nodes, services: [pendingSvc('ml', 2, ['node-alpha', 'node-alpha'], { affinity: 'GPU' })] });
    all = ticks(all, CONFIG.SETTLE_TICKS);
    expect(all.services[0]).toMatchObject({ status: 'CrashLoopBackOff', ready: [0, 2] });
    all = tick(all);
    expect(all.services[0].status).toBe('CrashLoopBackOff'); // stays stuck

    let some = base({ nodes, services: [pendingSvc('ml', 2, ['node-alpha', 'node-bravo'], { affinity: 'GPU' })] });
    some = ticks(some, CONFIG.SETTLE_TICKS);
    expect(some.services[0]).toMatchObject({ status: 'Degraded', ready: [1, 2] });
    some = tick(some);
    expect(some.services[0]).toMatchObject({ status: 'Degraded', ready: [1, 2] });
  });

  test('0 replicas is Idle', () => {
    const st = tick(base({ services: [running('web', 0, [])] }));
    expect(st.services[0]).toMatchObject({ status: 'Idle', ready: [0, 0] });
  });
});

/* ---------- economy & meters ---------- */
describe('economy and meters', () => {
  test('upkeep decreases the budget each tick', () => {
    const st = tick(base());
    expect(st.meters.budget).toBeCloseTo(CONFIG.START_BUDGET - CONFIG.NODE_COST.Normal / CONFIG.TICKS_PER_DAY, 6);
    expect(st.stats.revenueEarned).toBe(0);
  });

  test('a Running service with demand earns revenue', () => {
    const st0 = base({ services: [running('web', 2, ['node-alpha', 'node-alpha'], { demand: 100 })] });
    const st = tick(st0);
    const upkeepTick = (CONFIG.NODE_COST.Normal + 2 * CONFIG.POD_COST) / CONFIG.TICKS_PER_DAY;
    expect(st.stats.revenueEarned).toBeGreaterThan(0);
    expect(st.meters.budget).toBeCloseTo(CONFIG.START_BUDGET - upkeepTick + st.stats.revenueEarned, 6);
    // a crashed service earns nothing
    const crashed = tick({ ...st0, services: [{ ...st0.services[0], status: 'CrashLoopBackOff', ready: [0, 2], crashFor: -1 }] });
    expect(crashed.stats.revenueEarned).toBe(0);
    expect(crashed.meters.budget).toBeCloseTo(CONFIG.START_BUDGET - upkeepTick, 6);
  });

  test('SLA drops with a bad service and recovers when healthy', () => {
    const bad = tick(base({ services: [running('web', 1, ['node-alpha'], { status: 'CrashLoopBackOff', ready: [0, 1], crashFor: -1 })] }));
    expect(bad.meters.sla).toBeLessThan(100);
    expect(bad.meters.sla).toBeGreaterThanOrEqual(100 - CONFIG.SLA_BAD[1]);
    expect(bad.stats.worstSla).toBe(bad.meters.sla);
    expect(bad.flash.bad).toBe(1);
    const warn = tick(base({ images: [img('img-1', 'repo-1'), img('img-2', 'repo-1', 2)], services: [running('web', 1, ['node-alpha'], { status: 'Stale' })] }));
    expect(warn.meters.sla).toBeLessThan(100);
    expect(warn.meters.sla).toBeGreaterThanOrEqual(100 - CONFIG.SLA_WARN[1]);
    const low = { ...base(), meters: { ...base().meters, sla: 90 } };
    expect(tick(low).meters.sla).toBeCloseTo(90 + CONFIG.SLA_RECOVER, 6);
    expect(tick(base()).meters.sla).toBe(100); // clamped
  });

  test('end-of-day XP for healthy services', () => {
    let st = base({ services: [running('web', 2, ['node-alpha', 'node-alpha'])] });
    st = { ...st, clock: { ...st.clock, tick: CONFIG.TICKS_PER_DAY - 1 } };
    st = tick(st);
    expect(st.meters.xp).toBe(CONFIG.DAILY_XP_PER_HEALTHY);
    expect(st.log.some(l => l.title.startsWith('Day 1 wrapped'))).toBe(true);
  });

  test('outcome lost after DEBT_GRACE_TICKS below DEBT_FLOOR', () => {
    let st = base();
    st = { ...st, meters: { ...st.meters, budget: CONFIG.DEBT_FLOOR - 3000 } };
    st = tick(st);
    expect(st.budgetDebtTicks).toBe(1);
    expect(st.log.some(l => l.title === 'Finance is watching')).toBe(true);
    st = ticks(st, CONFIG.DEBT_GRACE_TICKS - 2);
    expect(st.outcome).toBeNull();
    st = tick(st);
    expect(st.outcome).toMatchObject({ kind: 'lost', atTick: CONFIG.DEBT_GRACE_TICKS });
    expect(st.clock.paused).toBe(true);
    // climbing back above the floor resets the counter
    let saved = base();
    saved = { ...saved, meters: { ...saved.meters, budget: CONFIG.DEBT_FLOOR - 1 }, budgetDebtTicks: 50 };
    saved = tick({ ...saved, meters: { ...saved.meters, budget: 0 } });
    expect(saved.budgetDebtTicks).toBe(0);
  });

  test('"Budget negative" fires once on crossing zero', () => {
    let st = base();
    st = { ...st, meters: { ...st.meters, budget: 1 } };
    st = tick(st);
    expect(st.meters.budget).toBeLessThan(0);
    expect(st.log.filter(l => l.title === 'Budget negative')).toHaveLength(1);
    st = tick(st);
    expect(st.log.filter(l => l.title === 'Budget negative')).toHaveLength(1);
  });
});

/* ---------- incidents & regressions ---------- */
describe('incidents', () => {
  test('a bare Pod stuck in CrashLoopBackOff raises a BUG ticket within ~40 ticks', () => {
    let st = base({ services: [running('web', 1, ['node-alpha'], { status: 'CrashLoopBackOff', ready: [0, 1], crashFor: -1 })] });
    let landedAt = -1;
    for (let i = 1; i <= 40; i++) {
      st = tick(st);
      if (st.tickets.some(t => t.type === 'bug')) { landedAt = i; break; }
    }
    expect(landedAt).toBeGreaterThan(0);
    const bug = st.tickets.find(t => t.type === 'bug');
    expect(bug).toMatchObject({ id: 'BUG-1', svc: 'web', status: 'todo', createdTick: landedAt, title: 'web pod died and stayed dead' });
    expect(bug?.criteria.map(c => c.kind)).toEqual(['stable']);
    expect(st.stats.incidentsRaised).toBe(1);
    expect(st.seq.bug).toBe(2);
    // never a second open incident for the same service
    st = ticks(st, 40);
    expect(st.tickets.filter(t => t.type === 'bug' && t.svc === 'web')).toHaveLength(1);
  });

  test('a misplaced service raises the "won’t go live" incident', () => {
    let st = base({ nodes: [node('alpha')], services: [running('ml', 1, ['node-alpha'], { affinity: 'GPU', status: 'CrashLoopBackOff', ready: [0, 1] })] });
    for (let i = 0; i < 60 && !st.tickets.length; i++) st = tick(st);
    expect(st.tickets[0]?.title).toBe('ml has pods that won’t go live');
  });
});

describe('regressions', () => {
  test('a resolved ticket that stops being true raises a "Regression:" bug after REGRESSION_GRACE', () => {
    const tck = scriptedTickets()[0].ticket;
    let st = base({ services: [running('web-storefront', 2, ['node-alpha', 'node-alpha'])], tickets: [{ ...tck, dueTick: 200 }] });
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
    expect(st.tickets[0]).toMatchObject({ status: 'done', resolvedTick: 0 });
    // break it: scale to 0
    st = { ...st, services: st.services.map(s => ({ ...s, replicas: 0, podNodes: [] })) };
    st = ticks(st, CONFIG.REGRESSION_GRACE - 1);
    expect(st.tickets).toHaveLength(1);
    st = tick(st);
    expect(st.tickets).toHaveLength(2);
    const reg = st.tickets[1];
    expect(reg).toMatchObject({ id: 'BUG-1', type: 'bug', prio: 'high', svc: 'web-storefront', reward: CONFIG.REGRESSION_REWARD, xp: CONFIG.REGRESSION_XP, status: 'todo' });
    expect(reg.title).toBe('Regression: Get web-storefront live');
    expect(reg.criteria).toEqual(tck.criteria);
    expect(st.tickets[0].regressed).toBe(true);
    expect(st.clock.paused).toBe(true);
    // only one regression while the incident is open
    st = ticks(st, 10);
    expect(st.tickets).toHaveLength(2);
    // fix it + resolve the regression → flag clears, a later break raises a fresh one
    st = { ...st, services: st.services.map(s => ({ ...s, replicas: 2, podNodes: ['node-alpha', 'node-alpha'], status: 'Running', ready: [2, 2] as [number, number], settleIn: 0, errorRate: 0.01 })) };
    st = reducer(st, { type: 'TICKET_RESOLVE', id: 'BUG-1' });
    expect(st.tickets[1].status).toBe('done');
    st = tick(st);
    expect(st.tickets[0].regressed).toBe(false);
  });
});

/* ---------- node outage ---------- */
describe('node outage', () => {
  const twoNodes = () => [node('alpha'), node('bravo', { downFor: 5 })];

  test('a Deployment spread on two nodes is re-homed and stays Running', () => {
    const dep = running('api', 2, ['node-alpha', 'node-bravo'], { type: 'Deployment' });
    let st = base({ nodes: twoNodes(), services: [dep] });
    st = tick(st);
    expect(st.nodes[1].downFor).toBe(4);
    expect(st.services[0].podNodes).toEqual(['node-alpha', 'node-alpha']);
    expect(st.services[0].status).toBe('Running');
    expect(st.services[0].ready[0]).toBeGreaterThan(0);
    expect(st.log.some(l => l.title === 'Pods re-homed')).toBe(true);
    // the node comes back after its downFor runs out; the outage counts as survived
    st = ticks(st, 4);
    expect(st.nodes[1].downFor).toBe(0);
    expect(st.log.some(l => l.title === 'Node recovered')).toBe(true);
    expect(st.stats.outagesSurvived).toBe(1);
    expect(st.stats.outagesFelt).toBe(0);
  });

  test('without free slots the Deployment stays Degraded with ready > 0', () => {
    const filler = running('filler', 3, ['node-alpha', 'node-alpha', 'node-alpha']);
    const dep = running('api', 2, ['node-alpha', 'node-bravo'], { type: 'Deployment' });
    let st = base({ nodes: twoNodes(), services: [filler, dep] });
    st = tick(st);
    const api = st.services[1];
    expect(api.podNodes).toEqual(['node-alpha', 'node-bravo']);
    expect(api.status).toBe('Degraded');
    expect(api.ready).toEqual([1, 2]);
    expect(podsOnNode(st, 'node-alpha')).toBe(4);
  });

  test('a bare Pod on the down node drops to 0 ready', () => {
    const pod = running('cron', 1, ['node-bravo']);
    let st = base({ nodes: twoNodes(), services: [pod] });
    st = tick(st);
    expect(st.services[0].podNodes).toEqual(['node-bravo']);
    expect(st.services[0]).toMatchObject({ status: 'CrashLoopBackOff', ready: [0, 1] });
    st = ticks(st, 4);
    expect(st.stats.outagesFelt).toBe(1);
    expect(st.stats.outagesSurvived).toBe(0);
    // back online → the pod recovers
    st = tick(st);
    expect(st.services[0].ready[0]).toBeGreaterThan(0);
  });
});

/* ---------- autoscaler ---------- */
describe('autoscaler', () => {
  const hot = (type: Service['type'], replicas: number, podNodes: string[]) =>
    running('api', replicas, podNodes, { type, demand: 300 });

  test('adds a replica for an overloaded Deployment when slots and budget allow', () => {
    let st = own(base({ nodes: [node('alpha'), node('bravo')], services: [hot('Deployment', 2, ['node-alpha', 'node-bravo'])] }), 'u-wl1', 'u-ob1', 'u-sc1');
    st = tick(st);
    expect(st.services[0].replicas).toBe(3);
    expect(st.services[0].podNodes).toHaveLength(3);
    expect(st.services[0].ready[1]).toBe(3);
    expect(st.log.some(l => l.title === 'Autoscaled up')).toBe(true);
  });

  test('never scales a bare Pod, and not without the upgrade', () => {
    const withoutUpgrade = tick(base({ nodes: [node('alpha'), node('bravo')], services: [hot('Deployment', 2, ['node-alpha', 'node-bravo'])] }));
    expect(withoutUpgrade.services[0].replicas).toBe(2);
    const pod = tick(own(base({ nodes: [node('alpha'), node('bravo')], services: [hot('Pod', 2, ['node-alpha', 'node-bravo'])] }), 'u-wl1', 'u-ob1', 'u-sc1'));
    expect(pod.services[0].replicas).toBe(2);
  });

  test('is blocked when the cluster is full or the budget is negative', () => {
    const full = own(base({ nodes: [node('alpha')], services: [hot('Deployment', 4, ['node-alpha', 'node-alpha', 'node-alpha', 'node-alpha'])] }), 'u-wl1', 'u-ob1', 'u-sc1');
    const f = tick(full);
    expect(f.services[0].replicas).toBe(4);
    expect(f.log.some(l => l.title === 'Autoscaler blocked' && l.msg.includes('slots'))).toBe(true);
    const broke = { ...own(base({ nodes: [node('alpha'), node('bravo')], services: [hot('Deployment', 2, ['node-alpha', 'node-bravo'])] }), 'u-wl1', 'u-ob1', 'u-sc1') };
    const b = tick({ ...broke, meters: { ...broke.meters, budget: -1 } });
    expect(b.services[0].replicas).toBe(2);
    expect(b.log.some(l => l.title === 'Autoscaler blocked' && l.msg.includes('budget'))).toBe(true);
  });

  test('never exceeds totalFree over many ticks', () => {
    let st = own(base({ nodes: [node('alpha'), node('bravo')], services: [hot('Deployment', 2, ['node-alpha', 'node-bravo'])] }), 'u-wl1', 'u-ob1', 'u-sc1');
    st = { ...st, services: [{ ...st.services[0], demand: CONFIG.DEMAND_MAX }] };
    for (let i = 0; i < 30; i++) {
      st = tick(st);
      expect(totalFree(st)).toBeGreaterThanOrEqual(0);
      for (const n of st.nodes) expect(podsOnNode(st, n.id)).toBeLessThanOrEqual(n.slots);
      expect(st.services[0].replicas).toBeLessThanOrEqual(CONFIG.AUTOSCALE_MAX);
    }
    expect(st.services[0].replicas).toBe(8); // 2 nodes × 4 slots
    expect(totalFree(st)).toBe(0);
  });

  test('scales down after sustained low load, never below AUTOSCALE_MIN', () => {
    let st = own(base({ nodes: [node('alpha'), node('bravo')], services: [running('api', 3, ['node-alpha', 'node-bravo', 'node-alpha'], { type: 'Deployment', demand: 10 })] }), 'u-wl1', 'u-ob1', 'u-sc1');
    st = ticks(st, CONFIG.AUTOSCALE_DOWN_TICKS);
    expect(st.services[0].replicas).toBe(2);
    st = ticks(st, CONFIG.AUTOSCALE_DOWN_TICKS * 2);
    expect(st.services[0].replicas).toBe(CONFIG.AUTOSCALE_MIN);
  });
});

/* ---------- automation upgrades ---------- */
describe('automation', () => {
  test('CI auto-builds a live repo every CI_EVERY ticks', () => {
    let st = own(base({ services: [running('web-storefront', 1, ['node-alpha'])] }), 'u-ci1');
    st = { ...st, clock: { ...st.clock, tick: CONFIG.CI_EVERY - 1 } };
    st = tick(st);
    expect(st.images).toHaveLength(2);
    expect(st.images[1]).toMatchObject({ repoId: 'repo-1', version: 2, building: true });
    // no live service for other repos → nothing else queued
    expect(st.images.filter(i => i.repoId !== 'repo-1')).toHaveLength(0);
  });

  test('Rolling Updates refresh a Running service to the latest image', () => {
    const images = [img('img-1', 'repo-1', 1), img('img-2', 'repo-1', 2)];
    const st = tick(own(base({ images, services: [running('web-storefront', 1, ['node-alpha'])] }), 'u-wl1', 'u-wl2'));
    expect(st.services[0].imageId).toBe('img-2');
    expect(st.log.some(l => l.title === 'Rolling update')).toBe(true);
  });

  test('Auto-Remediation heals a bare Pod crash loop', () => {
    let st = own(base({ services: [running('web', 1, ['node-alpha'], { status: 'CrashLoopBackOff', ready: [0, 1], crashFor: -1 })] }), 'u-ob1', 'u-ob2');
    for (let i = 0; i < 20 && st.services[0].status === 'CrashLoopBackOff'; i++) st = tick(st);
    expect(st.services[0].status).toBe('Running');
    expect(st.log.some(l => l.title === 'Self-healed')).toBe(true);
  });

  test('a Deployment recreates its crashed pod on its own', () => {
    let st = base({ services: [running('api', 2, ['node-alpha', 'node-alpha'], { type: 'Deployment', status: 'CrashLoopBackOff', ready: [1, 2], crashFor: CONFIG.DEPLOYMENT_CRASH_RECOVERY })] });
    st = ticks(st, CONFIG.DEPLOYMENT_CRASH_RECOVERY + 1);
    expect(st.services[0]).toMatchObject({ status: 'Running', ready: [2, 2], crashFor: 0 });
    expect(st.log.some(l => l.title === 'Pod recreated')).toBe(true);
  });
});

/* ---------- review regressions ---------- */
describe('review fixes', () => {
  test('procedural tickets never duplicate an open request for the same service', () => {
    let st = base({ services: [running('web-storefront', 2, ['node-alpha', 'node-alpha'])], nextProcTick: 1 });
    st = { ...st, settings: { ...st.settings, pauseOnTicket: false } };
    for (let i = 0; i < 400; i++) { st = tick(st); st = { ...st, nextProcTick: Math.min(st.nextProcTick, st.clock.tick + 1) }; }
    const open = st.tickets.filter(t => t.status === 'todo' && t.type !== 'bug');
    expect(new Set(open.map(t => t.svc)).size).toBe(open.length);
  });
  test('a regression pays nothing (no farm loop)', () => {
    expect(CONFIG.REGRESSION_REWARD).toBe(0);
    expect(CONFIG.REGRESSION_XP).toBe(0);
  });
  test('rolling updates refresh a service that is already Stale', () => {
    let st = own(base({ images: [img('img-1', 'repo-1'), img('img-2', 'repo-1', 2)], services: [running('web', 2, ['node-alpha', 'node-alpha'], { status: 'Stale' })] }), 'u-wl1', 'u-wl2');
    st = tick(st);
    expect(st.services[0].imageId).toBe('img-2');
    expect(st.services[0].status).not.toBe('Stale');
  });
  test('rebalance/re-home never overcommits a node in one pass', () => {
    const nodes = [node('alpha', { downFor: 5 }), node('bravo'), node('charlie')];
    const filler = running('fill', 7, ['node-bravo', 'node-bravo', 'node-bravo', 'node-charlie', 'node-charlie', 'node-charlie', 'node-charlie']);
    const a = running('a', 1, ['node-alpha'], { id: 'svc-a', type: 'Deployment' });
    const b = running('b', 1, ['node-alpha'], { id: 'svc-b', type: 'Deployment' });
    const st = tick(base({ nodes, services: [filler, a, b] }));
    const onBravo = st.services.flatMap(s => s.podNodes.slice(0, s.replicas)).filter(n => n === 'node-bravo').length;
    expect(onBravo).toBeLessThanOrEqual(4);
  });
});
