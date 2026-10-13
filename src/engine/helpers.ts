import { CONFIG } from './config';
import type { ClusterNode, GameState, Service, Sev, ServiceStatus, Toast, ToastKind, Upgrade, UpgradeEffect, Image } from './types';

export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const money = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

const SEV: Record<ServiceStatus, Sev> = {
  Running: 'ok', Stale: 'warn', Degraded: 'warn', Pending: 'pending',
  CrashLoopBackOff: 'bad', Terminating: 'pending', Idle: 'idle',
};
export const sevOf = (s: ServiceStatus): Sev => SEV[s] ?? 'idle';

export const svcUpkeep = (s: Service) => s.replicas * CONFIG.POD_COST;
export const nodeUpkeep = (n: ClusterNode) => CONFIG.NODE_COST[n.tier] ?? CONFIG.NODE_COST.Normal;
export const nodeProvisionCost = (n: ClusterNode) => CONFIG.NODE_PROVISION[n.tier] ?? CONFIG.NODE_PROVISION.Normal;
export const svcCapacity = (s: Service) => s.replicas * CONFIG.PER_REPLICA_CAP;
export const dailyUpkeep = (state: GameState) =>
  state.services.reduce((a, s) => a + svcUpkeep(s), 0) + state.nodes.reduce((a, n) => a + nodeUpkeep(n), 0);

export const hasUpgrade = (state: GameState, effect: UpgradeEffect) =>
  state.upgrades.some(u => u.owned && u.effect === effect);
export const upgradeById = (state: GameState, id: string): Upgrade | undefined => state.upgrades.find(u => u.id === id);
export const upgradeAffordable = (state: GameState, u: Upgrade) =>
  !u.owned && u.requires.every(r => upgradeById(state, r)?.owned) &&
  state.meters.budget >= u.cost && state.meters.xp >= u.xp;

export function latestImages(state: GameState): Image[] {
  const byRepo: Record<string, Image> = {};
  state.images.filter(i => !i.building).forEach(i => {
    if (!byRepo[i.repoId] || i.version > byRepo[i.repoId].version) byRepo[i.repoId] = i;
  });
  return Object.values(byRepo);
}
export const imageById = (state: GameState, id: string) => state.images.find(i => i.id === id);
export const nodeById = (state: GameState, id: string) => state.nodes.find(n => n.id === id);
export const findSvc = (state: GameState, name: string) => state.services.find(s => s.name === name);

/* version of the image a service runs, and the newest built version of its repo */
export function imageVersionOf(state: GameState, s: Service): number {
  return state.images.find(i => i.id === s.imageId)?.version ?? 0;
}
export function latestVersionFor(state: GameState, s: Service): number {
  const img = state.images.find(i => i.id === s.imageId);
  if (!img) return 0;
  return Math.max(0, ...state.images.filter(i => !i.building && i.repoId === img.repoId).map(i => i.version));
}

export function isLatest(state: GameState, s: Service): boolean {
  const imgs = state.images.filter(i => !i.building);
  const img = imgs.find(i => i.id === s.imageId);
  if (!img) return false;
  const maxV = Math.max(...imgs.filter(i => i.repoId === img.repoId).map(i => i.version));
  return img.version >= maxV;
}

/* ids are sequential so the engine stays deterministic */
export function nextId(state: GameState, prefix: string): [string, GameState] {
  const n = state.seq.uid + 1;
  return [`${prefix}-${n.toString(36)}`, { ...state, seq: { ...state.seq, uid: n } }];
}

export function pushToast(toasts: Toast[], kind: ToastKind, title: string, msg: string, at: number): Toast[] {
  const id = `t-${at}-${toasts.length}-${Math.floor(Math.random() * 1e6)}`;
  return [...toasts.slice(-(CONFIG.TOASTS_MAX - 1)), { id, kind, title, msg, at }];
}

export const dayOf = (tick: number) => Math.floor(tick / CONFIG.TICKS_PER_DAY) + 1;
export const hourOf = (mins: number) => Math.floor(mins / 60) % 24;
export const clockLabel = (mins: number) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/* demand multiplier: time-of-day curve × any active sale on this service */
export function demandMultiplier(state: GameState, s: Service): number {
  const hour = CONFIG.HOUR_CURVE[hourOf(state.clock.mins)] ?? 1;
  let mult = hour;
  for (const ev of state.events) {
    if (ev.kind === 'sale' && ev.svc === s.name && state.clock.tick >= ev.startTick && state.clock.tick < ev.endTick) mult *= ev.mult ?? 1;
    if (ev.kind === 'traffic_dip' && state.clock.tick >= ev.startTick && state.clock.tick < ev.endTick) mult *= ev.mult ?? 1;
  }
  return mult;
}
export const effectiveDemand = (state: GameState, s: Service) => s.demand * demandMultiplier(state, s);
export const activeEvents = (state: GameState) =>
  state.events.filter(e => state.clock.tick >= e.startTick && state.clock.tick < e.endTick);
export const upcomingEvents = (state: GameState) =>
  state.events.filter(e => state.clock.tick < e.startTick);
