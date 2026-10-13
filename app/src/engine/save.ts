/* ============================================================
   Save / load — localStorage slots + JSON export/import.
   Saves are the full GameState minus transient UI bits.
   ============================================================ */
import { CONFIG } from './config';
import { seedState } from './reducer';
import type { GameState } from './types';

export const SAVE_PREFIX = 'cluster.save.';
export const AUTOSAVE_KEY = SAVE_PREFIX + 'auto';
export const SLOT_KEYS = [1, 2, 3].map(n => SAVE_PREFIX + 'slot' + n);
export const SETTINGS_KEY = 'cluster.settings';

export interface SaveFile {
  magic: 'cluster-save';
  version: number;
  savedAt: number;          // Date.now()
  label: string;
  state: GameState;
}
export interface SaveMeta { key: string; label: string; savedAt: number; day: number; budget: number; services: number; tickets: number; outcome: GameState['outcome'] }

export function serialize(state: GameState, label = ''): SaveFile {
  const clean: GameState = { ...state, toasts: [], form: { open: false, editingId: null, draft: null }, clock: { ...state.clock, paused: true } };
  return { magic: 'cluster-save', version: CONFIG.SAVE_VERSION, savedAt: Date.now(), label, state: clean };
}

/* Migrate older saves forward. Fills any missing field from a fresh seed so
   new engine fields never crash an old save. */
export function migrate(raw: unknown): GameState {
  const file = raw as Partial<SaveFile>;
  if (!file || file.magic !== 'cluster-save' || !file.state) throw new Error('Not a Cluster save file');
  const fresh = seedState(1);
  const s = file.state as Partial<GameState>;
  const state: GameState = {
    ...fresh, ...s,
    clock: { ...fresh.clock, ...(s.clock ?? {}), paused: true },
    meters: { ...fresh.meters, ...(s.meters ?? {}) },
    ui: { ...fresh.ui, ...(s.ui ?? {}) },
    seq: { ...fresh.seq, ...(s.seq ?? {}) },
    stats: { ...fresh.stats, ...(s.stats ?? {}) },
    settings: { ...fresh.settings, ...(s.settings ?? {}) },
    flash: { bad: null, rebalance: null },
    toasts: [], form: { open: false, editingId: null, draft: null },
    nodes: (s.nodes ?? fresh.nodes).map(n => ({ ...n, downFor: n.downFor ?? 0, provisionedTick: n.provisionedTick ?? 0 })),
    services: (s.services ?? []).map(sv => ({ ...sv, crashFor: sv.crashFor ?? 0, lowLoadTicks: sv.lowLoadTicks ?? 0, createdTick: sv.createdTick ?? 0, podNodes: [...(sv.podNodes ?? [])] })),
    tickets: (s.tickets ?? []).map(t => ({ ...t, paid: t.paid ?? t.status === 'done', createdTick: t.createdTick ?? 0 })),
    // keep the player's purchases but take descriptions/costs from the current catalog
    upgrades: fresh.upgrades.map(u => ({ ...u, owned: !!(s.upgrades ?? []).find(x => x.id === u.id)?.owned })),
    repos: fresh.repos,
    version: CONFIG.SAVE_VERSION,
  };
  if (!Number.isFinite(state.rng)) state.rng = 1;
  return state;
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
