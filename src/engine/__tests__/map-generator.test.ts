import { describe, it, expect } from 'vitest';
import { generateMap, getNeighbors } from '@/engine/map-generator';
import { createPRNG } from '@/engine/prng';
import type { MapConfig } from '@/themes/schema';
import type { TerrainType } from '@/engine/types';

const ALL_TERRAIN_TYPES: TerrainType[] = [
  'plains', 'mountains', 'forest', 'desert', 'coast', 'sea', 'river',
];

// Minimal valid MapConfig for tests
function makeConfig(overrides: Partial<MapConfig> = {}): MapConfig {
  return {
    cols: 10,
    rows: 8,
    seaEdge: false,
    defaultTerrainWeights: {
      plains: 50,
      forest: 20,
      mountains: 10,
      desert: 10,
      coast: 5,
      river: 5,
    },
    zones: [],
    settlementAnchors: [],
    ...overrides,
  };
}

describe('generateMap — dimensions', () => {
  it('returns grid with correct row count', () => {
    const config = makeConfig({ rows: 6, cols: 8 });
    const map = generateMap(config, createPRNG(1));
    expect(map.length).toBe(6);
  });

  it('returns grid with correct column count', () => {
    const config = makeConfig({ rows: 6, cols: 8 });
    const map = generateMap(config, createPRNG(1));
    for (const row of map) {
      expect(row.length).toBe(8);
    }
  });

  it('every hex coord matches its grid position', () => {
    const config = makeConfig({ rows: 5, cols: 7 });
    const map = generateMap(config, createPRNG(2));
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        expect(map[r][c].coord).toEqual({ col: c, row: r });
      }
    }
  });
});

describe('generateMap — terrain validity', () => {
  it('every hex has a valid TerrainType', () => {
    const config = makeConfig();
    const map = generateMap(config, createPRNG(3));
    for (const row of map) {
      for (const hex of row) {
        expect(ALL_TERRAIN_TYPES).toContain(hex.terrain);
      }
    }
  });

  it('border hexes are "sea" when seaEdge: true', () => {
    const config = makeConfig({ seaEdge: true, rows: 8, cols: 10 });
    const map = generateMap(config, createPRNG(4));
    const rows = config.rows;
    const cols = config.cols;

    // Top and bottom rows
    for (let c = 0; c < cols; c++) {
      expect(map[0][c].terrain).toBe('sea');
      expect(map[rows - 1][c].terrain).toBe('sea');
    }
    // Left and right columns
    for (let r = 0; r < rows; r++) {
      expect(map[r][0].terrain).toBe('sea');
      expect(map[r][cols - 1].terrain).toBe('sea');
    }
  });

  it('border hexes are NOT forced to "sea" when seaEdge: false', () => {
    // With seaEdge false and no "sea" in weights, no sea should appear
    const config = makeConfig({
      seaEdge: false,
      defaultTerrainWeights: { plains: 100 },
    });
    const map = generateMap(config, createPRNG(5));
    for (const row of map) {
      for (const hex of row) {
        expect(hex.terrain).toBe('plains');
      }
    }
  });
});

describe('generateMap — anchor placement', () => {
  const anchors: MapConfig['settlementAnchors'] = [
    {
      id: 'capital-a',
      name: 'City A',
      type: 'capital',
      approxCol: 3,
      approxRow: 3,
      civilizationId: 'civ-a',
      isCapital: true,
      startingPopulation: 10,
      startingStability: 80,
      startingBuildings: [],
    },
    {
      id: 'city-b',
      name: 'City B',
      type: 'city',
      approxCol: 7,
      approxRow: 5,
      civilizationId: 'civ-b',
      isCapital: false,
      startingPopulation: 5,
      startingStability: 70,
      startingBuildings: ['granary'],
    },
  ];

  it('all anchors are placed exactly once', () => {
    const config = makeConfig({ settlementAnchors: anchors });
    const map = generateMap(config, createPRNG(6));

    const anchorIds = new Set<string>();
    for (const row of map) {
      for (const hex of row) {
        if (hex.settlement !== null) {
          expect(anchorIds.has(hex.settlement.id)).toBe(false);
          anchorIds.add(hex.settlement.id);
        }
      }
    }
    expect(anchorIds.has('capital-a')).toBe(true);
    expect(anchorIds.has('city-b')).toBe(true);
  });

  it('anchor hexes have correct settlement type and ownership', () => {
    const config = makeConfig({ settlementAnchors: anchors });
    const map = generateMap(config, createPRNG(7));

    for (const row of map) {
      for (const hex of row) {
        if (hex.settlement?.id === 'capital-a') {
          expect(hex.settlement.type).toBe('capital');
          expect(hex.settlement.isCapital).toBe(true);
          expect(hex.controlledBy).toBe('civ-a');
        }
        if (hex.settlement?.id === 'city-b') {
          expect(hex.settlement.type).toBe('city');
          expect(hex.settlement.isCapital).toBe(false);
          expect(hex.controlledBy).toBe('civ-b');
        }
      }
    }
  });

  it('anchor hexes are never sea or mountains', () => {
    const config = makeConfig({
      settlementAnchors: anchors,
      defaultTerrainWeights: { sea: 50, mountains: 50 },
    });
    const map = generateMap(config, createPRNG(8));

    for (const row of map) {
      for (const hex of row) {
        if (hex.settlement !== null) {
          expect(hex.terrain).not.toBe('sea');
          expect(hex.terrain).not.toBe('mountains');
        }
      }
    }
  });

  it('no two settlements share a hex', () => {
    const config = makeConfig({ settlementAnchors: anchors });
    const map = generateMap(config, createPRNG(9));

    let settlementCount = 0;
    for (const row of map) {
      for (const hex of row) {
        if (hex.settlement !== null) settlementCount++;
      }
    }
    expect(settlementCount).toBe(anchors.length);
  });

  it('anchor starting buildings are copied to settlement', () => {
    const config = makeConfig({ settlementAnchors: anchors });
    const map = generateMap(config, createPRNG(10));

    for (const row of map) {
      for (const hex of row) {
        if (hex.settlement?.id === 'city-b') {
          expect(hex.settlement.buildings).toContain('granary');
        }
      }
    }
  });
});

describe('generateMap — determinism', () => {
  it('same seed produces identical maps', () => {
    const config = makeConfig({
      settlementAnchors: [
        {
          id: 'test-capital',
          name: 'Test Capital',
          type: 'capital',
          approxCol: 4,
          approxRow: 3,
          civilizationId: 'civ-test',
          isCapital: true,
          startingPopulation: 10,
          startingStability: 80,
          startingBuildings: [],
        },
      ],
    });
    const mapA = generateMap(config, createPRNG(12345));
    const mapB = generateMap(config, createPRNG(12345));

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        expect(mapA[r][c].terrain).toBe(mapB[r][c].terrain);
        expect(mapA[r][c].controlledBy).toBe(mapB[r][c].controlledBy);
      }
    }
  });

  it('different seeds produce different maps', () => {
    const config = makeConfig();
    const mapA = generateMap(config, createPRNG(1));
    const mapB = generateMap(config, createPRNG(99999));

    let differenceFound = false;
    for (let r = 0; r < config.rows && !differenceFound; r++) {
      for (let c = 0; c < config.cols && !differenceFound; c++) {
        if (mapA[r][c].terrain !== mapB[r][c].terrain) {
          differenceFound = true;
        }
      }
    }
    expect(differenceFound).toBe(true);
  });
});

describe('generateMap — zone initial control', () => {
  it('non-anchor hexes in a zone get initialControlledBy assigned', () => {
    const config = makeConfig({
      zones: [
        {
          id: 'zone-north',
          name: 'North',
          shape: { kind: 'bounds', minCol: 0, maxCol: 4, minRow: 0, maxRow: 3 },
          terrainWeights: {},
          initialControlledBy: 'civ-north',
        },
      ],
    });
    const map = generateMap(config, createPRNG(50));

    for (let r = 0; r <= 3; r++) {
      for (let c = 0; c <= 4; c++) {
        if (map[r][c].settlement === null) {
          expect(map[r][c].controlledBy).toBe('civ-north');
        }
      }
    }
  });
});

describe('getNeighbors', () => {
  it('interior hex has 6 neighbors', () => {
    expect(getNeighbors({ col: 3, row: 3 }, 10, 10).length).toBe(6);
  });

  it('corner hex has fewer than 6 neighbors', () => {
    expect(getNeighbors({ col: 0, row: 0 }, 10, 10).length).toBeLessThan(6);
  });

  it('all returned neighbors are within bounds', () => {
    const cols = 8;
    const rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (const n of getNeighbors({ col: c, row: r }, cols, rows)) {
          expect(n.col).toBeGreaterThanOrEqual(0);
          expect(n.col).toBeLessThan(cols);
          expect(n.row).toBeGreaterThanOrEqual(0);
          expect(n.row).toBeLessThan(rows);
        }
      }
    }
  });
});
