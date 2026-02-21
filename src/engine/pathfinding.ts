// Pathfinding — BFS reachable-hex computation.
// Pure function: no side effects, no randomness.

import type { Hex, HexCoord } from '@/engine/types';
import { getNeighbors } from '@/engine/map-generator';

/**
 * BFS from `from` up to `maxSteps` steps.
 * Sea hexes are impassable. Returns all reachable coords (excludes start).
 */
export function getReachableCoords(
  map: Hex[][],
  from: HexCoord,
  maxSteps: number,
): HexCoord[] {
  if (maxSteps <= 0) return [];

  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;

  // Build a coord→hex lookup for fast access
  const hexLookup = new Map<string, Hex>();
  for (const row of map) {
    for (const hex of row) {
      hexLookup.set(`${hex.coord.col},${hex.coord.row}`, hex);
    }
  }

  const visited = new Set<string>();
  const startKey = `${from.col},${from.row}`;
  visited.add(startKey);

  const queue: Array<{ coord: HexCoord; stepsLeft: number }> = [
    { coord: from, stepsLeft: maxSteps },
  ];

  const reachable: HexCoord[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.stepsLeft <= 0) continue;

    const neighbors = getNeighbors(current.coord, cols, rows);
    for (const neighbor of neighbors) {
      const key = `${neighbor.col},${neighbor.row}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const hex = hexLookup.get(key);
      if (!hex || hex.terrain === 'sea') continue;

      reachable.push(neighbor);
      if (current.stepsLeft > 1) {
        queue.push({ coord: neighbor, stepsLeft: current.stepsLeft - 1 });
      }
    }
  }

  return reachable;
}

/**
 * BFS from `from` to `to`, returning the ordered path (excluding start).
 * Sea hexes are impassable. Returns null if no path exists or `to` is not
 * within `maxSteps`.
 */
export function getPathTo(
  map: Hex[][],
  from: HexCoord,
  to: HexCoord,
  maxSteps: number,
): HexCoord[] | null {
  if (maxSteps <= 0) return null;
  if (from.col === to.col && from.row === to.row) return [];

  const rows = map.length;
  const cols = rows > 0 ? (map[0]?.length ?? 0) : 0;

  const hexLookup = new Map<string, Hex>();
  for (const row of map) {
    for (const hex of row) {
      hexLookup.set(`${hex.coord.col},${hex.coord.row}`, hex);
    }
  }

  const startKey = `${from.col},${from.row}`;
  const targetKey = `${to.col},${to.row}`;
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();
  const depth = new Map<string, number>();
  depth.set(startKey, 0);

  const queue: HexCoord[] = [from];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.col},${current.row}`;
    const currentDepth = depth.get(currentKey) ?? 0;

    if (currentDepth >= maxSteps) continue;

    const neighbors = getNeighbors(current, cols, rows);
    for (const neighbor of neighbors) {
      const nKey = `${neighbor.col},${neighbor.row}`;
      if (visited.has(nKey)) continue;
      visited.add(nKey);

      const hex = hexLookup.get(nKey);
      if (!hex || hex.terrain === 'sea') continue;

      parent.set(nKey, currentKey);
      depth.set(nKey, currentDepth + 1);

      if (nKey === targetKey) {
        // Reconstruct path
        const path: HexCoord[] = [];
        let step = targetKey;
        while (step !== startKey) {
          const [sc, sr] = step.split(',').map(Number);
          path.unshift({ col: sc, row: sr });
          step = parent.get(step)!;
        }
        return path;
      }

      queue.push(neighbor);
    }
  }

  return null;
}
