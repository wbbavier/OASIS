// Game state initializer — pure functions, no side effects.
// Called from the lobby when the creator starts the game.

import type { GameState, CivilizationState, RelationshipState, Unit } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { hashSeed, createPRNG } from '@/engine/prng';
import { generateMap, getNeighbors } from '@/engine/map-generator';

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
  const rawMap = generateMap(theme.map, prng);

  // Deep-copy the map so we can place units and initialize fog of war
  const map = rawMap.map((row) => row.map((hex) => ({ ...hex, units: [...hex.units], exploredBy: [...hex.exploredBy] })));

  const playerMap = new Map<string, string | null>(
    playerMappings.map((pm) => [pm.civId, pm.playerId])
  );

  const civilizations: Record<string, CivilizationState> = {};

  for (const civDef of theme.civilizations) {
    // Skip Muwardi at game init — they are spawned dynamically by the invasion mechanic
    if (civDef.id === 'muwardi') continue;

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

    // Calculate starting stability from the average of this civ's settlement stabilities
    const civAnchors = theme.map.settlementAnchors.filter(
      (a) => a.civilizationId === civDef.id,
    );
    const startingStability =
      civAnchors.length > 0
        ? Math.round(
            civAnchors.reduce((sum, a) => sum + a.startingStability, 0) / civAnchors.length,
          )
        : 70; // fallback

    civilizations[civDef.id] = {
      id: civDef.id,
      playerId: playerMap.get(civDef.id) ?? null,
      resources: { ...civDef.startingResources },
      techProgress: {},
      completedTechs: [...civDef.startingTechs],
      culturalInfluence: 0,
      stability: startingStability,
      diplomaticRelations: startingRelations,
      tensionAxes: startingTensionAxes,
      isEliminated: false,
      turnsMissingOrders: 0,
      turnsAtZeroStability: 0,
    };
  }

  // Place starting units on each civ's capital and initialize fog of war
  const mapRows = map.length;
  const mapCols = map[0]?.length ?? 0;

  for (const civDef of theme.civilizations) {
    // Skip Muwardi — they have no settlements or starting units
    if (civDef.id === 'muwardi') continue;

    // Find the capital hex for this civ
    let capitalRow = -1;
    let capitalCol = -1;
    outer: for (let r = 0; r < mapRows; r++) {
      for (let c = 0; c < mapCols; c++) {
        const h = map[r]?.[c];
        if (h && h.controlledBy === civDef.id && h.settlement?.isCapital) {
          capitalRow = r;
          capitalCol = c;
          break outer;
        }
      }
    }
    if (capitalRow === -1) continue;

    // Find a unit type appropriate for this civ's starting techs
    const civTechs = civilizations[civDef.id]?.completedTechs ?? civDef.startingTechs;
    const unitDef =
      theme.units.find(
        (u) => u.prerequisiteTech === null || civTechs.includes(u.prerequisiteTech),
      ) ?? theme.units[0];
    const startingUnits: Unit[] = unitDef
      ? [
          {
            id: `unit-start-${civDef.id}-1`,
            definitionId: unitDef.id,
            civilizationId: civDef.id,
            strength: unitDef.strength,
            morale: unitDef.morale,
            movesRemaining: unitDef.moves,
            isGarrisoned: true,
          },
          {
            id: `unit-start-${civDef.id}-2`,
            definitionId: unitDef.id,
            civilizationId: civDef.id,
            strength: unitDef.strength,
            morale: unitDef.morale,
            movesRemaining: unitDef.moves,
            isGarrisoned: true,
          },
        ]
      : [];

    const capitalHex = map[capitalRow]?.[capitalCol];
    if (capitalHex) {
      map[capitalRow][capitalCol] = { ...capitalHex, units: startingUnits };
    }

    // Initialize fog of war: mark capital + neighbors as explored by this civ
    const coordsToExplore = [
      { col: capitalCol, row: capitalRow },
      ...getNeighbors({ col: capitalCol, row: capitalRow }, mapCols, mapRows),
    ];
    for (const coord of coordsToExplore) {
      const h = map[coord.row]?.[coord.col];
      if (h && !h.exploredBy.includes(civDef.id)) {
        map[coord.row][coord.col] = {
          ...h,
          exploredBy: [...h.exploredBy, civDef.id],
        };
      }
    }
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
      fogOfWar: false,
    },
    createdAt,
    lastResolvedAt: null,
  };
}
