// AI governor — generates orders for civs without a human player or who missed
// their turn deadline. Phase 2c: heuristic orders with no aggressive expansion.
// Pure function: no side effects, no async. Accepts submittedAt as a parameter
// instead of calling new Date() internally.

import type { GameState, PlayerOrders, PRNG, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Heuristic order generation
// ---------------------------------------------------------------------------

export function generateAIOrders(
  state: GameState,
  civId: string,
  theme: ThemePackage,
  prng: PRNG,
  submittedAt: string,
): PlayerOrders {
  void prng; // reserved for future stochastic heuristics

  const civ = state.civilizations[civId];
  const orders: AnyOrder[] = [];

  if (!civ || civ.isEliminated) {
    return {
      playerId: `ai_${civId}`,
      civilizationId: civId,
      turnNumber: state.turn,
      orders: [],
      submittedAt,
    };
  }

  // Heuristic 1: Research the cheapest available tech
  const availableTechs = theme.techTree.filter((tech) => {
    if (civ.completedTechs.includes(tech.id)) return false;
    return tech.prerequisites.every((p) => civ.completedTechs.includes(p));
  });

  if (availableTechs.length > 0) {
    const cheapest = availableTechs.reduce((a, b) => (a.cost <= b.cost ? a : b));
    orders.push({
      kind: 'research',
      techId: cheapest.id,
      pointsAllocated: 20,
    });
  }

  // Heuristic 2: Build a granary when grain is low and the civ can afford it
  const granaryDef = theme.buildings.find((b) => b.id === 'granary');
  if (
    granaryDef !== undefined &&
    (civ.resources['grain'] ?? 0) < 20 &&
    (civ.resources['dinars'] ?? 0) >= granaryDef.cost
  ) {
    // Find a settlement controlled by this civ
    const allHexes = state.map.flat();
    const controlledSettlement = allHexes.find(
      (h) => h.controlledBy === civId && h.settlement !== null,
    );
    if (controlledSettlement && controlledSettlement.settlement !== null) {
      orders.push({
        kind: 'construction',
        settlementId: controlledSettlement.settlement.id,
        buildingDefinitionId: 'granary',
      });
    }
  }

  return {
    playerId: `ai_${civId}`,
    civilizationId: civId,
    turnNumber: state.turn,
    orders,
    submittedAt,
  };
}

// ---------------------------------------------------------------------------
// Fill missing orders for all civs that did not submit
// ---------------------------------------------------------------------------

export function fillMissingOrdersWithAI(
  state: GameState,
  submitted: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG,
  submittedAt: string,
): PlayerOrders[] {
  const submittedCivIds = new Set(submitted.map((o) => o.civilizationId));
  const allOrders = [...submitted];

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    if (!civ.isEliminated && !submittedCivIds.has(civId)) {
      allOrders.push(generateAIOrders(state, civId, theme, prng.fork(), submittedAt));
    }
  }

  return allOrders;
}
