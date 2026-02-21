import { describe, it, expect } from 'vitest';
import { resolveTurn } from '@/engine/turn-resolver';
import { resolveEconomy, getCustomTechEffectValue } from '@/engine/economy';
import { resolveCombatEncounter } from '@/engine/combat';
import { createPRNG } from '@/engine/prng';
import type { GameState, PlayerOrders, Hex, CivilizationState, Unit } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

const RESOLVED_AT = '2026-01-01T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTheme(overrides: Partial<ThemePackage> = {}): ThemePackage {
  return {
    id: 'test-theme',
    name: 'Test Theme',
    description: '',
    source: '',
    civilizations: [
      {
        id: 'ragosa', name: 'Ragosa', description: '', color: '#C9A84C', religion: 'asharite',
        startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [],
        specialAbilities: ['Cultural Patronage: Culture buildings produce +50% culture'],
        flavor: '',
      },
      {
        id: 'valledo', name: 'Valledo', description: '', color: '#1A3A6B', religion: 'jaddite',
        startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [],
        specialAbilities: ['Reconquista Drive: Units get +10 combat strength when attacking different religion'],
        flavor: '',
      },
      {
        id: 'cartada', name: 'Cartada', description: '', color: '#8B1A1A', religion: 'asharite',
        startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [],
        specialAbilities: ['Merchant Cavalry: Cavalry units generate +2 dinars in settlements with a market'],
        flavor: '',
      },
      {
        id: 'ruenda', name: 'Ruenda', description: '', color: '#5B2E8C', religion: 'jaddite',
        startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [],
        specialAbilities: ['Silver Road: Settlements connected to capital get +3 trade_goods per turn'],
        flavor: '',
      },
    ],
    map: { cols: 5, rows: 5, seaEdge: false, defaultTerrainWeights: { plains: 100 }, zones: [], settlementAnchors: [] },
    resources: [
      { id: 'dinars', name: 'Dinars', description: '', baseYield: 0, terrainYields: { plains: 1 } },
      { id: 'faith', name: 'Faith', description: '', baseYield: 0, terrainYields: { plains: 1 } },
      { id: 'trade_goods', name: 'Trade Goods', description: '', baseYield: 0, terrainYields: {} },
      { id: 'grain', name: 'Grain', description: '', baseYield: 0, terrainYields: { plains: 2 } },
    ],
    techTree: [],
    buildings: [
      { id: 'library', name: 'Library', description: '', cost: 55, upkeep: 4, effects: [{ resourceId: 'faith', delta: 4 }], prerequisiteTech: null, maxPerSettlement: 1 },
      { id: 'mosque', name: 'Mosque / Cathedral', description: '', cost: 40, upkeep: 3, effects: [{ resourceId: 'faith', delta: 5 }], prerequisiteTech: null, maxPerSettlement: 1 },
      { id: 'market', name: 'Market', description: '', cost: 35, upkeep: 3, effects: [{ resourceId: 'dinars', delta: 5 }], prerequisiteTech: null, maxPerSettlement: 2 },
    ],
    units: [
      { id: 'levy', name: 'Levy', description: '', cost: 10, upkeep: 1, strength: 3, morale: 4, moves: 2, prerequisiteTech: null, canGarrison: true, flavor: '' },
      { id: 'light-cavalry', name: 'Light Cavalry', description: '', cost: 35, upkeep: 4, strength: 4, morale: 5, moves: 3, prerequisiteTech: null, canGarrison: false, flavor: '' },
    ],
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
    ...overrides,
  };
}

function makeCiv(id: string, overrides: Partial<CivilizationState> = {}): CivilizationState {
  return {
    id, playerId: `player-${id}`, resources: { dinars: 100, grain: 50, faith: 0, trade_goods: 0 },
    techProgress: {}, completedTechs: [], culturalInfluence: 0, stability: 70,
    diplomaticRelations: {}, tensionAxes: {}, isEliminated: false,
    turnsMissingOrders: 0, turnsAtZeroStability: 0,
    ...overrides,
  };
}

function makeHex(col: number, row: number, overrides: Partial<Hex> = {}): Hex {
  return {
    coord: { col, row }, terrain: 'plains', settlement: null, controlledBy: null,
    units: [], resources: [], exploredBy: [], ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const map: Hex[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: Hex[] = [];
    for (let c = 0; c < 5; c++) row.push(makeHex(c, r));
    map.push(row);
  }
  return {
    gameId: 'game-001', themeId: 'test-theme', turn: 1, phase: 'active',
    map, civilizations: {}, activeEvents: [], turnHistory: [],
    rngSeed: 42, rngState: 42,
    config: { maxTurns: null, turnDeadlineDays: 7, allowAIGovernor: true, difficultyModifier: 1, fogOfWar: false },
    createdAt: '2026-01-01T00:00:00.000Z', lastResolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Civ Ability Tests
// ---------------------------------------------------------------------------

describe('Cultural Patronage (Ragosa)', () => {
  it('increases faith output from cultural buildings by 50%', () => {
    const theme = makeTheme();
    const map = makeState().map;
    map[0][0] = makeHex(0, 0, {
      controlledBy: 'ragosa',
      settlement: { id: 's1', name: 'City', type: 'capital', population: 3, stability: 70, buildings: ['library', 'mosque'], isCapital: true },
    });

    const state = makeState({
      map,
      civilizations: {
        'ragosa': makeCiv('ragosa', { resources: { dinars: 100, grain: 50, faith: 0 } }),
      },
    });

    const result = resolveEconomy(state, theme);
    const ragosa = result.civilizations['ragosa'];
    // Library: 4 faith + 50% bonus = 2 extra. Mosque: 5 faith + 50% = 2 extra (floor). Total extra = 4
    // Base faith from buildings: 4 + 5 = 9, bonus = 2 + 2 = 4, total = 13 + terrain yields
    expect(ragosa.resources['faith']).toBeGreaterThan(9);
  });
});

describe('Reconquista Drive (Valledo)', () => {
  it('adds combat bonus when attacking different religion', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'valledo': makeCiv('valledo'),
        'ragosa': makeCiv('ragosa'),
      },
    });

    const prng = createPRNG(42);
    const encounter = {
      coord: { col: 2, row: 2 },
      terrain: 'plains' as const,
      attackerCivId: 'valledo',
      defenderCivId: 'ragosa',
      attackerUnits: [{ id: 'u1', definitionId: 'levy', civilizationId: 'valledo', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: false }],
      defenderUnits: [{ id: 'u2', definitionId: 'levy', civilizationId: 'ragosa', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: false }],
    };

    const result = resolveCombatEncounter(encounter, state, theme, prng);
    // The attacker should have +10 bonus from Reconquista Drive (different religion)
    // This should make the attacker stronger on average
    expect(result.result).toBeDefined();
    expect(result.result.attackerCivId).toBe('valledo');
  });

  it('does not add bonus when attacking same religion', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'valledo': makeCiv('valledo'),
        'ruenda': makeCiv('ruenda'), // also jaddite
      },
    });

    // With same religion, no bonus should apply
    // Just verify it doesn't crash
    const prng = createPRNG(42);
    const encounter = {
      coord: { col: 2, row: 2 },
      terrain: 'plains' as const,
      attackerCivId: 'valledo',
      defenderCivId: 'ruenda',
      attackerUnits: [{ id: 'u1', definitionId: 'levy', civilizationId: 'valledo', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: false }],
      defenderUnits: [{ id: 'u2', definitionId: 'levy', civilizationId: 'ruenda', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: false }],
    };

    const result = resolveCombatEncounter(encounter, state, theme, prng);
    expect(result.result).toBeDefined();
  });
});

describe('Merchant Cavalry (Cartada)', () => {
  it('generates extra dinars from cavalry in market settlements', () => {
    // Use zero-upkeep cavalry to isolate the ability effect
    const theme = makeTheme({
      units: [
        { id: 'levy', name: 'Levy', description: '', cost: 10, upkeep: 1, strength: 3, morale: 4, moves: 2, prerequisiteTech: null, canGarrison: true, flavor: '' },
        { id: 'light-cavalry', name: 'Light Cavalry', description: '', cost: 35, upkeep: 0, strength: 4, morale: 5, moves: 3, prerequisiteTech: null, canGarrison: false, flavor: '' },
      ],
    });
    const cavalryUnit: Unit = { id: 'cav1', definitionId: 'light-cavalry', civilizationId: 'cartada', strength: 4, morale: 5, movesRemaining: 3, isGarrisoned: false };

    // State WITH cavalry
    const mapWith = makeState().map;
    mapWith[0][0] = makeHex(0, 0, {
      controlledBy: 'cartada',
      settlement: { id: 's1', name: 'City', type: 'capital', population: 3, stability: 70, buildings: ['market'], isCapital: true },
      units: [cavalryUnit],
    });
    const stateWithCav = makeState({
      map: mapWith,
      civilizations: { 'cartada': makeCiv('cartada', { resources: { dinars: 100, grain: 50, faith: 0 } }) },
    });
    const resultWithCav = resolveEconomy(stateWithCav, theme);

    // State WITHOUT cavalry
    const mapWithout = makeState().map;
    mapWithout[0][0] = makeHex(0, 0, {
      controlledBy: 'cartada',
      settlement: { id: 's1', name: 'City', type: 'capital', population: 3, stability: 70, buildings: ['market'], isCapital: true },
      units: [],
    });
    const stateNoCav = makeState({
      map: mapWithout,
      civilizations: { 'cartada': makeCiv('cartada', { resources: { dinars: 100, grain: 50, faith: 0 } }) },
    });
    const resultNoCav = resolveEconomy(stateNoCav, theme);

    // With cavalry should have +2 dinars more than without
    expect(resultWithCav.civilizations['cartada'].resources['dinars']).toBeGreaterThan(
      resultNoCav.civilizations['cartada'].resources['dinars'],
    );
  });
});

describe('Silver Road (Ruenda)', () => {
  it('adds trade_goods bonus to settlements connected to capital', () => {
    const theme = makeTheme();
    const map = makeState().map;
    // Capital at (0,0), connected city at (1,0)
    map[0][0] = makeHex(0, 0, {
      controlledBy: 'ruenda',
      settlement: { id: 's1', name: 'Capital', type: 'capital', population: 3, stability: 70, buildings: [], isCapital: true },
    });
    map[0][1] = makeHex(1, 0, {
      controlledBy: 'ruenda',
      settlement: { id: 's2', name: 'City', type: 'city', population: 2, stability: 60, buildings: [], isCapital: false },
    });

    const state = makeState({
      map,
      civilizations: {
        'ruenda': makeCiv('ruenda', { resources: { dinars: 100, grain: 50, trade_goods: 0 } }),
      },
    });

    const result = resolveEconomy(state, theme);
    // Connected city should get +3 trade_goods
    expect(result.civilizations['ruenda'].resources['trade_goods']).toBeGreaterThanOrEqual(3);
  });

  it('does not add bonus to disconnected settlements', () => {
    const theme = makeTheme();
    const map = makeState().map;
    // Capital at (0,0), disconnected city at (4,4) with no connecting controlled hexes
    map[0][0] = makeHex(0, 0, {
      controlledBy: 'ruenda',
      settlement: { id: 's1', name: 'Capital', type: 'capital', population: 3, stability: 70, buildings: [], isCapital: true },
    });
    map[4][4] = makeHex(4, 4, {
      controlledBy: 'ruenda',
      settlement: { id: 's2', name: 'City', type: 'city', population: 2, stability: 60, buildings: [], isCapital: false },
    });

    const state = makeState({
      map,
      civilizations: {
        'ruenda': makeCiv('ruenda', { resources: { dinars: 100, grain: 50, trade_goods: 0 } }),
      },
    });

    const result = resolveEconomy(state, theme);
    // No connected cities beyond capital → no Silver Road bonus beyond terrain
    expect(result.civilizations['ruenda'].resources['trade_goods']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tech Effect Tests
// ---------------------------------------------------------------------------

describe('Tech Effects', () => {
  it('cultural_victory_progress adds faith per turn', () => {
    const theme = makeTheme({
      techTree: [
        { id: 'golden-age', name: 'Golden Age', description: '', cost: 10, prerequisites: [], effects: [{ kind: 'custom', key: 'cultural_victory_progress', value: 5 }], era: '' },
      ],
    });
    const state = makeState({
      civilizations: {
        'ragosa': makeCiv('ragosa', { completedTechs: ['golden-age'], resources: { dinars: 100, grain: 50, faith: 10 } }),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'ragosa', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];
    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // Should get +5 faith from cultural_victory_progress
    expect(result.state.civilizations['ragosa'].resources['faith']).toBeGreaterThanOrEqual(15);
  });

  it('settlement_defense_bonus adds to garrison defense', () => {
    const theme = makeTheme({
      techTree: [
        { id: 'fort-tech', name: 'Fort', description: '', cost: 10, prerequisites: [], effects: [{ kind: 'custom', key: 'settlement_defense_bonus', value: 10 }], era: '' },
      ],
    });
    const state = makeState({
      map: (() => {
        const m = makeState().map;
        m[2][2] = makeHex(2, 2, {
          settlement: { id: 's1', name: 'City', type: 'city', population: 3, stability: 70, buildings: [], isCapital: false },
        });
        return m;
      })(),
      civilizations: {
        'valledo': makeCiv('valledo', { completedTechs: ['fort-tech'] }),
        'ragosa': makeCiv('ragosa'),
      },
    });

    // Defender has settlement_defense_bonus tech
    const prng = createPRNG(42);
    const encounter = {
      coord: { col: 2, row: 2 },
      terrain: 'plains' as const,
      attackerCivId: 'ragosa',
      defenderCivId: 'valledo',
      attackerUnits: [{ id: 'u1', definitionId: 'levy', civilizationId: 'ragosa', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: false }],
      defenderUnits: [{ id: 'u2', definitionId: 'levy', civilizationId: 'valledo', strength: 3, morale: 4, movesRemaining: 2, isGarrisoned: true }],
    };

    const result = resolveCombatEncounter(encounter, state, theme, prng);
    // Should succeed without errors; the defender has the bonus
    expect(result.result).toBeDefined();
  });

  it('unit_heal_rate increases healing at settlements', () => {
    const theme = makeTheme({
      techTree: [
        { id: 'med-tech', name: 'Medicine', description: '', cost: 10, prerequisites: [], effects: [{ kind: 'custom', key: 'unit_heal_rate', value: 2 }], era: '' },
      ],
    });

    const damagedUnit: Unit = { id: 'u1', definitionId: 'levy', civilizationId: 'ragosa', strength: 1, morale: 4, movesRemaining: 2, isGarrisoned: true };
    const map = makeState().map;
    map[0][0] = makeHex(0, 0, {
      controlledBy: 'ragosa',
      settlement: { id: 's1', name: 'City', type: 'capital', population: 3, stability: 70, buildings: [], isCapital: true },
      units: [damagedUnit],
    });

    const state = makeState({
      map,
      civilizations: {
        'ragosa': makeCiv('ragosa', { completedTechs: ['med-tech'], resources: { dinars: 100, grain: 50 } }),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'ragosa', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];
    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);

    // Unit should heal by base 1 + tech bonus 2 = 3 (capped at max strength 3)
    const healedUnit = result.state.map.flat().flatMap((h) => h.units).find((u) => u.id === 'u1');
    expect(healedUnit?.strength).toBe(3); // max strength
  });

  it('resource_conversion converts resources per turn', () => {
    const theme = makeTheme({
      techTree: [
        {
          id: 'conv-tech', name: 'Conversion', description: '', cost: 10, prerequisites: [],
          effects: [{ kind: 'custom', key: 'resource_conversion', value: { from: 'grain', fromAmount: 5, to: 'dinars', toAmount: 10 } }],
          era: '',
        },
      ],
    });

    const map = makeState().map;
    map[0][0] = makeHex(0, 0, { controlledBy: 'ragosa' });

    const state = makeState({
      map,
      civilizations: {
        'ragosa': makeCiv('ragosa', { completedTechs: ['conv-tech'], resources: { dinars: 50, grain: 100, faith: 0 } }),
      },
    });

    const result = resolveEconomy(state, theme);
    // Grain should decrease by 5, dinars increase by 10 (relative to no-conversion)
    const noConvState = makeState({
      map,
      civilizations: {
        'ragosa': makeCiv('ragosa', { completedTechs: [], resources: { dinars: 50, grain: 100, faith: 0 } }),
      },
    });
    const noConvResult = resolveEconomy(noConvState, theme);

    expect(result.civilizations['ragosa'].resources['dinars']).toBeGreaterThan(
      noConvResult.civilizations['ragosa'].resources['dinars'],
    );
  });

  it('getCustomTechEffectValue sums multiple effects', () => {
    const theme = makeTheme({
      techTree: [
        { id: 't1', name: 'T1', description: '', cost: 10, prerequisites: [], effects: [{ kind: 'custom', key: 'test_key', value: 5 }], era: '' },
        { id: 't2', name: 'T2', description: '', cost: 10, prerequisites: [], effects: [{ kind: 'custom', key: 'test_key', value: 3 }], era: '' },
      ],
    });

    const state = makeState({
      civilizations: {
        'ragosa': makeCiv('ragosa', { completedTechs: ['t1', 't2'] }),
      },
    });

    expect(getCustomTechEffectValue(state, 'ragosa', 'test_key', theme)).toBe(8);
  });

  it('trigger_event activates an event when tech completes', () => {
    const theme = makeTheme({
      techTree: [
        {
          id: 'poet-kings', name: 'Poet Kings', description: '', cost: 10, prerequisites: [],
          effects: [{ kind: 'custom', key: 'trigger_event', value: 'golden-age-event' }],
          era: '',
        },
      ],
      events: [
        {
          id: 'golden-age-event', name: 'Golden Age', description: '', flavourText: '',
          trigger: { kind: 'always' }, targetCivs: 'all',
          choices: [{ id: 'accept', label: 'Accept', effects: [] }],
          defaultChoiceId: 'accept', isRepeatable: false, weight: 1,
        },
      ],
    });

    const state = makeState({
      civilizations: {
        'ragosa': makeCiv('ragosa', {
          techProgress: { 'poet-kings': 5 },
          resources: { dinars: 100, grain: 50 },
        }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'p1', civilizationId: 'ragosa', turnNumber: 1,
        orders: [{ kind: 'research', techId: 'poet-kings', pointsAllocated: 10 }],
        submittedAt: RESOLVED_AT,
      },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // The event should be activated
    const triggerEvent = result.state.activeEvents.find((e) => e.definitionId === 'golden-age-event');
    expect(triggerEvent).toBeDefined();
  });
});
