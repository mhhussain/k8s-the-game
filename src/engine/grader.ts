/* ============================================================
   Acceptance-criteria grader (pure, derived, never stored)
   ============================================================ */
import { findSvc, isLatest } from './helpers';
import { distinctNodes, misplaced } from './placement';
import type { Criterion, GameState, GradedCriterion, Service, SubCheck, Ticket } from './types';

export function haSubs(state: GameState, s: Service | undefined): SubCheck[] {
  const distinct = s ? distinctNodes(s) : 0;
  const oneNode = state.nodes.length < 2;
  return [
    { label: 'Deployment workload', met: !!s && s.type === 'Deployment' },
    { label: '≥2 replicas', met: !!s && s.replicas >= 2 },
    { label: 'Replicas spread across ≥2 nodes', met: distinct >= 2, hint: distinct < 2 && oneNode ? 'needs another node' : null },
  ];
}

export function gradeCriterion(state: GameState, c: Criterion): boolean {
  const s = findSvc(state, c.svc);
  switch (c.kind) {
    case 'running':
      return !!s && s.replicas > 0 && s.status !== 'Pending' && s.status !== 'CrashLoopBackOff' && s.status !== 'Idle' && s.ready[0] > 0;
    case 'replicas':   return !!s && s.replicas >= (c.n ?? 1);
    case 'deployment': return !!s && s.type === 'Deployment';
    case 'ha':         return haSubs(state, s).every(x => x.met);
    case 'spread':     return !!s && distinctNodes(s) >= (c.n ?? 2);
    case 'node_tag': {
      if (!s) return false;
      const placed = s.podNodes.slice(0, s.replicas);
      if (!placed.length) return false;
      return placed.every(nid => { const n = state.nodes.find(nn => nn.id === nid); return !!n && !!c.tag && n.tags.includes(c.tag); });
    }
    case 'latest':     return !!s && isLatest(state, s) && s.status !== 'Stale';
    case 'probes':     return !!s && s.liveness && s.readiness;
    case 'stable':
      return !!s && s.status === 'Running' && s.errorRate < 0.06 && s.ready[0] === s.ready[1] && s.replicas > 0 && misplaced(state, s) === 0;
    default: return false;
  }
}

export function gradeTicket(state: GameState, t: Ticket): GradedCriterion[] {
  return t.criteria.map(c => {
    const met = gradeCriterion(state, c);
    if (c.kind === 'ha') return { ...c, met, subs: haSubs(state, findSvc(state, c.svc)) };
    return { ...c, met };
  });
}
export const ticketMet = (state: GameState, t: Ticket) => t.criteria.every(c => gradeCriterion(state, c));

/* reward after soft-deadline decay */
export function effectiveReward(t: Ticket, tick: number, ticksPerDay: number, decayPerDay: number, floor: number): number {
  if (t.dueTick == null || tick <= t.dueTick) return t.reward;
  const daysLate = (tick - t.dueTick) / ticksPerDay;
  return Math.round(t.reward * Math.max(floor, 1 - daysLate * decayPerDay));
}
