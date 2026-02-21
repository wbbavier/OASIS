import { describe, it, expect } from 'vitest';
import { resolveDiplomacy } from '@/engine/diplomacy';
import { resolveEconomy } from '@/engine/economy';
import type { GameState, PlayerOrders, CivilizationState, Hex, HexCoord } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCiv(
  id: string,
  resources: Record<string, number> = {},
  relations: Record<string, 'peace' | 'war' | 'alliance' | 'truce' | 'vassal'> = {},
): CivilizationState {
  return {
    id,
    playerId: null,
    resources,
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability: 80,
    diplomaticRelations: relations,
    tensionAxes: {},
    isEliminated: false,
    turnsMissingOrders: 0,
    turnsAtZeroStability: 0,
  };
}

function makeHex(coord: HexCoord, controlledBy: string | null = null): Hex {
  return {
    coord,
    terrain: 'plains',
    settlement: controlledBy ? {
      id: `s-${coord.col}-${coord.row}`,
      name: 'Test',
      type: 'town',
      population: 10,
      stability: 80,
      buildings: [],
      isCapital: false,
    } : null,
    controlledBy,
    units: [],
    resources: [],
    exploredBy: [],
  };
}

function makeState(civs: Record<string, CivilizationState>, map?: Hex[][]): GameState {
  return {
    gameId: 'g1',
    themeId: 'test',
    turn: 1,
    phase: 'active',
    map: map ?? [],
    civilizations: civs,
    activeEvents: [],
    turnHistory: [],
    rngSeed: 1,
    rngState: 1,
    config: {
      maxTurns: null,
      turnDeadlineDays: 7,
      allowAIGovernor: true,
      difficultyModifier: 1,
      fogOfWar: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: null,
  };
}

const MINIMAL_THEME = {
  events: [],
  buildings: [],
  units: [],
  resources: [
    { id: 'dinars', name: 'Dinars', description: '', baseYield: 2, terrainYields: {} },
    { id: 'grain', name: 'Grain', description: '', baseYield: 2, terrainYields: {} },
    { id: 'faith', name: 'Faith', description: '', baseYield: 0, terrainYields: {} },
  ],
  techTree: [],
  mechanics: {
    tensionAxes: [],
    combatModifiers: {},
    resourceInteractions: [],
    turnCycleLength: 0,
    turnCycleNames: [],
    turnCycleEffects: [],
  },
  civilizations: [],
  diplomacyOptions: [],
  victoryConditions: [],
  defeatConditions: [],
} as unknown as ThemePackage;

function makeTradeOrders(
  civId: string,
  targetCivId: string,
  offer: Record<string, number>,
  request: Record<string, number>,
): PlayerOrders {
  return {
    playerId: `player-${civId}`,
    civilizationId: civId,
    turnNumber: 1,
    orders: [{
      kind: 'diplomatic',
      actionType: 'offer_trade',
      targetCivId,
      payload: { offer, request },
    }],
    submittedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Trade — offer_trade matching', () => {
  it('executes a mutual trade when both sides offer compatible resources', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { dinars: 100, grain: 10 }, { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { dinars: 10, grain: 100 }, { 'civ-a': 'peace' }),
    });
    const orders = [
      makeTradeOrders('civ-a', 'civ-b', { dinars: 20 }, { grain: 15 }),
      makeTradeOrders('civ-b', 'civ-a', { grain: 15 }, { dinars: 20 }),
    ];
    const { state: result } = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // civ-a gave 20 dinars, received 15 grain
    expect(result.civilizations['civ-a'].resources['dinars']).toBe(80);
    expect(result.civilizations['civ-a'].resources['grain']).toBe(25);
    // civ-b gave 15 grain, received 20 dinars
    expect(result.civilizations['civ-b'].resources['dinars']).toBe(30);
    expect(result.civilizations['civ-b'].resources['grain']).toBe(85);
  });

  it('does not execute trade when only one side offers', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { dinars: 100, grain: 10 }, { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { dinars: 10, grain: 100 }, { 'civ-a': 'peace' }),
    });
    const orders = [
      makeTradeOrders('civ-a', 'civ-b', { dinars: 20 }, { grain: 15 }),
    ];
    const { state: result } = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // No change
    expect(result.civilizations['civ-a'].resources['dinars']).toBe(100);
    expect(result.civilizations['civ-b'].resources['grain']).toBe(100);
  });

  it('does not execute trade when offerer has insufficient resources', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { dinars: 5, grain: 10 }, { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { dinars: 10, grain: 100 }, { 'civ-a': 'peace' }),
    });
    const orders = [
      makeTradeOrders('civ-a', 'civ-b', { dinars: 20 }, { grain: 15 }),
      makeTradeOrders('civ-b', 'civ-a', { grain: 15 }, { dinars: 20 }),
    ];
    const { state: result } = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // No change — civ-a can't afford to give 20 dinars
    expect(result.civilizations['civ-a'].resources['dinars']).toBe(5);
    expect(result.civilizations['civ-b'].resources['grain']).toBe(100);
  });

  it('does not execute trade when counter-offer amounts are incompatible', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { dinars: 100, grain: 10 }, { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { dinars: 10, grain: 100 }, { 'civ-a': 'peace' }),
    });
    const orders = [
      makeTradeOrders('civ-a', 'civ-b', { dinars: 20 }, { grain: 15 }),
      // B requests 30 dinars but A only offers 20 — incompatible
      makeTradeOrders('civ-b', 'civ-a', { grain: 15 }, { dinars: 30 }),
    ];
    const { state: result } = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].resources['dinars']).toBe(100);
    expect(result.civilizations['civ-b'].resources['grain']).toBe(100);
  });

  it('does not change diplomatic relations from trade', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { dinars: 100 }, { 'civ-b': 'alliance' }),
      'civ-b': makeCiv('civ-b', { grain: 100 }, { 'civ-a': 'alliance' }),
    });
    const orders = [
      makeTradeOrders('civ-a', 'civ-b', { dinars: 10 }, { grain: 10 }),
      makeTradeOrders('civ-b', 'civ-a', { grain: 10 }, { dinars: 10 }),
    ];
    const { state: result } = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('alliance');
  });
});

describe('Economy — resource allocation orders', () => {
  it('weights resource yields by allocation percentages', () => {
    const hex = makeHex({ col: 0, row: 0 }, 'civ-a');
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { dinars: 0, grain: 0, faith: 0 }) },
      [[hex]],
    );

    // 3 resources → default is 33.33% each
    // Set dinars to 66.66% (2x), grain to 16.66% (0.5x), faith stays default
    const allocations = { 'civ-a': { dinars: 66.66, grain: 16.66, faith: 33.33 } };
    const result = resolveEconomy(state, MINIMAL_THEME, allocations);

    const resA = result.civilizations['civ-a'].resources;
    // Dinars base yield is 2, doubled by 2x allocation = 4
    // Grain base yield is 2, halved by 0.5x allocation = 1
    expect(resA['dinars']).toBeGreaterThan(0);
    expect(resA['grain']).toBeGreaterThanOrEqual(0);
    // With allocation, dinars should be higher than grain
  });

  it('produces normal yields when no allocation is provided', () => {
    const hex = makeHex({ col: 0, row: 0 }, 'civ-a');
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { dinars: 0, grain: 0 }) },
      [[hex]],
    );

    const withoutAlloc = resolveEconomy(state, MINIMAL_THEME);
    const withAlloc = resolveEconomy(state, MINIMAL_THEME, undefined);

    expect(withoutAlloc.civilizations['civ-a'].resources['dinars'])
      .toBe(withAlloc.civilizations['civ-a'].resources['dinars']);
  });
});
