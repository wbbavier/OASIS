// Mulberry32 seeded PRNG — deterministic, no side effects.
// All randomness in the game engine must go through this module.

import type { PRNG } from '@/engine/types';

// ---------------------------------------------------------------------------
// FNV-1a hash: converts an arbitrary string seed to a uint32
// ---------------------------------------------------------------------------

export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    // FNV prime (32-bit): 0x01000193
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit integer
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Mulberry32 core step
// Returns [float in [0,1), next state]
// ---------------------------------------------------------------------------

function mulberry32Step(state: number): [number, number] {
  let s = (state + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1) >>> 0;
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  s = ((s ^ (s >>> 14)) >>> 0);
  const next = (s >>> 0) / 0x100000000;
  return [next, (state + 0x6d2b79f5) >>> 0];
}

// ---------------------------------------------------------------------------
// PRNG factory
// ---------------------------------------------------------------------------

export function createPRNG(seed: number): PRNG {
  let currentState: number = seed >>> 0;

  const prng: PRNG = {
    next(): number {
      const [value, nextState] = mulberry32Step(currentState);
      currentState = nextState;
      return value;
    },

    nextInt(min: number, max: number): number {
      // inclusive on both ends
      return min + Math.floor(this.next() * (max - min + 1));
    },

    fork(): PRNG {
      // Fork captures current state; both parent and fork advance independently
      return createPRNG(currentState);
    },

    get state(): number {
      return currentState;
    },
  };

  return prng;
}

export function createPRNGFromSeed(seed: string): PRNG {
  return createPRNG(hashSeed(seed));
}

export function createPRNGFromState(state: number): PRNG {
  return createPRNG(state);
}

// ---------------------------------------------------------------------------
// Weighted random selection
// ---------------------------------------------------------------------------

export function weightedChoice<T>(
  items: Array<{ value: T; weight: number }>,
  prng: PRNG
): T {
  if (items.length === 0) {
    throw new Error('weightedChoice: items array must not be empty');
  }

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('weightedChoice: total weight must be positive');
  }

  let roll = prng.next() * totalWeight;

  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.value;
    }
  }

  // Fallback to last item (handles floating-point rounding)
  return items[items.length - 1].value;
}
