// Game state initializer — pure functions, no side effects.
// Called from the lobby when the creator starts the game.

import type { GameState, CivilizationState, RelationshipState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { hashSeed, createPRNG } from '@/engine/prng';
import { generateMap } from '@/engine/map-generator';

export { hashSeed };

export function generateGameSeed(gameId: string): number {
  return hashSeed(gameId);
}

// Starting diplomatic relations for the Al Rassan theme.
// All civs begin at peace; faction tensions are handled via tensionAxes.
const AL_RASSAN_CIV_IDS = ['ragosa', 'cartada', 'valledo', 'ruenda', 'kindath'];

const AL_RASSAN_RELATIONS: Record<string, Record<string, RelationshipState>> = (() => {
  const relations: Record<string, Record<string, RelationshipState>> = {};
  for (const a of AL_RASSAN_CIV_IDS) {
    relations[a] = {};
    for (const b of AL_RASSAN_CIV_IDS) {
      if (a !== b) {
        relations[a][b] = 'peace';
      }
    }
  }
  return relations;
})();

export interface PlayerMapping {
  civId: string;
  playerId: string | null;
}

export function initializeGameState(
  gameId: string,
  theme: ThemePackage,
  playerMappings: PlayerMapping[],
  seed: number,
  createdAt: string
): GameState {
  const prng = createPRNG(seed);
  const map = generateMap(theme.map, prng);

  const playerMap = new Map<string, string | null>(
    playerMappings.map((pm) => [pm.civId, pm.playerId])
  );

  const civilizations: Record<string, CivilizationState> = {};

  for (const civDef of theme.civilizations) {
    const startingRelations: Record<string, RelationshipState> =
      theme.id === 'al-rassan'
        ? { ...(AL_RASSAN_RELATIONS[civDef.id] ?? {}) }
        : Object.fromEntries(
            theme.civilizations
              .filter((c) => c.id !== civDef.id)
              .map((c) => [c.id, 'peace' as RelationshipState])
          );

    const startingTensionAxes: Record<string, number> = {};
    for (const axis of theme.mechanics.tensionAxes) {
      startingTensionAxes[axis.id] = 0;
    }

    civilizations[civDef.id] = {
      id: civDef.id,
      playerId: playerMap.get(civDef.id) ?? null,
      resources: { ...civDef.startingResources },
      techProgress: {},
      completedTechs: [...civDef.startingTechs],
      culturalInfluence: 0,
      stability: 80,
      diplomaticRelations: startingRelations,
      tensionAxes: startingTensionAxes,
      isEliminated: false,
      turnsMissingOrders: 0,
    };
  }

  return {
    gameId,
    themeId: theme.id,
    turn: 1,
    phase: 'active',
    map,
    civilizations,
    activeEvents: [],
    turnHistory: [],
    rngSeed: seed,
    rngState: prng.state,
    config: {
      maxTurns: null,
      turnDeadlineDays: 7,
      allowAIGovernor: true,
      difficultyModifier: 1,
      fogOfWar: true,
    },
    createdAt,
    lastResolvedAt: null,
  };
}
