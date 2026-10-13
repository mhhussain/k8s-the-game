/* Deterministic RNG (mulberry32). The state carries the seed so the whole
   engine is a pure function of (state, action). */
export interface Rng {
  next(): number;                     // [0,1)
  range(a: number, b: number): number;
  int(a: number, b: number): number;  // inclusive
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  seed(): number;                     // current seed to store back in state
}

export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    seed: () => s,
  };
}

export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
