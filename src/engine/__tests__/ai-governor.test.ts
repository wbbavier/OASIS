import { describe, it, expect } from 'vitest';
import { generateAIOrders, fillMissingOrdersWithAI } from '@/engine/ai-governor';
import { createPRNG } from '@/engine/prng';
import type { GameState, CivilizationState, PlayerOrders, Hex } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUBMITTED_AT = '2026-01-01T12:00:00.000Z';

function makeCiv(id: string, overrides: Partial<CivilizationState> = {}): CivilizationState {
  return {
    id,
    playerId: null,
    resources: { grain: 50, dinars: 100 },
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability: 80,
    diplomaticRelations: {},
    tensionAxes: {},
    isEliminated: false,
    turnsMissingOrders: 0,
    ...overrides,
  };
}

function makeHex(col: number, row: number, controlledBy: string | null = null): Hex {
  return {
    coord: { col, row },
    terrain: 'plains',
    settlement: null,
    controlledBy,
    units: [],
    resources: [],
    exploredBy: [],
  };
}

function makeHexWithSettlement(col: number, row: number, civId: string, settlementId: string): Hex {
  return {
    coord: { col, row },
    terrain: 'plains',
    settlement: {
      id: settlementId,
      name: 'Test Town',
      type: 'town',
      population: 100,
      stability: 80,
      buildings: [],
      isCapital: false,
    },
    controlledBy: civId,
    units: [],
    resources: [],
    exploredBy: [],
  };
}

function makeState(civs: Record<string, CivilizationState>, map: Hex[][] = [[]]): GameState {
  return {
    gameId: 'g1',
    themeId: 'test',
    turn: 3,
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
      allowAIGovernor: true,
      difficultyModifier: 1,
      fogOfWar: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: null,
  };
}

function makeTheme(options: { hasTechs?: boolean; hasGranary?: boolean } = {}): ThemePackage {
  const techTree = options.hasTechs !== false
    ? [
        {
          id: 'crop-rotation',
          name: 'Crop Rotation',
          description: '',
          cost: 30,
          prerequisites: [],
          effects: [],
          era: 'Era 1',
        },
        {
          id: 'trade-networks',
          name: 'Trade Networks',
          description: '',
          cost: 35,
          prerequisites: [],
          effects: [],
          era: 'Era 1',
        },
        {
          id: 'advanced-farming',
          name: 'Advanced Farming',
          description: '',
          cost: 60,
          prerequisites: ['crop-rotation'],
          effects: [],
          era: 'Era 2',
        },
      ]
    : [];

  const buildings = options.hasGranary !== false
    ? [
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
      ]
    : [];

  return {
    id: 'test',
    name: 'Test',
    description: '',
    source: '',
    civilizations: [],
    map: { cols: 3, rows: 3, seaEdge: false, defaultTerrainWeights: {}, zones: [], settlementAnchors: [] },
    resources: [],
    techTree,
    buildings,
    units: [],
    events: [],
    diplomacyOptions: [],
    victoryConditions: [],
    defeatConditions: [],
    mechanics: {
      tensionAxes: [],
      combatModifiers: {},
      resourceInteractions: [],
      turnCycleLength: 0,
      turnCycleNames: [],
      turnCycleEffects: [],
    },
    flavor: { turnName: 'Turn', currencyName: 'Gold', eraNames: [], settingDescription: '' },
  };
}

const PRNG = createPRNG(42);

// ---------------------------------------------------------------------------
// generateAIOrders tests
// ---------------------------------------------------------------------------

describe('generateAIOrders — basic', () => {
  it('returns PlayerOrders for the given civId and turn', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a') });
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    expect(result.civilizationId).toBe('civ-a');
    expect(result.turnNumber).toBe(3);
    expect(result.submittedAt).toBe(SUBMITTED_AT);
    expect(result.playerId).toBe('ai_civ-a');
  });

  it('returns empty orders for an eliminated civ', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a', { isEliminated: true }) });
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    expect(result.orders).toHaveLength(0);
  });
});

describe('generateAIOrders — research heuristic', () => {
  it('emits a ResearchOrder for the cheapest available tech', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a', { completedTechs: [] }) });
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);

    const researchOrders = result.orders.filter((o) => o.kind === 'research');
    expect(researchOrders.length).toBe(1);
    if (researchOrders[0].kind === 'research') {
      // cheapest is crop-rotation (cost 30)
      expect(researchOrders[0].techId).toBe('crop-rotation');
      expect(researchOrders[0].pointsAllocated).toBe(20);
    }
  });

  it('only researches techs with completed prerequisites', () => {
    // advanced-farming requires crop-rotation, which is not completed
    const state = makeState({
      'civ-a': makeCiv('civ-a', { completedTechs: [] }),
    });
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    const researchOrders = result.orders.filter((o) => o.kind === 'research');
    // advanced-farming should NOT be picked (prereq not met)
    if (researchOrders[0]?.kind === 'research') {
      expect(researchOrders[0].techId).not.toBe('advanced-farming');
    }
  });

  it('emits no research order when all techs are completed', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', {
        completedTechs: ['crop-rotation', 'trade-networks', 'advanced-farming'],
      }),
    });
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    const researchOrders = result.orders.filter((o) => o.kind === 'research');
    expect(researchOrders.length).toBe(0);
  });

  it('emits no research order when theme has no techs', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a') });
    const result = generateAIOrders(state, 'civ-a', makeTheme({ hasTechs: false }), PRNG, SUBMITTED_AT);
    const researchOrders = result.orders.filter((o) => o.kind === 'research');
    expect(researchOrders.length).toBe(0);
  });
});

describe('generateAIOrders — construction heuristic', () => {
  it('emits a ConstructionOrder for granary when grain < 20 and civ controls a settlement', () => {
    const map = [[makeHexWithSettlement(0, 0, 'civ-a', 'settlement-1')]];
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { resources: { grain: 10, dinars: 100 } }) },
      map,
    );
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);

    const constructionOrders = result.orders.filter((o) => o.kind === 'construction');
    expect(constructionOrders.length).toBe(1);
    if (constructionOrders[0].kind === 'construction') {
      expect(constructionOrders[0].buildingDefinitionId).toBe('granary');
      expect(constructionOrders[0].settlementId).toBe('settlement-1');
    }
  });

  it('builds available building regardless of grain level (personality-driven)', () => {
    const map = [[makeHexWithSettlement(0, 0, 'civ-a', 'settlement-1')]];
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { resources: { grain: 25, dinars: 100 } }) },
      map,
    );
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    const constructionOrders = result.orders.filter((o) => o.kind === 'construction');
    // AI now builds based on personality preference, not grain threshold
    expect(constructionOrders.length).toBe(1);
  });

  it('does not emit ConstructionOrder when civ lacks dinars', () => {
    const map = [[makeHexWithSettlement(0, 0, 'civ-a', 'settlement-1')]];
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { resources: { grain: 5, dinars: 5 } }) },
      map,
    );
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    const constructionOrders = result.orders.filter((o) => o.kind === 'construction');
    expect(constructionOrders.length).toBe(0);
  });

  it('does not emit ConstructionOrder when civ controls no settlement', () => {
    const map = [[makeHex(0, 0, 'civ-a')]]; // hex without settlement
    const state = makeState(
      { 'civ-a': makeCiv('civ-a', { resources: { grain: 5, dinars: 100 } }) },
      map,
    );
    const result = generateAIOrders(state, 'civ-a', makeTheme(), PRNG, SUBMITTED_AT);
    const constructionOrders = result.orders.filter((o) => o.kind === 'construction');
    expect(constructionOrders.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// fillMissingOrdersWithAI tests
// ---------------------------------------------------------------------------

describe('fillMissingOrdersWithAI', () => {
  it('adds orders for civs that did not submit', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    });
    const submitted: PlayerOrders[] = [
      {
        playerId: 'p1',
        civilizationId: 'civ-a',
        turnNumber: 3,
        orders: [],
        submittedAt: SUBMITTED_AT,
      },
    ];
    const result = fillMissingOrdersWithAI(state, submitted, makeTheme(), PRNG, SUBMITTED_AT);
    expect(result.length).toBe(2);
    const civIds = result.map((o) => o.civilizationId);
    expect(civIds).toContain('civ-a');
    expect(civIds).toContain('civ-b');
  });

  it('does not add duplicate orders for submitted civs', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a') });
    const submitted: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 3, orders: [], submittedAt: SUBMITTED_AT },
    ];
    const result = fillMissingOrdersWithAI(state, submitted, makeTheme(), PRNG, SUBMITTED_AT);
    expect(result.length).toBe(1);
  });

  it('skips eliminated civs', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b', { isEliminated: true }),
    });
    const result = fillMissingOrdersWithAI(state, [], makeTheme(), PRNG, SUBMITTED_AT);
    expect(result.length).toBe(1);
    expect(result[0].civilizationId).toBe('civ-a');
  });

  it('uses the provided submittedAt value', () => {
    const state = makeState({ 'civ-a': makeCiv('civ-a') });
    const result = fillMissingOrdersWithAI(state, [], makeTheme(), PRNG, SUBMITTED_AT);
    expect(result[0].submittedAt).toBe(SUBMITTED_AT);
  });
});
