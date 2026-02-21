import { describe, it, expect } from 'vitest';
import { getReachableCoords, getPathTo } from '@/engine/pathfinding';
import type { Hex, HexCoord } from '@/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHex(col: number, row: number, terrain: string = 'plains'): Hex {
  return {
    coord: { col, row },
    terrain: terrain as Hex['terrain'],
    settlement: null,
    controlledBy: null,
    units: [],
    resources: [],
    exploredBy: [],
  };
}

/**
 * Build a small 4x4 hex grid for testing.
 * All hexes are plains unless overridden.
 */
function makeMap(overrides?: Record<string, string>): Hex[][] {
  const map: Hex[][] = [];
  for (let r = 0; r < 4; r++) {
    const row: Hex[] = [];
    for (let c = 0; c < 4; c++) {
      const key = `${c},${r}`;
      row.push(makeHex(c, r, overrides?.[key] ?? 'plains'));
    }
    map.push(row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getPathTo', () => {
  it('returns an empty array when from === to', () => {
    const map = makeMap();
    const result = getPathTo(map, { col: 1, row: 1 }, { col: 1, row: 1 }, 3);
    expect(result).toEqual([]);
  });

  it('finds a path to an adjacent hex', () => {
    const map = makeMap();
    const result = getPathTo(map, { col: 1, row: 0 }, { col: 2, row: 0 }, 3);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0]).toEqual({ col: 2, row: 0 });
  });

  it('returns null when target is blocked by sea', () => {
    // Block all hexes around (3,3) with sea except (2,3) which is also sea
    const map = makeMap({
      '2,2': 'sea', '3,2': 'sea',
      '2,3': 'sea', '3,3': 'plains',
    });
    // Try to reach (3,3) from (0,0) — blocked by sea wall
    const result = getPathTo(map, { col: 0, row: 0 }, { col: 3, row: 3 }, 20);
    expect(result).toBeNull();
  });

  it('returns null when maxSteps is too small to reach target', () => {
    const map = makeMap();
    // (0,0) to (3,3) requires more than 1 step
    const result = getPathTo(map, { col: 0, row: 0 }, { col: 3, row: 3 }, 1);
    expect(result).toBeNull();
  });

  it('finds a multi-step path', () => {
    const map = makeMap();
    const result = getPathTo(map, { col: 0, row: 0 }, { col: 2, row: 2 }, 10);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    // Last step should be the target
    expect(result![result!.length - 1]).toEqual({ col: 2, row: 2 });
  });

  it('returns null when maxSteps is 0', () => {
    const map = makeMap();
    const result = getPathTo(map, { col: 0, row: 0 }, { col: 1, row: 0 }, 0);
    expect(result).toBeNull();
  });
});

describe('getReachableCoords', () => {
  it('returns adjacent hexes with maxSteps=1', () => {
    const map = makeMap();
    const result = getReachableCoords(map, { col: 1, row: 1 }, 1);
    expect(result.length).toBeGreaterThan(0);
    // All results should be adjacent to (1,1)
    for (const coord of result) {
      const dist = Math.abs(coord.col - 1) + Math.abs(coord.row - 1);
      expect(dist).toBeLessThanOrEqual(2);
    }
  });

  it('excludes sea hexes', () => {
    const map = makeMap({ '2,0': 'sea' });
    const result = getReachableCoords(map, { col: 1, row: 0 }, 3);
    expect(result.some((c) => c.col === 2 && c.row === 0)).toBe(false);
  });
});
