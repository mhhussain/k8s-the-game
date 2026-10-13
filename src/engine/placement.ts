/* ============================================================
   Placement: auto-spread, capacity, misplacement, node outages
   ============================================================ */
import type { ClusterNode, GameState, Hw, Service } from './types';

export const nodeIsUp = (n: ClusterNode) => n.downFor <= 0;

/* pods placed on a node across all services (optionally excluding one) */
export function podsOnNode(state: GameState, nodeId: string, exceptId: string | null = null): number {
  let n = 0;
  for (const s of state.services) {
    if (s.id === exceptId) continue;
    for (const nid of s.podNodes.slice(0, s.replicas)) if (nid === nodeId) n++;
  }
  return n;
}

export function freeSlots(state: GameState, exceptId: string | null = null): Record<string, number> {
  const cap: Record<string, number> = {};
  for (const n of state.nodes) cap[n.id] = n.slots - podsOnNode(state, n.id, exceptId);
  return cap;
}
export const totalFree = (state: GameState, exceptId: string | null = null) =>
  Object.values(freeSlots(state, exceptId)).reduce((a, b) => a + b, 0);

/* pods whose node lacks the required tag (schedule-but-fail) */
export function misplaced(state: GameState, s: Service): number {
  if (!s.affinity) return 0;
  return s.podNodes.slice(0, s.replicas).filter(nid => {
    const n = state.nodes.find(x => x.id === nid);
    return !n || !n.tags.includes(s.affinity as Hw);
  }).length;
}
/* pods sitting on a node that is currently offline */
export function offlinePods(state: GameState, s: Service): number {
  return s.podNodes.slice(0, s.replicas).filter(nid => {
    const n = state.nodes.find(x => x.id === nid);
    return !n || !nodeIsUp(n);
  }).length;
}
export function podHealthy(state: GameState, s: Service, nodeId: string): boolean {
  const n = state.nodes.find(x => x.id === nodeId);
  if (!n || !nodeIsUp(n)) return false;
  if (!s.affinity) return true;
  return n.tags.includes(s.affinity);
}
export const distinctNodes = (s: Service) => new Set(s.podNodes.slice(0, s.replicas)).size;

/* ---------- auto-spread ----------
   One pod per node per pass (maximising distinct nodes for HA), preferring
   affinity matches, then most-free. Offline nodes are skipped. Overflow onto
   non-matching nodes is allowed (schedule-but-fail is a teachable bug). If the
   cluster is full, remaining pods pile onto the most-free node. */
export function autoSpread(
  state: GameState, count: number,
  { affinity = null, exceptId = null, skipDown = true }: { affinity?: Hw | null; exceptId?: string | null; skipDown?: boolean } = {},
): string[] {
  const cap = freeSlots(state, exceptId);
  const candidates = state.nodes.filter(n => !skipDown || nodeIsUp(n));
  const pool = candidates.length ? candidates : state.nodes;
  const order = [...pool].sort((a, b) => {
    const am = affinity ? (a.tags.includes(affinity) ? 0 : 1) : 0;
    const bm = affinity ? (b.tags.includes(affinity) ? 0 : 1) : 0;
    if (am !== bm) return am - bm;
    if (cap[b.id] !== cap[a.id]) return cap[b.id] - cap[a.id];
    return a.name < b.name ? -1 : 1;
  });
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard < count * (order.length + 2)) {
    let placed = false;
    for (const n of order) {
      if (out.length >= count) break;
      if (cap[n.id] > 0) { out.push(n.id); cap[n.id]--; placed = true; }
    }
    if (!placed) break;
    guard++;
  }
  while (out.length < count) {
    const n = order[0] ?? state.nodes[0];
    out.push(n ? n.id : '');
  }
  return out;
}

/* manual mode: keep assignment, resize to count */
export function resizePlacement(state: GameState, podNodes: string[], count: number, exceptId: string | null = null): string[] {
  const out = podNodes.slice(0, count);
  const cap = freeSlots(state, exceptId);
  for (const nid of out) cap[nid] = (cap[nid] ?? 0) - 1;
  // new replicas go to up nodes that still have room; if none, they stay unplaced
  // (manual mode then shows "N replicas unplaced" and blocks deploy)
  while (out.length < count) {
    const target = state.nodes.filter(nodeIsUp).sort((a, b) => cap[b.id] - cap[a.id]).find(n => cap[n.id] > 0);
    if (!target) break;
    out.push(target.id); cap[target.id]--;
  }
  return out;
}

/* Re-home a Deployment's pods off an offline node onto nodes with free slots.
   Pods that cannot be re-homed stay where they are (and stay down). */
export function rehomeOffline(state: GameState, s: Service): string[] {
  const cap = freeSlots(state, s.id);
  const up = state.nodes.filter(nodeIsUp);
  // reserve this service's own healthy pods first
  const pods = s.podNodes.slice(0, s.replicas);
  for (const nid of pods) { const n = state.nodes.find(x => x.id === nid); if (n && nodeIsUp(n)) cap[nid]--; }
  return pods.map(nid => {
    const n = state.nodes.find(x => x.id === nid);
    if (n && nodeIsUp(n)) return nid;
    const order = [...up].sort((a, b) => {
      const am = s.affinity ? (a.tags.includes(s.affinity) ? 0 : 1) : 0;
      const bm = s.affinity ? (b.tags.includes(s.affinity) ? 0 : 1) : 0;
      if (am !== bm) return am - bm;
      return cap[b.id] - cap[a.id];
    });
    const target = order.find(x => cap[x.id] > 0);
    if (!target) return nid;
    cap[target.id]--;
    return target.id;
  });
}
