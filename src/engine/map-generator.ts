// Anchor-constrained hex map generator.
// All functions are pure — no side effects, no randomness without a PRNG arg.

import type { Hex, HexCoord, TerrainType, PRNG, Unit, ResourceDeposit } from '@/engine/types';
import type { MapConfig, MapZone, SettlementAnchor } from '@/themes/schema';
import { weightedChoice } from '@/engine/prng';

// ---------------------------------------------------------------------------
// Neighbor offsets — odd-r offset convention
// Even rows shift left; odd rows do not shift.
// ---------------------------------------------------------------------------

const EVEN_ROW_OFFSETS: HexCoord[] = [
  { col: -1, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: -1 },
  { col: 0, row: 1 },
  { col: -1, row: -1 },
  { col: -1, row: 1 },
];

const ODD_ROW_OFFSETS: HexCoord[] = [
  { col: -1, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: -1 },
  { col: 0, row: 1 },
  { col: 1, row: -1 },
  { col: 1, row: 1 },
];

export function getNeighbors(
  coord: HexCoord,
  cols: number,
  rows: number
): HexCoord[] {
  const offsets = coord.row % 2 === 0 ? EVEN_ROW_OFFSETS : ODD_ROW_OFFSETS;
  const neighbors: HexCoord[] = [];
  for (const offset of offsets) {
    const nc = coord.col + offset.col;
    const nr = coord.row + offset.row;
    if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) {
      neighbors.push({ col: nc, row: nr });
    }
  }
  return neighbors;
}

// ---------------------------------------------------------------------------
// Zone lookup — map "col,row" → MapZone
// ---------------------------------------------------------------------------

function buildZoneLookup(
  zones: MapZone[],
  cols: number,
  rows: number
): Map<string, MapZone> {
  const lookup = new Map<string, MapZone>();

  for (const zone of zones) {
    const shape = zone.shape;
    if (shape.kind === 'bounds') {
      const minCol = Math.max(0, shape.minCol);
      const maxCol = Math.min(cols - 1, shape.maxCol);
      const minRow = Math.max(0, shape.minRow);
      const maxRow = Math.min(rows - 1, shape.maxRow);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          lookup.set(`${c},${r}`, zone);
        }
      }
    } else {
      for (const hex of shape.hexes) {
        if (hex.col >= 0 && hex.col < cols && hex.row >= 0 && hex.row < rows) {
          lookup.set(`${hex.col},${hex.row}`, zone);
        }
      }
    }
  }

  return lookup;
}

// ---------------------------------------------------------------------------
// Anchor placement — snap to grid, BFS outward if position is taken
// ---------------------------------------------------------------------------

function placeAnchors(
  anchors: SettlementAnchor[],
  cols: number,
  rows: number
): Map<string, SettlementAnchor> {
  const placed = new Map<string, SettlementAnchor>();

  for (const anchor of anchors) {
    const desiredCol = Math.max(0, Math.min(cols - 1, Math.round(anchor.approxCol)));
    const desiredRow = Math.max(0, Math.min(rows - 1, Math.round(anchor.approxRow)));
    const key = `${desiredCol},${desiredRow}`;

    if (!placed.has(key)) {
      placed.set(key, anchor);
      continue;
    }

    // BFS outward to find a free position
    const visited = new Set<string>([key]);
    const queue: HexCoord[] = [{ col: desiredCol, row: desiredRow }];
    let found = false;

    while (queue.length > 0 && !found) {
      const current = queue.shift()!;
      const neighbors = getNeighbors(current, cols, rows);
      for (const neighbor of neighbors) {
        const nKey = `${neighbor.col},${neighbor.row}`;
        if (!visited.has(nKey)) {
          visited.add(nKey);
          if (!placed.has(nKey)) {
            placed.set(nKey, anchor);
            found = true;
            break;
          }
          queue.push(neighbor);
        }
      }
    }

    if (!found) {
      throw new Error(
        `Could not place anchor "${anchor.id}" — no free hex found in BFS`
      );
    }
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Terrain weight merging
// ---------------------------------------------------------------------------

const ALL_TERRAINS: TerrainType[] = [
  'plains', 'mountains', 'forest', 'desert', 'coast', 'sea', 'river',
];

function mergeWeights(
  defaults: Partial<Record<TerrainType, number>>,
  overrides: Partial<Record<TerrainType, number>>,
  excludeSea: boolean,
  excludeMountains: boolean
): Array<{ value: TerrainType; weight: number }> {
  const merged: Partial<Record<TerrainType, number>> = { ...defaults, ...overrides };

  const items: Array<{ value: TerrainType; weight: number }> = [];
  for (const terrain of ALL_TERRAINS) {
    if (excludeSea && terrain === 'sea') continue;
    if (excludeMountains && terrain === 'mountains') continue;
    const weight = merged[terrain] ?? 0;
    if (weight > 0) {
      items.push({ value: terrain, weight });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Main map generator
// ---------------------------------------------------------------------------

export function generateMap(config: MapConfig, prng: PRNG): Hex[][] {
  const { cols, rows } = config;

  const zoneLookup = buildZoneLookup(config.zones, cols, rows);
  const anchorPlacement = placeAnchors(config.settlementAnchors, cols, rows);

  // Initialize grid
  const grid: Hex[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Hex[] = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        coord: { col: c, row: r },
        terrain: 'plains', // placeholder — filled below
        settlement: null,
        controlledBy: null,
        units: [] as Unit[],
        resources: [] as ResourceDeposit[],
        exploredBy: [],
      });
    }
    grid.push(row);
  }

  // Fill terrain
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      const zone = zoneLookup.get(key);
      const isAnchor = anchorPlacement.has(key);

      const terrainItems = mergeWeights(
        config.defaultTerrainWeights,
        zone?.terrainWeights ?? {},
        isAnchor, // anchor hexes exclude sea
        isAnchor  // anchor hexes exclude mountains
      );

      if (terrainItems.length === 0) {
        grid[r][c].terrain = 'plains';
      } else {
        grid[r][c].terrain = weightedChoice(terrainItems, prng);
      }
    }
  }

  // Apply sea border
  if (config.seaEdge) {
    for (let c = 0; c < cols; c++) {
      grid[0][c].terrain = 'sea';
      grid[rows - 1][c].terrain = 'sea';
    }
    for (let r = 0; r < rows; r++) {
      grid[r][0].terrain = 'sea';
      grid[r][cols - 1].terrain = 'sea';
    }
  }

  // Place anchors — assign settlements and ownership
  for (const [key, anchor] of anchorPlacement) {
    const [colStr, rowStr] = key.split(',');
    const c = parseInt(colStr, 10);
    const r = parseInt(rowStr, 10);

    grid[r][c].settlement = {
      id: anchor.id,
      name: anchor.name,
      type: anchor.type,
      population: anchor.startingPopulation,
      stability: anchor.startingStability,
      buildings: [...anchor.startingBuildings],
      isCapital: anchor.isCapital,
    };
    grid[r][c].controlledBy = anchor.civilizationId;
  }

  // Apply zone initial control to non-anchor hexes
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${c},${r}`;
      if (!anchorPlacement.has(key)) {
        const zone = zoneLookup.get(key);
        if (zone?.initialControlledBy != null) {
          grid[r][c].controlledBy = zone.initialControlledBy;
        }
      }
    }
  }

  return grid;
}

// Alias — called at game creation
export function initializeMap(config: MapConfig, prng: PRNG): Hex[][] {
  return generateMap(config, prng);
}
