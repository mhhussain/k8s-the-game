/* ============================================================
   Balance simulation: a "reasonable player" policy drives the pure
   engine for many in-game days. Guards against death spirals, dead
   air and a tech tree that can't be finished.
   ============================================================ */
import { describe, expect, test } from 'vitest';
import { CONFIG } from '../config';
import { gradeTicket } from '../grader';
import { hasUpgrade, isLatest, latestImages, upgradeAffordable } from '../helpers';
import { totalFree } from '../placement';
import { reducer, seedState } from '../reducer';
import type { Action, GameState, Ticket } from '../types';

const BUY_ORDER = ['u-wl1', 'u-ob1', 'u-if1', 'u-ci1', 'u-wl2', 'u-ob2', 'u-if3', 'u-if2', 'u-sc1', 'u-ci2', 'u-if4', 'u-sc2'];

function act(st: GameState, a: Action): GameState { return reducer(st, a); }

function deploy(st: GameState, name: string, replicas: number): GameState {
  const repo = st.repos.find(r => r.name === name);
  if (!repo) return st;
  const img = latestImages(st).find(i => i.repoId === repo.id);
  if (!img) {
    if (!st.images.some(i => i.repoId === repo.id && i.building)) st = act(st, { type: 'BUILD_IMAGE', repoId: repo.id });
    return st;
  }
  const existing = st.services.find(s => s.name === name);
  st = existing ? act(st, { type: 'FORM_EDIT', id: existing.id }) : act(st, { type: 'FORM_NEW', imageId: img.id });
  const patch: Record<string, unknown> = { imageId: img.id, replicas };
  if (hasUpgrade(st, 'deployments')) patch.type = 'Deployment';
  if (hasUpgrade(st, 'dashboard')) { patch.liveness = true; patch.readiness = true; }
  st = act(st, { type: 'FORM_SET', patch });
  st = act(st, { type: 'SERVICE_SAVE' });
  return act(st, { type: 'FORM_CLOSE' });
}

function workTicket(st: GameState, t: Ticket): GameState {
  const graded = gradeTicket(st, t);
  if (graded.every(c => c.met)) return act(st, { type: 'TICKET_RESOLVE', id: t.id });
  const svc = st.services.find(s => s.name === t.svc);
  let want = Math.max(2, svc?.replicas ?? 0);
  for (const c of t.criteria) if (c.kind === 'replicas' && c.n) want = Math.max(want, c.n);
  for (const c of t.criteria) {
    if (c.kind === 'node_tag' && c.tag) {
      const tag = c.tag;
      if (!st.nodes.some(n => n.tags.includes(tag))) {
        const g = st.nodes.find(n => n.kind === 'generic' && n.tags.length < CONFIG.MAX_TAGS);
        if (g) st = act(st, { type: 'NODE_ADD_TAG', id: g.id, tag });
      }
      // tag every generic node so every replica lands on a matching node
      for (const n of st.nodes) if (n.kind === 'generic' && !n.tags.includes(tag) && n.tags.length < CONFIG.MAX_TAGS) st = act(st, { type: 'NODE_ADD_TAG', id: n.id, tag });
    }
  }
  if (!svc || svc.replicas < want || (t.criteria.some(c => c.kind === 'ha') && svc.type !== 'Deployment' && hasUpgrade(st, 'deployments'))
      || (t.criteria.some(c => c.kind === 'latest') && svc && !isLatest(st, svc))
      || (t.criteria.some(c => c.kind === 'probes') && svc && !(svc.liveness && svc.readiness))) {
    if (totalFree(st, svc?.id ?? null) >= want) st = deploy(st, t.svc, want);
  }
  if (svc && svc.status === 'CrashLoopBackOff') st = act(st, { type: 'SERVICE_RESTART', id: svc.id });
  return st;
}

export function policyStep(st: GameState): GameState {
  if (st.firstBeat) st = act(st, { type: 'CLEAR_BEAT' });
  for (const t of st.tickets.filter(x => x.status === 'todo')) st = workTicket(st, t);
  // capacity
  if (totalFree(st) < 3 && st.meters.budget > 1600) {
    st = act(st, { type: 'PROVISION_NODE', kind: 'generic', tier: hasUpgrade(st, 'large_nodes') ? 'Large' : 'Normal' });
  }
  // upgrades, keeping a cushion
  for (const id of BUY_ORDER) {
    const u = st.upgrades.find(x => x.id === id)!;
    if (!u.owned && upgradeAffordable(st, u) && st.meters.budget - u.cost > 900) st = act(st, { type: 'BUY_UPGRADE', id });
  }
  // keep healthy: restart crashed bare Pods, scale overloaded services
  for (const s of st.services) {
    if (s.status === 'CrashLoopBackOff') st = act(st, { type: 'SERVICE_RESTART', id: s.id });
  }
  if (st.meters.budget < 0) st = act(st, { type: 'BAILOUT' });
  st = act(st, { type: 'PAUSE', paused: false });
  st = act(st, { type: 'TICK' });
  st = act(st, { type: 'BUILD_TICK' });
  return st;
}

interface Summary { seed: number; day: number; budget: number; minBudget: number; minAt: number; xp: number; resolved: number; incidents: number; upgrades: number; worstSla: number; outcome: string; procTickets: number }

export function play(seed: number, n: number): { st: GameState; sum: Summary; budgets: number[] } {
  let st = seedState(seed);
  st = { ...st, settings: { ...st.settings, pauseOnTicket: false } };
  let minBudget = st.meters.budget, minAt = 0, wonAt = -1;
  const budgets: number[] = [];
  for (let i = 0; i < n; i++) {
    st = policyStep(st);
    budgets.push(st.meters.budget);
    if (st.meters.budget < minBudget) { minBudget = st.meters.budget; minAt = st.clock.tick; }
    if (st.outcome && !st.endless) {
      if (st.outcome.kind === 'won') { wonAt = st.outcome.atTick; st = act(st, { type: 'CONTINUE_ENDLESS' }); }
      else break;
    }
  }
  const sum: Summary = {
    seed, day: Math.floor(st.clock.tick / CONFIG.TICKS_PER_DAY) + 1, budget: Math.round(st.meters.budget),
    minBudget: Math.round(minBudget), minAt, xp: st.meters.xp, resolved: st.stats.ticketsResolved, incidents: st.stats.incidentsResolved,
    upgrades: st.upgrades.filter(u => u.owned).length, worstSla: +st.stats.worstSla.toFixed(2),
    outcome: wonAt >= 0 ? `won@day${Math.floor(wonAt / CONFIG.TICKS_PER_DAY) + 1}` : st.outcome ? `${st.outcome.kind}@${st.outcome.atTick}` : '—',
    procTickets: st.tickets.filter(t => t.type !== 'bug' && Number(t.id.split('-')[1]) >= 105).length,
  };
  return { st, sum, budgets };
}

describe('balance (reasonable-player policy)', () => {
  const seeds = [11, 2024, 777];
  const runs = seeds.map(s => play(s, 1200));

  test('summary', () => {
    // eslint-disable-next-line no-console
    console.table(runs.map(r => r.sum));
    expect(runs).toHaveLength(3);
  });

  test('never loses in the first 600 ticks', () => {
    for (const r of runs) {
      const lostEarly = r.st.outcome?.kind === 'lost' && r.st.outcome.atTick <= 600;
      expect(lostEarly, `seed ${r.sum.seed} lost at ${r.sum.outcome}`).toBe(false);
    }
  });

  test('budget stays above −1500 for at least 2 of 3 seeds', () => {
    const ok = runs.filter(r => r.sum.minBudget > -1500).length;
    expect(ok).toBeGreaterThanOrEqual(2);
  });

  test('steady flow of work: ≥6 tickets by tick 600 and procedural tickets appear', () => {
    for (const r of runs) {
      const early = play(r.sum.seed, 600).sum;
      expect(early.resolved, `seed ${r.sum.seed}`).toBeGreaterThanOrEqual(6);
      expect(r.sum.procTickets, `seed ${r.sum.seed}`).toBeGreaterThan(0);
    }
  });

  test('the campaign is winnable by a reasonable player within ~25 days', () => {
    const won = runs.filter(r => r.st.upgrades.find(u => u.final)?.owned).length;
    expect(won).toBeGreaterThanOrEqual(2);
    // …but not trivially: nobody finishes the tree in the first 8 days
    for (const r of runs) if (r.st.outcome?.kind === 'won') expect(r.st.outcome.atTick).toBeGreaterThan(8 * CONFIG.TICKS_PER_DAY);
  });
});
