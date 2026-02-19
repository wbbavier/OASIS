// Diplomacy resolution — Phase 1 stub.
// Full implementation in Phase 2.

import type { GameState, PlayerOrders } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

export function resolveDiplomacy(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage
): GameState {
  // Stub: no diplomacy resolution yet
  void orders;
  void theme;
  return state;
}
