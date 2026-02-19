// Event resolution — Phase 1 stub.
// Full implementation in Phase 2.

import type { GameState, PRNG } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

export function resolveEvents(
  state: GameState,
  theme: ThemePackage,
  prng: PRNG
): GameState {
  // Stub: no event resolution yet
  void theme;
  void prng;
  return state;
}
