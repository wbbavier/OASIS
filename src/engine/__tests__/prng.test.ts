import { describe, it, expect } from 'vitest';
import {
  createPRNG,
  createPRNGFromSeed,
  hashSeed,
  weightedChoice,
} from '@/engine/prng';

describe('PRNG — createPRNG', () => {
  it('same numeric seed produces identical sequence', () => {
    const a = createPRNG(42);
    const b = createPRNG(42);
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds produce different sequences', () => {
    const a = createPRNG(1);
    const b = createPRNG(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() always returns values in [0, 1)', () => {
    const prng = createPRNG(999);
    for (let i = 0; i < 1000; i++) {
      const v = prng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) always returns values in [min, max] inclusive', () => {
    const prng = createPRNG(777);
    for (let i = 0; i < 500; i++) {
      const v = prng.nextInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('nextInt works when min === max', () => {
    const prng = createPRNG(123);
    for (let i = 0; i < 20; i++) {
      expect(prng.nextInt(5, 5)).toBe(5);
    }
  });

  it('fork() produces identical sequence to parent from same state', () => {
    const parent = createPRNG(555);
    // Advance parent a few steps
    parent.next();
    parent.next();

    const fork = parent.fork();

    // From this point, both should produce the same sequence
    const fromParent = Array.from({ length: 10 }, () => parent.next());
    const fromFork = Array.from({ length: 10 }, () => fork.next());
    expect(fromParent).toEqual(fromFork);
  });

  it('fork() advances independently from parent', () => {
    const parent = createPRNG(333);
    const fork = parent.fork();

    // Advancing the fork should not affect parent state
    for (let i = 0; i < 5; i++) fork.next();

    // Parent still produces its original sequence from this point
    const parentSeq = Array.from({ length: 5 }, () => parent.next());
    const fresh = createPRNG(333);
    const freshSeq = Array.from({ length: 5 }, () => fresh.next());
    expect(parentSeq).toEqual(freshSeq);
  });

  it('state property reflects current state after advances', () => {
    const prng = createPRNG(100);
    prng.next();
    prng.next();
    const stateAfterTwo = prng.state;

    const restored = createPRNG(stateAfterTwo);
    // From the captured state, both should diverge identically
    // (state is raw — we just verify it's a number and changes)
    expect(typeof stateAfterTwo).toBe('number');
    expect(stateAfterTwo).not.toBe(100);

    // Restoring from state gives same next values
    const fromRestored = Array.from({ length: 5 }, () => restored.next());
    const fromOriginal = Array.from({ length: 5 }, () => prng.next());
    expect(fromRestored).toEqual(fromOriginal);
  });
});

describe('PRNG — hashSeed', () => {
  it('same string always produces same number', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(hashSeed('al-rassan')).toBe(hashSeed('al-rassan'));
  });

  it('different strings produce different hashes', () => {
    const hashes = ['a', 'b', 'ab', 'ba', 'hello', 'world'].map(hashSeed);
    const unique = new Set(hashes);
    expect(unique.size).toBe(hashes.length);
  });

  it('returns a uint32 (0 to 2^32-1)', () => {
    for (const s of ['', 'seed', '0', 'game-1', 'OASIS']) {
      const h = hashSeed(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe('PRNG — createPRNGFromSeed', () => {
  it('same string seed → identical sequences', () => {
    const a = createPRNGFromSeed('my-game');
    const b = createPRNGFromSeed('my-game');
    for (let i = 0; i < 15; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different string seeds → different sequences', () => {
    const a = createPRNGFromSeed('seed-A');
    const b = createPRNGFromSeed('seed-B');
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
});

describe('weightedChoice', () => {
  it('throws on empty array', () => {
    const prng = createPRNG(1);
    expect(() => weightedChoice([], prng)).toThrow();
  });

  it('always returns the only item when there is one', () => {
    const prng = createPRNG(1);
    for (let i = 0; i < 10; i++) {
      expect(weightedChoice([{ value: 'only', weight: 1 }], prng)).toBe('only');
    }
  });

  it('respects weights — heavily weighted item appears much more often', () => {
    const prng = createPRNG(42);
    const counts: Record<string, number> = { rare: 0, common: 0 };
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const result = weightedChoice(
        [
          { value: 'rare', weight: 1 },
          { value: 'common', weight: 99 },
        ],
        prng
      );
      counts[result]++;
    }
    expect(counts['common']).toBeGreaterThan(counts['rare'] * 5);
  });

  it('returns all possible values given enough samples', () => {
    const prng = createPRNG(7);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(
        weightedChoice(
          [
            { value: 'a', weight: 1 },
            { value: 'b', weight: 1 },
            { value: 'c', weight: 1 },
          ],
          prng
        )
      );
    }
    expect(seen.has('a')).toBe(true);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });
});
