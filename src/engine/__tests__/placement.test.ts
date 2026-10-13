import { describe, expect, test } from 'vitest';
import { seedState } from '../reducer';
import { mkService } from '../reducer';
import {
  autoSpread, freeSlots, misplaced, offlinePods, podsOnNode, rehomeOffline, totalFree,
} from '../placement';
import type { ClusterNode, GameState, Hw, Service } from '../types';

/* ---------- fixtures ---------- */
function node(name: string, o: Partial<ClusterNode> = {}): ClusterNode {
  return { id: `node-${name}`, name: `node-${name}`, kind: 'generic', tier: 'Normal', slots: 4, tags: [], downFor: 0, provisionedTick: 0, ...o };
}
function svc(name: string, o: Partial<Service> & { replicas: number; podNodes: string[] }): Service {
  return mkService({ id: `svc-${name}`, name, imageId: 'img-1', type: 'Pod', createdTick: 0, status: 'Running', ...o }, 40);
}
function base(nodes: ClusterNode[], services: Service[] = []): GameState {
  return { ...seedState(1), nodes, services };
}

describe('autoSpread', () => {
  test('spreads one pod per node first', () => {
    const st = base([node('alpha'), node('bravo')]);
    const out = autoSpread(st, 2);
    expect(out).toHaveLength(2);
    expect(new Set(out).size).toBe(2);
    // a third pod wraps around onto the most-free node
    const three = autoSpread(st, 3);
    expect(three).toHaveLength(3);
    expect(new Set(three).size).toBe(2);
  });

  test('prefers nodes carrying the affinity tag', () => {
    const st = base([node('alpha'), node('bravo', { tags: ['GPU'] })]);
    expect(autoSpread(st, 1, { affinity: 'GPU' })).toEqual(['node-bravo']);
    // with two pods the second overflows onto the non-matching node (schedule-but-fail)
    const two = autoSpread(st, 2, { affinity: 'GPU' });
    expect(two[0]).toBe('node-bravo');
    expect(two[1]).toBe('node-alpha');
    // round-robin per pass, the matching node always first in each pass
    expect(autoSpread(st, 5, { affinity: 'GPU' })).toEqual(['node-bravo', 'node-alpha', 'node-bravo', 'node-alpha', 'node-bravo']);
  });

  test('skips offline nodes', () => {
    const st = base([node('alpha'), node('bravo', { downFor: 3 })]);
    expect(autoSpread(st, 2)).toEqual(['node-alpha', 'node-alpha']);
    // skipDown=false lets it use the offline node again
    expect(new Set(autoSpread(st, 2, { skipDown: false })).size).toBe(2);
  });

  test('piles onto the most-free node when the cluster is full', () => {
    const st = base([node('alpha')]);
    const out = autoSpread(st, 6);
    expect(out).toHaveLength(6);
    expect(out.every(n => n === 'node-alpha')).toBe(true);
  });

  test('respects existing pods and exceptId', () => {
    const existing = svc('a', { replicas: 3, podNodes: ['node-alpha', 'node-alpha', 'node-alpha'] });
    const st = base([node('alpha'), node('bravo')], [existing]);
    // alpha has 1 free, bravo 4 → first pod goes to bravo (most free), then alpha, then bravo…
    const out = autoSpread(st, 3);
    expect(out[0]).toBe('node-bravo');
    expect(out).toContain('node-alpha');
    // excluding the existing service frees alpha entirely → alphabetical tie-break
    expect(autoSpread(st, 2, { exceptId: 'svc-a' })).toEqual(['node-alpha', 'node-bravo']);
  });
});

describe('capacity helpers', () => {
  const a = svc('a', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'] });
  const b = svc('b', { replicas: 3, podNodes: ['node-alpha', 'node-alpha', 'node-bravo', 'node-stale'] }); // extra entry beyond replicas is ignored
  const st = base([node('alpha'), node('bravo', { tier: 'Large', slots: 8 })], [a, b]);

  test('podsOnNode counts only the first `replicas` entries, optionally excluding a service', () => {
    expect(podsOnNode(st, 'node-alpha')).toBe(3);
    expect(podsOnNode(st, 'node-bravo')).toBe(2);
    expect(podsOnNode(st, 'node-alpha', 'svc-b')).toBe(1);
    expect(podsOnNode(st, 'node-nope')).toBe(0);
  });

  test('freeSlots and totalFree', () => {
    expect(freeSlots(st)).toEqual({ 'node-alpha': 1, 'node-bravo': 6 });
    expect(totalFree(st)).toBe(7);
    expect(freeSlots(st, 'svc-a')).toEqual({ 'node-alpha': 2, 'node-bravo': 7 });
    expect(totalFree(st, 'svc-b')).toBe(10);
  });
});

describe('misplaced / offlinePods', () => {
  test('misplaced counts pods on nodes lacking the affinity tag (and unknown nodes)', () => {
    const s = svc('g', { replicas: 3, affinity: 'GPU' as Hw, podNodes: ['node-alpha', 'node-bravo', 'node-ghost'] });
    const st = base([node('alpha'), node('bravo', { tags: ['GPU'] })], [s]);
    expect(misplaced(st, s)).toBe(2);
    expect(misplaced(st, { ...s, affinity: null })).toBe(0);
  });

  test('offlinePods counts pods on offline or missing nodes', () => {
    const s = svc('o', { replicas: 3, podNodes: ['node-alpha', 'node-bravo', 'node-ghost'] });
    const st = base([node('alpha'), node('bravo', { downFor: 2 })], [s]);
    expect(offlinePods(st, s)).toBe(2);
    const up = base([node('alpha'), node('bravo')], [s]);
    expect(offlinePods(up, s)).toBe(1); // only the ghost
  });
});

describe('rehomeOffline', () => {
  test('moves pods off a down node when free slots exist', () => {
    const d = svc('d', { type: 'Deployment', replicas: 2, podNodes: ['node-alpha', 'node-bravo'] });
    const st = base([node('alpha'), node('bravo', { downFor: 5 })], [d]);
    expect(rehomeOffline(st, d)).toEqual(['node-alpha', 'node-alpha']);
  });

  test('leaves pods where they are when no slot is free', () => {
    const filler = svc('f', { replicas: 3, podNodes: ['node-alpha', 'node-alpha', 'node-alpha'] });
    const d = svc('d', { type: 'Deployment', replicas: 2, podNodes: ['node-alpha', 'node-bravo'] });
    const st = base([node('alpha'), node('bravo', { downFor: 5 })], [filler, d]);
    // alpha: 4 slots − 3 filler − 1 own healthy pod = 0 free → the bravo pod stays
    expect(rehomeOffline(st, d)).toEqual(['node-alpha', 'node-bravo']);
  });

  test('prefers an affinity-matching up node', () => {
    const d = svc('d', { type: 'Deployment', replicas: 2, affinity: 'DATA' as Hw, podNodes: ['node-alpha', 'node-bravo'] });
    const st = base([node('alpha'), node('bravo', { downFor: 5, tags: ['DATA'] }), node('charlie', { tags: ['DATA'] })], [d]);
    expect(rehomeOffline(st, d)).toEqual(['node-alpha', 'node-charlie']);
  });
});
