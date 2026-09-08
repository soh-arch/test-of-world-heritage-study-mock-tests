/** Mulberry32: small, fast, and reproducible from a 32-bit seed. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick called with an empty list");
  return item;
}

export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Draws up to `count` distinct items, preferring earlier pools. */
export function drawFrom<T>(rng: () => number, count: number, ...pools: readonly T[][]): T[] {
  const taken: T[] = [];
  for (const pool of pools) {
    for (const item of shuffle(rng, pool)) {
      if (taken.length >= count) return taken;
      if (!taken.includes(item)) taken.push(item);
    }
  }
  return taken;
}
