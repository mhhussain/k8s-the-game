/* ============================================================
   Save / load — localStorage slots + JSON export/import.
   Saves are the full GameState minus transient UI bits.
   ============================================================ */
import { CONFIG } from './config';
import { mkService, seedState } from './reducer';
import type { ClusterNode, GameState, Image, Service, Ticket } from './types';

export const SAVE_PREFIX = 'k8sgame.save.';
export const AUTOSAVE_KEY = SAVE_PREFIX + 'auto';
export const SLOT_KEYS = [1, 2, 3].map(n => SAVE_PREFIX + 'slot' + n);
export const SETTINGS_KEY = 'k8sgame.settings';

export interface SaveFile {
  magic: 'k8sgame-save' | 'cluster-save';
  version: number;
  savedAt: number;          // Date.now()
  label: string;
  state: GameState;
}
export interface SaveMeta { key: string; label: string; savedAt: number; day: number; budget: number; services: number; tickets: number; outcome: GameState['outcome'] }

export function serialize(state: GameState, label = ''): SaveFile {
  const clean: GameState = { ...state, toasts: [], form: { open: false, editingId: null, draft: null }, clock: { ...state.clock, paused: true } };
  return { magic: 'k8sgame-save', version: CONFIG.SAVE_VERSION, savedAt: Date.now(), label, state: clean };
}

/* Migrate older saves forward. Fills any missing field from a fresh seed so
   new engine fields never crash an old save. */
export function migrate(raw: unknown): GameState {
  const file = raw as Partial<SaveFile>;
  // 'cluster-save' is the pre-rename magic; still accepted
  if (!file || (file.magic !== 'k8sgame-save' && file.magic !== 'cluster-save') || !file.state) throw new Error('Not a Kubernetes: The Game save file');
  const fresh = seedState(1);
  const s = file.state as Partial<GameState>;
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
  const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

  const nodes = arr<ClusterNode>(s.nodes).filter(n => obj(n) && str(n.id) && str(n.name)).map(n => ({
    ...n, slots: num(n.slots, 4), tags: arr<ClusterNode['tags'][number]>(n.tags), downFor: num(n.downFor, 0), provisionedTick: num(n.provisionedTick, 0),
    kind: n.kind === 'special' ? 'special' as const : 'generic' as const, tier: (['Normal', 'Large', 'Special'] as const).includes(n.tier) ? n.tier : 'Normal' as const,
  }));
  const services = arr<Service>(s.services).filter(sv => obj(sv) && str(sv.name) && str(sv.imageId)).map(sv => {
    const replicas = Math.max(0, Math.min(CONFIG.AUTOSCALE_MAX, Math.round(num(sv.replicas, 0))));
    const base = mkService({ id: str(sv.id) ? sv.id : `svc-${sv.name}`, name: sv.name, imageId: sv.imageId, type: sv.type === 'Deployment' ? 'Deployment' : 'Pod', replicas, createdTick: num(sv.createdTick, 0) }, num(sv.demand, 50));
    const ready = Array.isArray(sv.ready) && sv.ready.length === 2 ? [num(sv.ready[0], 0), num(sv.ready[1], replicas)] as [number, number] : [0, replicas] as [number, number];
    return { ...base, ...sv, replicas, ready, podNodes: arr<string>(sv.podNodes).filter(str),
      restarts: num(sv.restarts, 0), errorRate: num(sv.errorRate, 0.002), health: num(sv.health, 100), demand: num(sv.demand, 50),
      age: num(sv.age, 0), settleIn: num(sv.settleIn, 0), incidentCooldown: num(sv.incidentCooldown, 0),
      crashFor: num(sv.crashFor, 0), lowLoadTicks: num(sv.lowLoadTicks, 0), createdTick: num(sv.createdTick, 0) };
  });
  const tickets = arr<Ticket>(s.tickets).filter(t => obj(t) && str(t.id) && Array.isArray(t.criteria))
    .map(t => ({ ...t, paid: t.paid ?? t.status === 'done', createdTick: num(t.createdTick, 0), reward: num(t.reward, 0), xp: num(t.xp, 0) }));
  const images = arr<Image>(s.images).filter(i => obj(i) && str(i.id) && str(i.repoId)).map(i => ({ ...i, version: num(i.version, 1), progress: num(i.progress, 100) }));

  const state: GameState = {
    ...fresh, ...s,
    clock: { ...fresh.clock, ...(obj(s.clock) ? s.clock : {}), paused: true },
    meters: { sla: num(s.meters?.sla, 100), budget: num(s.meters?.budget, CONFIG.START_BUDGET), xp: num(s.meters?.xp, 0) },
    ui: { ...fresh.ui, ...(obj(s.ui) ? s.ui : {}), openTicket: null },
    seq: { ...fresh.seq, ...(obj(s.seq) ? s.seq : {}) },
    stats: { ...fresh.stats, ...(obj(s.stats) ? s.stats : {}) },
    settings: { ...fresh.settings, ...(obj(s.settings) ? s.settings : {}) },
    flash: { bad: null, rebalance: null },
    toasts: [], form: { open: false, editingId: null, draft: null },
    nodes: nodes.length ? nodes : fresh.nodes,
    services, tickets, images,
    pending: arr<GameState['pending'][number]>(s.pending).filter(p => obj(p) && obj(p.ticket)),
    events: arr<GameState['events'][number]>(s.events).filter(obj),
    log: arr<GameState['log'][number]>(s.log).filter(obj),
    toastStamp: obj(s.toastStamp) ? s.toastStamp as Record<string, number> : {},
    // keep the player's purchases but take descriptions/costs from the current catalog
    upgrades: fresh.upgrades.map(u => ({ ...u, owned: !!arr<{ id: string; owned: boolean }>(s.upgrades).find(x => obj(x) && x.id === u.id)?.owned })),
    repos: fresh.repos,
    version: CONFIG.SAVE_VERSION,
  };
  if (!Number.isFinite(state.rng)) state.rng = 1;
  return state;
}

/* Saves written before the rename used 'cluster.*' keys; copy them over once. */
export function migrateLegacyKeys() {
  const st = storage(); if (!st) return;
  try {
    const pairs: [string, string][] = [['cluster.save.auto', AUTOSAVE_KEY], ['cluster.settings', SETTINGS_KEY], ...[1, 2, 3].map(n => [`cluster.save.slot${n}`, SAVE_PREFIX + 'slot' + n] as [string, string])];
    for (const [from, to] of pairs) { const v = st.getItem(from); if (v !== null && st.getItem(to) === null) st.setItem(to, v); }
  } catch { /* ignore */ }
}

/* ---- localStorage (guarded: private mode / blocked storage never crashes the game) ---- */
function storage(): Storage | null { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }

export function saveToSlot(key: string, state: GameState, label = ''): boolean {
  const st = storage(); if (!st) return false;
  try { st.setItem(key, JSON.stringify(serialize(state, label))); return true; } catch { return false; }
}
export function loadFromSlot(key: string): GameState | null {
  const st = storage(); if (!st) return null;
  try { const raw = st.getItem(key); if (!raw) return null; return migrate(JSON.parse(raw)); } catch { return null; }
}
export function deleteSlot(key: string) { const st = storage(); try { st?.removeItem(key); } catch { /* ignore */ } }
export function slotMeta(key: string): SaveMeta | null {
  const st = storage(); if (!st) return null;
  try {
    const raw = st.getItem(key); if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    const s = f.state;
    return { key, label: f.label, savedAt: f.savedAt, day: Math.floor((s.clock?.tick ?? 0) / CONFIG.TICKS_PER_DAY) + 1,
      budget: s.meters?.budget ?? 0, services: s.services?.length ?? 0, tickets: (s.tickets ?? []).filter(t => t.status === 'todo').length, outcome: s.outcome ?? null };
  } catch { return null; }
}

/* ---- JSON file export / import (carry saves between machines) ---- */
export function exportJson(state: GameState, label = ''): string { return JSON.stringify(serialize(state, label), null, 0); }
export function importJson(text: string): GameState { return migrate(JSON.parse(text)); }

/* ---- UI settings (theme etc.) are stored separately from game saves ---- */
export interface UiSettings { theme: 'daylight' | 'bubblegum' | 'voltage'; boardView: 'cards' | 'grid' | 'table'; autosave: boolean; seenIntro: boolean }
export const DEFAULT_SETTINGS: UiSettings = { theme: 'daylight', boardView: 'cards', autosave: true, seenIntro: false };
export function loadSettings(): UiSettings {
  const st = storage(); if (!st) return DEFAULT_SETTINGS;
  try { const raw = st.getItem(SETTINGS_KEY); return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
}
export function saveSettings(s: UiSettings) { const st = storage(); try { st?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
