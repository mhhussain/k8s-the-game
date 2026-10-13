import { describe, expect, test } from 'vitest';
import { CONFIG } from '../config';
import { reducer, seedState } from '../reducer';
import { exportJson, importJson, migrate, serialize } from '../save';
import { tick } from '../tick';
import { upgradeCatalog } from '../content';
import type { Action, GameState } from '../types';

/* a non-trivial game: image, service, extra node, an owned upgrade, a few ticks */
function sample(): GameState {
  const steps: Action[] = [
    { type: 'BUILD_IMAGE', repoId: 'repo-1' },
    ...Array.from({ length: 9 }, () => ({ type: 'BUILD_TICK' } as Action)),
    { type: 'FORM_NEW' }, { type: 'SERVICE_SAVE' },
    { type: 'PROVISION_NODE', kind: 'generic' },
    { type: 'NODE_ADD_TAG', id: 'node-alpha', tag: 'DATA' },
    { type: 'BUY_UPGRADE', id: 'u-wl1' },
    { type: 'NAV', screen: 'tree' },
  ];
  let st = steps.reduce(reducer, seedState(99));
  for (let i = 0; i < 10; i++) st = tick(st);
  st = reducer(st, { type: 'TICKET_RESOLVE', id: 'TCK-101' });
  return { ...st, clock: { ...st.clock, paused: false }, form: { open: true, editingId: null, draft: null } };
}
/** what a save is expected to restore: the state minus toasts/form/paused (and the UI flash pulses) */
const expected = (st: GameState): GameState => ({
  ...st, toasts: [], form: { open: false, editingId: null, draft: null }, clock: { ...st.clock, paused: true }, flash: { bad: null, rebalance: null },
});

describe('serialize / migrate', () => {
  test('round-trip equals the state minus toasts / form / paused', () => {
    const st = sample();
    expect(st.toasts.length).toBeGreaterThan(0);
    expect(st.tickets.find(t => t.id === 'TCK-101')?.status).toBe('done');
    const file = serialize(st, 'slot A');
    expect(file).toMatchObject({ magic: 'k8sgame-save', version: CONFIG.SAVE_VERSION, label: 'slot A' });
    expect(file.state.toasts).toEqual([]);
    expect(file.state.clock.paused).toBe(true);
    expect(migrate(file)).toEqual(expected(st));
  });

  test('importJson(exportJson(state)) works (JSON drops nothing that matters)', () => {
    const st = sample();
    const text = exportJson(st, 'portable');
    expect(typeof text).toBe('string');
    const back = importJson(text);
    expect(back).toEqual(expected(st));
    expect(back.services[0].podNodes).not.toBe(st.services[0].podNodes); // fresh arrays
    // and the imported game keeps ticking identically to the original
    const a = tick({ ...st, toasts: [] });
    const b = tick(back);
    expect({ ...a, toasts: [], clock: { ...a.clock, paused: true }, flash: null, form: null }).toEqual({ ...b, toasts: [], clock: { ...b.clock, paused: true }, flash: null, form: null });
  });

  test('fills missing new fields in an "old" save with defaults', () => {
    const st = sample();
    const raw = JSON.parse(exportJson(st)) as { state: Record<string, unknown> };
    const s = raw.state;
    for (const k of ['stats', 'events', 'log', 'settings', 'outcome', 'endless', 'nextProcTick', 'budgetDebtTicks', 'lastOutageTick', 'lastBailoutDay', 'toastStamp', 'flash', 'firstBeat', 'version']) delete s[k];
    s.nodes = (s.nodes as Record<string, unknown>[]).map(n => { const c = { ...n }; delete c.downFor; delete c.provisionedTick; return c; });
    s.services = (s.services as Record<string, unknown>[]).map(x => { const c = { ...x }; delete c.crashFor; delete c.lowLoadTicks; delete c.createdTick; return c; });
    s.tickets = (s.tickets as Record<string, unknown>[]).map(t => { const c = { ...t }; delete c.paid; delete c.createdTick; return c; });
    s.seq = { ticket: 110 }; // partial nested objects are merged, not replaced
    s.meters = { budget: 123 };

    const m = migrate(raw);
    const fresh = seedState(1);
    expect(m.version).toBe(CONFIG.SAVE_VERSION);
    expect(m.stats).toEqual(fresh.stats);
    expect(m.events).toEqual([]);
    expect(m.log).toEqual([]);
    expect(m.settings).toEqual(fresh.settings);
    expect(m.outcome).toBeNull();
    expect(m.endless).toBe(false);
    expect(m.nextProcTick).toBe(fresh.nextProcTick);
    expect(m.budgetDebtTicks).toBe(0);
    expect(m.lastOutageTick).toBe(0);
    expect(m.lastBailoutDay).toBe(0);
    expect(m.toastStamp).toEqual({});
    expect(m.flash).toEqual({ bad: null, rebalance: null });
    expect(m.firstBeat).toBeNull();
    expect(m.nodes.every(n => n.downFor === 0 && n.provisionedTick === 0)).toBe(true);
    expect(m.nodes).toHaveLength(2);
    expect(m.nodes[0].tags).toEqual(['DATA']);
    expect(m.services[0]).toMatchObject({ crashFor: 0, lowLoadTicks: 0, createdTick: 0, name: 'web-storefront' });
    // paid is inferred from status for old tickets
    expect(m.tickets.find(t => t.id === 'TCK-101')).toMatchObject({ paid: true, createdTick: 0, status: 'done' });
    expect(m.seq).toEqual({ ...fresh.seq, ticket: 110 });
    expect(m.meters).toEqual({ ...fresh.meters, budget: 123 });
    expect(m.clock.paused).toBe(true);
    expect(m.clock.tick).toBe(st.clock.tick);
    expect(m.repos).toEqual(fresh.repos);
  });

  test('rejects garbage', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate(undefined)).toThrow();
    expect(() => migrate(42)).toThrow();
    expect(() => migrate('cluster-save')).toThrow();
    expect(() => migrate({})).toThrow();
    expect(() => migrate({ magic: 'nope', state: {} })).toThrow();
    expect(() => migrate({ magic: 'cluster-save' })).toThrow(/Not a Kubernetes: The Game save file/);
    expect(() => importJson('{not json')).toThrow();
    expect(() => importJson('[]')).toThrow();
  });

  test('a minimal save fills everything from the seed and repairs a broken rng', () => {
    const m = migrate({ magic: 'cluster-save', state: { rng: 'oops' } });
    expect(m.nodes).toHaveLength(1);
    expect(m.services).toEqual([]);
    expect(m.tickets).toEqual([]);
    expect(m.rng).toBe(1);
    expect(m.upgrades.every(u => !u.owned)).toBe(true);
    expect(m.clock.paused).toBe(true);
  });

  test('upgrades keep `owned` but take catalog costs/descriptions', () => {
    const st = sample();
    const raw = JSON.parse(exportJson(st)) as { state: { upgrades: Record<string, unknown>[] } };
    raw.state.upgrades = raw.state.upgrades
      .filter(u => u.id !== 'u-sc2')                        // a dropped entry comes back from the catalog
      .map(u => u.id === 'u-wl1' ? { ...u, cost: 1, xp: 999, desc: 'old copy', name: 'Old name' } : u);
    raw.state.upgrades.push({ id: 'u-legacy', owned: true });   // unknown ids are dropped
    const m = migrate(raw);
    const catalog = upgradeCatalog();
    expect(m.upgrades.map(u => u.id)).toEqual(catalog.map(u => u.id));
    const wl1 = m.upgrades.find(u => u.id === 'u-wl1');
    const cat = catalog.find(u => u.id === 'u-wl1');
    expect(wl1).toEqual({ ...cat, owned: true });
    expect(m.upgrades.find(u => u.id === 'u-sc2')).toEqual(catalog.find(u => u.id === 'u-sc2'));
    expect(m.upgrades.filter(u => u.owned).map(u => u.id)).toEqual(['u-wl1']);
  });
});

describe('hostile saves', () => {
  test('malformed fields are repaired instead of crashing the game', () => {
    const raw = { magic: 'k8sgame-save', state: {
      services: [{ name: 'x', imageId: 'img-1' }, { nope: true }, null],
      nodes: 'garbage', tickets: [{ id: 'T', criteria: 'no' }, { id: 'U', criteria: [] }],
      meters: { budget: 'lots' }, images: [{ id: 'img-1', repoId: 'repo-1' }], log: 5,
    } };
    const st = migrate(raw);
    expect(st.services).toHaveLength(1);
    expect(st.services[0].ready).toEqual([0, 0]);
    expect(Array.isArray(st.services[0].podNodes)).toBe(true);
    expect(st.nodes.length).toBeGreaterThan(0);
    expect(st.tickets.map(t => t.id)).toEqual(['U']);
    expect(st.meters.budget).toBe(CONFIG.START_BUDGET);
    expect(st.log).toEqual([]);
    // and the repaired game ticks without throwing
    expect(() => tick(st)).not.toThrow();
  });
  test('pre-rename saves are still accepted', () => {
    expect(() => migrate({ magic: 'cluster-save', state: {} })).not.toThrow();
  });
});
