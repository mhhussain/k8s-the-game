import { describe, expect, test } from 'vitest';
import { CONFIG } from '../config';
import { effectiveReward, gradeCriterion, gradeTicket, haSubs, ticketMet } from '../grader';
import { mkService, seedState } from '../reducer';
import type { ClusterNode, Criterion, GameState, Image, Service, Ticket } from '../types';

function node(name: string, o: Partial<ClusterNode> = {}): ClusterNode {
  return { id: `node-${name}`, name: `node-${name}`, kind: 'generic', tier: 'Normal', slots: 4, tags: [], downFor: 0, provisionedTick: 0, ...o };
}
function img(id: string, repoId: string, version: number, building = false): Image {
  return { id, repoId, version, tag: `${repoId}:${version}.0.0`, digest: 'sha256:0', builtTick: 0, building, progress: 100, fast: false };
}
function svc(name: string, o: Partial<Service> & { replicas: number; podNodes: string[] }): Service {
  const s = mkService({ id: `svc-${name}`, name, imageId: 'img-1', type: 'Pod', createdTick: 0, status: 'Running', ...o }, 40);
  if (o.ready === undefined) s.ready = [o.replicas, o.replicas];
  return { ...s, ...o };
}
function base(o: Partial<GameState> = {}): GameState {
  return { ...seedState(1), nodes: [node('alpha'), node('bravo')], images: [img('img-1', 'repo-1', 1)], ...o };
}
const c = (kind: Criterion['kind'], extra: Partial<Criterion> = {}): Criterion => ({ kind, svc: 'web', label: kind, ...extra });
function ticket(criteria: Criterion[], o: Partial<Ticket> = {}): Ticket {
  return { id: 'T-1', type: 'new', requester: 'x', avatar: '#000', prio: 'med', svc: 'web', title: 't', body: '', hint: '', reward: 1000, xp: 10,
    criteria, status: 'todo', createdTick: 0, paid: false, ...o };
}

describe('gradeCriterion', () => {
  test('running', () => {
    const ok = base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'] })] });
    expect(gradeCriterion(ok, c('running'))).toBe(true);
    expect(gradeCriterion(base(), c('running'))).toBe(false); // no service
    for (const status of ['Pending', 'CrashLoopBackOff', 'Idle'] as const) {
      expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], status, ready: [1, 1] })] }), c('running'))).toBe(false);
    }
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], ready: [0, 1] })] }), c('running'))).toBe(false);
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 0, podNodes: [], status: 'Running' })] }), c('running'))).toBe(false);
    // Degraded with ≥1 ready still counts as running
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'], status: 'Degraded', ready: [1, 2] })] }), c('running'))).toBe(true);
  });

  test('replicas', () => {
    const st = base({ services: [svc('web', { replicas: 3, podNodes: ['node-alpha', 'node-alpha', 'node-bravo'] })] });
    expect(gradeCriterion(st, c('replicas', { n: 3 }))).toBe(true);
    expect(gradeCriterion(st, c('replicas', { n: 4 }))).toBe(false);
    expect(gradeCriterion(st, c('replicas'))).toBe(true); // default n=1
  });

  test('deployment', () => {
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], type: 'Deployment' })] }), c('deployment'))).toBe(true);
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'] })] }), c('deployment'))).toBe(false);
  });

  test('ha and its sub-checks', () => {
    const good = svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'], type: 'Deployment' });
    expect(gradeCriterion(base({ services: [good] }), c('ha'))).toBe(true);
    const pod = base({ services: [{ ...good, type: 'Pod' }] });
    expect(gradeCriterion(pod, c('ha'))).toBe(false);
    expect(haSubs(pod, pod.services[0]).map(x => x.met)).toEqual([false, true, true]);
    const one = base({ services: [{ ...good, replicas: 1, podNodes: ['node-alpha'] }] });
    expect(haSubs(one, one.services[0]).map(x => x.met)).toEqual([true, false, false]);
    const sameNode = base({ services: [{ ...good, podNodes: ['node-alpha', 'node-alpha'] }] });
    expect(haSubs(sameNode, sameNode.services[0]).map(x => x.met)).toEqual([true, true, false]);
    expect(haSubs(base(), undefined).every(x => !x.met)).toBe(true);
  });

  test('ha hint says "needs another node" only when the cluster has one node', () => {
    const s = svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-alpha'], type: 'Deployment' });
    const oneNode = base({ nodes: [node('alpha')], services: [s] });
    expect(haSubs(oneNode, s)[2].hint).toBe('needs another node');
    const twoNodes = base({ services: [s] });
    expect(haSubs(twoNodes, s)[2].hint).toBeNull();
    const graded = gradeTicket(oneNode, ticket([c('ha')]));
    expect(graded[0].met).toBe(false);
    expect(graded[0].subs?.[2].hint).toBe('needs another node');
  });

  test('spread', () => {
    const st = base({ services: [svc('web', { replicas: 3, podNodes: ['node-alpha', 'node-alpha', 'node-bravo'] })] });
    expect(gradeCriterion(st, c('spread', { n: 2 }))).toBe(true);
    expect(gradeCriterion(st, c('spread', { n: 3 }))).toBe(false);
    expect(gradeCriterion(st, c('spread'))).toBe(true); // default 2
  });

  test('node_tag requires every placed replica on a tagged node', () => {
    const nodes = [node('alpha', { tags: ['DATA'] }), node('bravo')];
    const all = base({ nodes, services: [svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-alpha'] })] });
    expect(gradeCriterion(all, c('node_tag', { tag: 'DATA' }))).toBe(true);
    const half = base({ nodes, services: [svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'] })] });
    expect(gradeCriterion(half, c('node_tag', { tag: 'DATA' }))).toBe(false);
    const none = base({ nodes, services: [svc('web', { replicas: 0, podNodes: [] })] });
    expect(gradeCriterion(none, c('node_tag', { tag: 'DATA' }))).toBe(false);
    expect(gradeCriterion(all, c('node_tag'))).toBe(false); // no tag given
  });

  test('latest', () => {
    const images = [img('img-1', 'repo-1', 1), img('img-2', 'repo-1', 2), img('img-3', 'repo-1', 3, true)];
    const old = base({ images, services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], imageId: 'img-1' })] });
    expect(gradeCriterion(old, c('latest'))).toBe(false);
    const cur = base({ images, services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], imageId: 'img-2' })] });
    expect(gradeCriterion(cur, c('latest'))).toBe(true); // a still-building v3 does not count
    const stale = base({ images, services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], imageId: 'img-2', status: 'Stale' })] });
    expect(gradeCriterion(stale, c('latest'))).toBe(false);
  });

  test('probes', () => {
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], liveness: true, readiness: true })] }), c('probes'))).toBe(true);
    expect(gradeCriterion(base({ services: [svc('web', { replicas: 1, podNodes: ['node-alpha'], liveness: true })] }), c('probes'))).toBe(false);
  });

  test('stable', () => {
    const good = svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'] });
    expect(gradeCriterion(base({ services: [good] }), c('stable'))).toBe(true);
    expect(gradeCriterion(base({ services: [{ ...good, errorRate: 0.07 }] }), c('stable'))).toBe(false);
    expect(gradeCriterion(base({ services: [{ ...good, ready: [1, 2] }] }), c('stable'))).toBe(false);
    expect(gradeCriterion(base({ services: [{ ...good, status: 'Degraded' }] }), c('stable'))).toBe(false);
    expect(gradeCriterion(base({ services: [{ ...good, affinity: 'GPU' }] }), c('stable'))).toBe(false); // misplaced
    expect(gradeCriterion(base({ services: [{ ...good, replicas: 0, ready: [0, 0] }] }), c('stable'))).toBe(false);
  });

  test('ticketMet / gradeTicket combine all criteria', () => {
    const st = base({ services: [svc('web', { replicas: 2, podNodes: ['node-alpha', 'node-bravo'], type: 'Deployment' })] });
    const t = ticket([c('running'), c('ha'), c('replicas', { n: 3 })]);
    expect(ticketMet(st, t)).toBe(false);
    expect(gradeTicket(st, t).map(g => g.met)).toEqual([true, true, false]);
    expect(gradeTicket(st, t)[1].subs).toHaveLength(3);
    expect(gradeTicket(st, t)[0].subs).toBeUndefined();
    expect(ticketMet(st, ticket([c('running'), c('ha')]))).toBe(true);
  });
});

describe('effectiveReward', () => {
  const T = CONFIG.TICKS_PER_DAY, D = CONFIG.DEADLINE_DECAY_PER_DAY, F = CONFIG.DEADLINE_DECAY_MIN;
  const t = ticket([], { reward: 1000, dueTick: 100 });
  test('on time pays in full', () => {
    expect(effectiveReward(t, 50, T, D, F)).toBe(1000);
    expect(effectiveReward(t, 100, T, D, F)).toBe(1000);
    expect(effectiveReward({ ...t, dueTick: undefined }, 9999, T, D, F)).toBe(1000);
  });
  test('one day late pays 75%', () => {
    expect(effectiveReward(t, 100 + T, T, D, F)).toBe(750);
  });
  test('never decays below the 50% floor', () => {
    expect(effectiveReward(t, 100 + 2 * T, T, D, F)).toBe(500);
    expect(effectiveReward(t, 100 + 10 * T, T, D, F)).toBe(500);
  });
});
