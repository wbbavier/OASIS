import { describe, it, expect } from 'vitest';
import {
  getCurrentSeasonEffect,
  calculateTerrainYieldForHex,
  calculateBuildingEffects,
  calculateUnitUpkeepCost,
  applyResourceInteractions,
  resolveEconomy,
} from '@/engine/economy';
import type { GameState, Hex, Unit, CivilizationState } from '@/engine/types';
import type { ThemePackage, ResourceDefinition, TurnCycleEffect } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGrainResource(): ResourceDefinition {
  return {
    id: 'grain',
    name: 'Grain',
    description: '',
    baseYield: 0,
    terrainYields: { plains: 3, river: 4, forest: 1 },
  };
}

function makeDinarsResource(): ResourceDefinition {
  return {
    id: 'dinars',
    name: 'Dinars',
    description: '',
    baseYield: 0,
    terrainYields: { coast: 3, river: 2 },
  };
}

function makeMinimalTheme(): ThemePackage {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    source: '',
    civilizations: [],
    map: {
      cols: 4,
      rows: 4,
      seaEdge: false,
      defaultTerrainWeights: { plains: 100 },
      zones: [],
      settlementAnchors: [],
    },
    resources: [makeGrainResource(), makeDinarsResource()],
    techTree: [],
    buildings: [
      {
        id: 'granary',
        name: 'Granary',
        description: '',
        cost: 30,
        upkeep: 2,
        effects: [{ resourceId: 'grain', delta: 4 }],
        prerequisiteTech: null,
        maxPerSettlement: 2,
      },
      {
        id: 'mosque',
        name: 'Mosque',
        description: '',
        cost: 40,
        upkeep: 3,
        effects: [{ resourceId: 'stability', delta: 5 }],
        prerequisiteTech: null,
        maxPerSettlement: 1,
      },
      {
        id: 'market',
        name: 'Market',
        description: '',
        cost: 35,
        upkeep: 3,
        effects: [
          { resourceId: 'dinars', delta: 5 },
          { resourceId: 'stability', delta: 2 },
        ],
        prerequisiteTech: null,
        maxPerSettlement: 2,
      },
    ],
    units: [
      {
        id: 'spearman',
        name: 'Spearman',
        description: '',
        cost: 20,
        upkeep: 2,
        strength: 3,
        morale: 4,
        moves: 2,
        prerequisiteTech: null,
        canGarrison: true,
        flavor: '',
      },
      {
        id: 'cavalry',
        name: 'Cavalry',
        description: '',
        cost: 35,
        upkeep: 4,
        strength: 5,
        morale: 5,
        moves: 3,
        prerequisiteTech: null,
        canGarrison: false,
        flavor: '',
      },
    ],
    events: [],
    diplomacyOptions: [],
    victoryConditions: [],
    defeatConditions: [],
    mechanics: {
      tensionAxes: [],
      combatModifiers: { plains: 1.0, mountains: 0.8, forest: 0.9 },
      resourceInteractions: [
        { sourceId: 'grain', targetId: 'dinars', multiplier: 0.1 },
      ],
      turnCycleLength: 4,
      turnCycleNames: ['spring', 'summer', 'autumn', 'winter'],
      turnCycleEffects: [
        { phase: 'spring', resourceModifiers: { grain: 1.2, horses: 1.1 }, combatModifier: 0, stabilityModifier: 3 },
        { phase: 'summer', resourceModifiers: { soldiers: 1.1 }, combatModifier: 5, stabilityModifier: 0 },
        { phase: 'autumn', resourceModifiers: { grain: 1.3 }, combatModifier: 0, stabilityModifier: 2 },
        { phase: 'winter', resourceModifiers: { grain: 0.75 }, combatModifier: -5, stabilityModifier: -5 },
      ],
    },
    flavor: { turnName: 'Turn', currencyName: 'Dinars', eraNames: [], settingDescription: '' },
  };
}

function makeHex(
  col: number,
  row: number,
  terrain: Hex['terrain'],
  controlledBy: string | null,
  units: Unit[] = [],
  settlement: Hex['settlement'] = null,
): Hex {
  return {
    coord: { col, row },
    terrain,
    controlledBy,
    units,
    settlement,
    resources: [],
    exploredBy: [],
  };
}

function makeCiv(
  id: string,
  resources: Record<string, number> = {},
  stability = 50,
): CivilizationState {
  return {
    id,
    playerId: null,
    resources,
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability,
    diplomaticRelations: {},
    tensionAxes: {},
    isEliminated: false,
    turnsMissingOrders: 0,
  };
}

function makeUnit(
  id: string,
  civId: string,
  definitionId = 'spearman',
): Unit {
  return {
    id,
    definitionId,
    civilizationId: civId,
    strength: 3,
    morale: 4,
    movesRemaining: 2,
    isGarrisoned: false,
  };
}

function makeGameState(
  map: Hex[][],
  civs: Record<string, CivilizationState>,
  turn = 1,
): GameState {
  return {
    gameId: 'test-game',
    themeId: 'test',
    turn,
    phase: 'active',
    map,
    civilizations: civs,
    activeEvents: [],
    turnHistory: [],
    rngSeed: 1,
    rngState: 1,
    config: {
      maxTurns: null,
      turnDeadlineDays: 7,
      allowAIGovernor: false,
      difficultyModifier: 1,
      fogOfWar: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: null,
  };
}

// ---------------------------------------------------------------------------
// getCurrentSeasonEffect
// ---------------------------------------------------------------------------

describe('getCurrentSeasonEffect', () => {
  it('returns spring for turn 1', () => {
    const theme = makeMinimalTheme();
    const effect = getCurrentSeasonEffect(1, theme);
    expect(effect?.phase).toBe('spring');
  });

  it('returns summer for turn 2', () => {
    const theme = makeMinimalTheme();
    const effect = getCurrentSeasonEffect(2, theme);
    expect(effect?.phase).toBe('summer');
  });

  it('returns winter for turn 4', () => {
    const theme = makeMinimalTheme();
    const effect = getCurrentSeasonEffect(4, theme);
    expect(effect?.phase).toBe('winter');
  });

  it('wraps back to spring on turn 5', () => {
    const theme = makeMinimalTheme();
    const effect = getCurrentSeasonEffect(5, theme);
    expect(effect?.phase).toBe('spring');
  });

  it('returns null when turnCycleEffects is empty', () => {
    const theme = makeMinimalTheme();
    theme.mechanics.turnCycleEffects = [];
    expect(getCurrentSeasonEffect(1, theme)).toBeNull();
  });

  it('returns null when turnCycleLength is 0', () => {
    const theme = makeMinimalTheme();
    theme.mechanics.turnCycleLength = 0;
    expect(getCurrentSeasonEffect(1, theme)).toBeNull();
  });

  it('has spring grain modifier 1.2', () => {
    const theme = makeMinimalTheme();
    const spring = getCurrentSeasonEffect(1, theme);
    expect(spring?.resourceModifiers['grain']).toBe(1.2);
  });

  it('has winter grain modifier 0.75', () => {
    const theme = makeMinimalTheme();
    const winter = getCurrentSeasonEffect(4, theme);
    expect(winter?.resourceModifiers['grain']).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// calculateTerrainYieldForHex
// ---------------------------------------------------------------------------

describe('calculateTerrainYieldForHex', () => {
  const grain = makeGrainResource();

  it('returns 0 for terrain with no yield for this resource', () => {
    const hex = makeHex(0, 0, 'sea', null);
    expect(calculateTerrainYieldForHex(hex, grain, null)).toBe(0);
  });

  it('returns base terrain yield with no seasonal effect', () => {
    const hex = makeHex(0, 0, 'plains', null);
    // grain: plains = 3, baseYield = 0, no season → 3 * 1.0 = 3
    expect(calculateTerrainYieldForHex(hex, grain, null)).toBe(3);
  });

  it('applies seasonal multiplier to terrain yield', () => {
    const hex = makeHex(0, 0, 'plains', null);
    const spring: TurnCycleEffect = {
      phase: 'spring',
      resourceModifiers: { grain: 1.2 },
      combatModifier: 0,
      stabilityModifier: 0,
    };
    // 3 * 1.2 = 3.6
    expect(calculateTerrainYieldForHex(hex, grain, spring)).toBeCloseTo(3.6);
  });

  it('returns higher yield for river terrain', () => {
    const hex = makeHex(0, 0, 'river', null);
    // grain: river = 4
    expect(calculateTerrainYieldForHex(hex, grain, null)).toBe(4);
  });

  it('returns 0 for resource with no yield on this terrain (coast for grain)', () => {
    const hex = makeHex(0, 0, 'coast', null);
    // grain has no coast entry
    expect(calculateTerrainYieldForHex(hex, grain, null)).toBe(0);
  });

  it('seasonal modifier of 0.75 reduces grain yield below base', () => {
    const hex = makeHex(0, 0, 'plains', null);
    const winter: TurnCycleEffect = {
      phase: 'winter',
      resourceModifiers: { grain: 0.75 },
      combatModifier: -5,
      stabilityModifier: -5,
    };
    // 3 * 0.75 = 2.25
    expect(calculateTerrainYieldForHex(hex, grain, winter)).toBeCloseTo(2.25);
  });
});

// ---------------------------------------------------------------------------
// calculateBuildingEffects
// ---------------------------------------------------------------------------

describe('calculateBuildingEffects', () => {
  it('returns zero deltas for empty building list', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects([], theme);
    expect(result.resourceDeltas).toEqual({});
    expect(result.stabilityDelta).toBe(0);
    expect(result.upkeepCost).toBe(0);
  });

  it('returns grain delta and upkeep for granary', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects(['granary'], theme);
    expect(result.resourceDeltas['grain']).toBe(4);
    expect(result.upkeepCost).toBe(2);
    expect(result.stabilityDelta).toBe(0);
  });

  it('places stability into stabilityDelta, not resourceDeltas', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects(['mosque'], theme);
    expect(result.stabilityDelta).toBe(5);
    expect(result.resourceDeltas['stability']).toBeUndefined();
    expect(result.upkeepCost).toBe(3);
  });

  it('accumulates multiple buildings', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects(['granary', 'granary'], theme);
    expect(result.resourceDeltas['grain']).toBe(8);
    expect(result.upkeepCost).toBe(4);
  });

  it('separates resource and stability effects from market', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects(['market'], theme);
    expect(result.resourceDeltas['dinars']).toBe(5);
    expect(result.stabilityDelta).toBe(2);
    expect(result.upkeepCost).toBe(3);
  });

  it('silently skips unknown building IDs', () => {
    const theme = makeMinimalTheme();
    const result = calculateBuildingEffects(['unknown-building'], theme);
    expect(result.resourceDeltas).toEqual({});
    expect(result.upkeepCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateUnitUpkeepCost
// ---------------------------------------------------------------------------

describe('calculateUnitUpkeepCost', () => {
  it('returns 0 for empty unit list', () => {
    expect(calculateUnitUpkeepCost([], makeMinimalTheme())).toBe(0);
  });

  it('returns upkeep for a single spearman', () => {
    const theme = makeMinimalTheme();
    const unit = makeUnit('u1', 'civ-a', 'spearman');
    expect(calculateUnitUpkeepCost([unit], theme)).toBe(2);
  });

  it('sums upkeep for multiple units', () => {
    const theme = makeMinimalTheme();
    const units = [
      makeUnit('u1', 'civ-a', 'spearman'),   // upkeep 2
      makeUnit('u2', 'civ-a', 'cavalry'),    // upkeep 4
    ];
    expect(calculateUnitUpkeepCost(units, theme)).toBe(6);
  });

  it('skips units with unknown definition IDs', () => {
    const theme = makeMinimalTheme();
    const unit: Unit = { ...makeUnit('u1', 'civ-a'), definitionId: 'ghost-unit' };
    expect(calculateUnitUpkeepCost([unit], theme)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyResourceInteractions
// ---------------------------------------------------------------------------

describe('applyResourceInteractions', () => {
  it('returns resources unchanged when no interactions defined', () => {
    const theme = makeMinimalTheme();
    theme.mechanics.resourceInteractions = [];
    const resources = { grain: 100, dinars: 50 };
    const result = applyResourceInteractions(resources, theme);
    expect(result.grain).toBe(100);
    expect(result.dinars).toBe(50);
  });

  it('applies grain → dinars interaction (0.1 multiplier)', () => {
    const theme = makeMinimalTheme();
    // theme has: grain → dinars at 0.1
    const resources = { grain: 100, dinars: 50 };
    const result = applyResourceInteractions(resources, theme);
    // bonus = floor(100 * 0.1) = 10
    expect(result.dinars).toBe(60);
  });

  it('floors the bonus to an integer', () => {
    const theme = makeMinimalTheme();
    // grain = 5 → bonus = floor(5 * 0.1) = floor(0.5) = 0
    const resources = { grain: 5, dinars: 10 };
    const result = applyResourceInteractions(resources, theme);
    expect(result.dinars).toBe(10); // no change (bonus rounds to 0)
  });

  it('does not modify source resource', () => {
    const theme = makeMinimalTheme();
    const resources = { grain: 100, dinars: 0 };
    const result = applyResourceInteractions(resources, theme);
    expect(result.grain).toBe(100); // source unchanged
  });

  it('creates target resource key if missing', () => {
    const theme = makeMinimalTheme();
    theme.mechanics.resourceInteractions = [
      { sourceId: 'grain', targetId: 'horses', multiplier: 0.5 },
    ];
    const resources = { grain: 20 };
    const result = applyResourceInteractions(resources, theme);
    expect(result['horses']).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// resolveEconomy — integration tests
// ---------------------------------------------------------------------------

describe('resolveEconomy — no controlled hexes', () => {
  it('does not change resources when civ controls no hexes', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', null); // no one controls this
    const civ = makeCiv('civ-a', { grain: 10, dinars: 20 });
    const state = makeGameState([[hex]], { 'civ-a': civ });

    const next = resolveEconomy(state, theme);
    // No terrain yield — but resource interactions may still apply
    // grain=10 → dinars bonus = floor(10 * 0.1) = 1 added to dinars
    expect(next.civilizations['civ-a'].resources.grain).toBe(10);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(21);
  });
});

describe('resolveEconomy — terrain yields', () => {
  it('adds grain for controlled plains hex in neutral season (summer)', () => {
    const theme = makeMinimalTheme();
    // Turn 2 = summer: no grain modifier
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ = makeCiv('civ-a', { grain: 0 });
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2);

    const next = resolveEconomy(state, theme);
    // 1 plains hex: grain yield = 3 * 1.0 = 3
    expect(next.civilizations['civ-a'].resources.grain).toBe(3);
  });

  it('applies spring modifier to grain yield', () => {
    const theme = makeMinimalTheme();
    // Turn 1 = spring: grain modifier 1.2
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ = makeCiv('civ-a', { grain: 0 });
    const state = makeGameState([[hex]], { 'civ-a': civ }, 1);

    const next = resolveEconomy(state, theme);
    // 1 plains hex: grain yield = floor(3 * 1.2) = floor(3.6) = 3
    expect(next.civilizations['civ-a'].resources.grain).toBe(3);
  });

  it('accumulates spring modifier across multiple hexes', () => {
    const theme = makeMinimalTheme();
    // Turn 1 = spring; 3 plains hexes → 3 * 3.6 = 10.8 → floor = 10
    const hexes = [
      makeHex(0, 0, 'plains', 'civ-a'),
      makeHex(1, 0, 'plains', 'civ-a'),
      makeHex(2, 0, 'plains', 'civ-a'),
    ];
    const civ = makeCiv('civ-a', { grain: 0 });
    const state = makeGameState([hexes], { 'civ-a': civ }, 1);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.grain).toBe(10);
  });

  it('does not give yield from hex controlled by another civ', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', 'civ-b');
    const civA = makeCiv('civ-a', { grain: 0 });
    const civB = makeCiv('civ-b', { grain: 0 });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB }, 2);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.grain).toBe(0);
    expect(next.civilizations['civ-b'].resources.grain).toBe(3);
  });
});

describe('resolveEconomy — building effects', () => {
  it('adds grain from granary in a controlled settlement', () => {
    const theme = makeMinimalTheme();
    const settlement: Hex['settlement'] = {
      id: 's1',
      name: 'Town',
      type: 'city',
      population: 2,
      stability: 60,
      buildings: ['granary'],
      isCapital: false,
    };
    const hex = makeHex(0, 0, 'plains', 'civ-a', [], settlement);
    const civ = makeCiv('civ-a', { grain: 0, dinars: 20 });
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2); // summer, no grain mod

    const next = resolveEconomy(state, theme);
    // plains grain yield = 3, granary grain = 4, total = 7
    // granary upkeep = 2 deducted from dinars
    expect(next.civilizations['civ-a'].resources.grain).toBe(7);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(18);
  });

  it('applies stability delta from mosque to civ stability', () => {
    const theme = makeMinimalTheme();
    const settlement: Hex['settlement'] = {
      id: 's1',
      name: 'City',
      type: 'capital',
      population: 5,
      stability: 70,
      buildings: ['mosque'],
      isCapital: true,
    };
    const hex = makeHex(0, 0, 'plains', 'civ-a', [], settlement);
    const civ = makeCiv('civ-a', { dinars: 20 }, 50);
    // Turn 1 = spring: stabilityModifier +3
    const state = makeGameState([[hex]], { 'civ-a': civ }, 1);

    const next = resolveEconomy(state, theme);
    // mosque stability +5, spring seasonal +3 → 50 + 8 = 58
    expect(next.civilizations['civ-a'].stability).toBe(58);
  });
});

describe('resolveEconomy — upkeep', () => {
  it('deducts building upkeep from dinars', () => {
    const theme = makeMinimalTheme();
    const settlement: Hex['settlement'] = {
      id: 's1',
      name: 'Town',
      type: 'city',
      population: 1,
      stability: 50,
      buildings: ['granary'], // upkeep = 2
      isCapital: false,
    };
    const hex = makeHex(0, 0, 'desert', 'civ-a', [], settlement);
    const civ = makeCiv('civ-a', { grain: 0, dinars: 10 });
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2);

    const next = resolveEconomy(state, theme);
    // desert yields 0 grain and 0 dinars from terrain
    // granary: grain +4, upkeep -2 dinars
    expect(next.civilizations['civ-a'].resources.grain).toBe(4);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(8);
  });

  it('deducts unit upkeep from dinars', () => {
    const theme = makeMinimalTheme();
    const unit = makeUnit('u1', 'civ-a', 'spearman'); // upkeep = 2
    const hex = makeHex(0, 0, 'desert', 'civ-a', [unit]);
    const civ = makeCiv('civ-a', { dinars: 10 });
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(8);
  });

  it('counts unit upkeep even when unit is on a hex not controlled by that civ', () => {
    const theme = makeMinimalTheme();
    const unit = makeUnit('u1', 'civ-a', 'spearman'); // upkeep = 2
    const hex = makeHex(0, 0, 'plains', 'civ-b', [unit]); // civ-b controls hex
    const civA = makeCiv('civ-a', { dinars: 10 });
    const civB = makeCiv('civ-b', { dinars: 10 });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB }, 2);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(8); // civ-a pays
  });

  it('resources cannot go below 0 from upkeep', () => {
    const theme = makeMinimalTheme();
    const unit = makeUnit('u1', 'civ-a', 'cavalry'); // upkeep = 4
    const hex = makeHex(0, 0, 'desert', 'civ-a', [unit]);
    const civ = makeCiv('civ-a', { dinars: 2 }); // cannot afford upkeep
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(0); // floored at 0
  });
});

describe('resolveEconomy — seasonal stability modifier', () => {
  it('applies winter stability penalty to all civs', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ = makeCiv('civ-a', {}, 50);
    const state = makeGameState([[hex]], { 'civ-a': civ }, 4); // turn 4 = winter

    const next = resolveEconomy(state, theme);
    // winter stabilityModifier = -5
    expect(next.civilizations['civ-a'].stability).toBe(45);
  });

  it('clamps stability at 100', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ = makeCiv('civ-a', {}, 99);
    const settlement: Hex['settlement'] = {
      id: 's1', name: 'T', type: 'city', population: 1,
      stability: 50, buildings: ['mosque'], isCapital: false,
    };
    const hexWithMosque = makeHex(0, 0, 'plains', 'civ-a', [], settlement);
    const state = makeGameState([[hexWithMosque]], { 'civ-a': civ }, 1); // spring: +3 seasonal, mosque: +5

    const next = resolveEconomy(state, theme);
    // 99 + 5 (mosque) + 3 (spring) = 107 → clamped to 100
    expect(next.civilizations['civ-a'].stability).toBe(100);
  });

  it('clamps stability at 0', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ = makeCiv('civ-a', {}, 3);
    const state = makeGameState([[hex]], { 'civ-a': civ }, 4); // winter: -5

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].stability).toBe(0);
  });
});

describe('resolveEconomy — eliminated civilizations', () => {
  it('does not modify eliminated civ resources', () => {
    const theme = makeMinimalTheme();
    const hex = makeHex(0, 0, 'plains', 'civ-a');
    const civ: CivilizationState = {
      ...makeCiv('civ-a', { grain: 10 }),
      isEliminated: true,
    };
    const state = makeGameState([[hex]], { 'civ-a': civ }, 2);

    const next = resolveEconomy(state, theme);
    expect(next.civilizations['civ-a'].resources.grain).toBe(10);
  });
});

describe('resolveEconomy — multiple civilizations', () => {
  it('computes yields independently for each civ', () => {
    const theme = makeMinimalTheme();
    theme.mechanics.resourceInteractions = []; // disable interactions for clarity
    const hexA = makeHex(0, 0, 'plains', 'civ-a');
    const hexB = makeHex(1, 0, 'river', 'civ-b');
    const civA = makeCiv('civ-a', { grain: 0, dinars: 0 });
    const civB = makeCiv('civ-b', { grain: 0, dinars: 0 });
    // Turn 2 = summer: no grain or dinars modifiers
    const state = makeGameState([[hexA, hexB]], { 'civ-a': civA, 'civ-b': civB }, 2);

    const next = resolveEconomy(state, theme);
    // civ-a controls plains: grain=3, dinars=0
    expect(next.civilizations['civ-a'].resources.grain).toBe(3);
    expect(next.civilizations['civ-a'].resources.dinars).toBe(0);
    // civ-b controls river: grain=4, dinars=2
    expect(next.civilizations['civ-b'].resources.grain).toBe(4);
    expect(next.civilizations['civ-b'].resources.dinars).toBe(2);
  });
});
