// AI governor — generates orders for civs without a human player or who missed
// their turn deadline. Phase 1 stub returns empty orders.
// Full implementation in Phase 2.

import type { GameState, PlayerOrders, PRNG } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

export function generateAIOrders(
  state: GameState,
  civId: string,
  theme: ThemePackage,
  prng: PRNG
): PlayerOrders {
  // Stub: returns empty orders for the given civilization
  void theme;
  void prng;
  return {
    playerId: `ai_${civId}`,
    civilizationId: civId,
    turnNumber: state.turn,
    orders: [],
    submittedAt: new Date().toISOString(),
  };
}

export function fillMissingOrdersWithAI(
  state: GameState,
  submitted: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG
): PlayerOrders[] {
  const submittedCivIds = new Set(submitted.map((o) => o.civilizationId));
  const allOrders = [...submitted];

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    if (!civ.isEliminated && !submittedCivIds.has(civId)) {
      allOrders.push(generateAIOrders(state, civId, theme, prng.fork()));
    }
  }

  return allOrders;
}
