import { describe, it, expect } from 'vitest';
import { resolveTurn } from '@/engine/turn-resolver';
import { createPRNG } from '@/engine/prng';
import type { GameState, PlayerOrders, Hex, CivilizationState } from '@/engine/types';
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
        id: 'civ-a',
        name: 'Civ A',
        description: '',
        color: '#fff',
        religion: 'asharite',
        startingResources: {},
        startingTechs: [],
        uniqueUnits: [],
        uniqueBuildings: [],
        specialAbilities: [],
        flavor: '',
      },
      {
        id: 'civ-b',
        name: 'Civ B',
        description: '',
        color: '#000',
        religion: 'jaddite',
        startingResources: {},
        startingTechs: [],
        uniqueUnits: [],
        uniqueBuildings: [],
        specialAbilities: [],
        flavor: '',
      },
      {
        id: 'civ-c',
        name: 'Civ C',
        description: '',
        color: '#aaa',
        religion: 'asharite',
        startingResources: {},
        startingTechs: [],
        uniqueUnits: [],
        uniqueBuildings: [],
        specialAbilities: [],
        flavor: '',
      },
    ],
    map: { cols: 5, rows: 5, seaEdge: false, defaultTerrainWeights: { plains: 100 }, zones: [], settlementAnchors: [] },
    resources: [],
    techTree: [],
    buildings: [
      { id: 'mosque', name: 'Mosque / Cathedral', description: '', cost: 40, upkeep: 3, effects: [], prerequisiteTech: null, maxPerSettlement: 1 },
    ],
    units: [
      { id: 'levy', name: 'Levy', description: '', cost: 10, upkeep: 1, strength: 3, morale: 4, moves: 2, prerequisiteTech: null, canGarrison: true, flavor: '' },
    ],
    events: [],
    diplomacyOptions: [],
    victoryConditions: [],
    defeatConditions: [],
    mechanics: {
      tensionAxes: [
        { id: 'religious_fervor', name: 'Religious Fervor', description: '', minValue: 0, maxValue: 100 },
        { id: 'muwardi_threat', name: 'Muwardi Threat', description: '', minValue: 0, maxValue: 100 },
      ],
      combatModifiers: {},
      resourceInteractions: [],
      turnCycleLength: 4,
      turnCycleNames: ['spring', 'summer', 'autumn', 'winter'],
      turnCycleEffects: [],
    },
    flavor: { turnName: 'Turn', currencyName: 'Gold', eraNames: [], settingDescription: '' },
    ...overrides,
  };
}

function makeCiv(id: string, overrides: Partial<CivilizationState> = {}): CivilizationState {
  return {
    id,
    playerId: `player-${id}`,
    resources: { dinars: 100, grain: 50 },
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability: 70,
    diplomaticRelations: {},
    tensionAxes: { religious_fervor: 0, muwardi_threat: 0 },
    isEliminated: false,
    turnsMissingOrders: 0,
    turnsAtZeroStability: 0,
    ...overrides,
  };
}

function makeHex(col: number, row: number, overrides: Partial<Hex> = {}): Hex {
  return {
    coord: { col, row },
    terrain: 'plains',
    settlement: null,
    controlledBy: null,
    units: [],
    resources: [],
    exploredBy: [],
    ...overrides,
  };
}

function makeMap3x3(): Hex[][] {
  const map: Hex[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: Hex[] = [];
    for (let c = 0; c < 3; c++) {
      row.push(makeHex(c, r));
    }
    map.push(row);
  }
  return map;
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'game-001',
    themeId: 'test-theme',
    turn: 1,
    phase: 'active',
    map: makeMap3x3(),
    civilizations: {
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    },
    activeEvents: [],
    turnHistory: [],
    rngSeed: 42,
    rngState: 42,
    config: {
      maxTurns: null,
      turnDeadlineDays: 7,
      allowAIGovernor: true,
      difficultyModifier: 1,
      fogOfWar: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tension Axes System', () => {
  it('increases religious_fervor on cross-religion war declaration', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { diplomaticRelations: { 'civ-b': 'peace' } }),
        'civ-b': makeCiv('civ-b', { diplomaticRelations: { 'civ-a': 'peace' } }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'player-civ-a',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'declare_war', targetCivId: 'civ-b', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
      {
        playerId: 'player-civ-b',
        civilizationId: 'civ-b',
        turnNumber: 1,
        orders: [],
        submittedAt: RESOLVED_AT,
      },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // civ-a (asharite) declared war on civ-b (jaddite) → cross-religion → +10
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBeGreaterThanOrEqual(10);
    expect(result.state.civilizations['civ-b'].tensionAxes['religious_fervor']).toBeGreaterThanOrEqual(10);
  });

  it('does not increase tension on same-religion war declaration', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { diplomaticRelations: { 'civ-c': 'peace' } }),
        'civ-c': makeCiv('civ-c', { diplomaticRelations: { 'civ-a': 'peace' } }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'player-civ-a',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'declare_war', targetCivId: 'civ-c', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
      {
        playerId: 'player-civ-c',
        civilizationId: 'civ-c',
        turnNumber: 1,
        orders: [],
        submittedAt: RESOLVED_AT,
      },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // civ-a and civ-c are both asharite → no cross-religion bonus
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBe(0);
  });

  it('decreases religious_fervor on same-religion alliance', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', {
          tensionAxes: { religious_fervor: 30 },
          diplomaticRelations: { 'civ-c': 'peace' },
        }),
        'civ-c': makeCiv('civ-c', {
          tensionAxes: { religious_fervor: 30 },
          diplomaticRelations: { 'civ-a': 'peace' },
        }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'player-civ-a',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'propose_alliance', targetCivId: 'civ-c', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
      {
        playerId: 'player-civ-c',
        civilizationId: 'civ-c',
        turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'propose_alliance', targetCivId: 'civ-a', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // Both asharite → same-religion alliance → -5
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBeLessThan(30);
    expect(result.state.civilizations['civ-c'].tensionAxes['religious_fervor']).toBeLessThan(30);
  });

  it('increases tension when religious building is constructed', () => {
    const theme = makeTheme();
    const map = makeMap3x3();
    map[0][0] = makeHex(0, 0, {
      controlledBy: 'civ-a',
      settlement: { id: 'sett-1', name: 'City', type: 'city', population: 3, stability: 70, buildings: [], isCapital: true },
    });

    const state = makeState({
      map,
      civilizations: {
        'civ-a': makeCiv('civ-a', {
          resources: { dinars: 200 },
          completedTechs: ['patronage-arts'],
        }),
        'civ-b': makeCiv('civ-b'),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'player-civ-a',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'construction', settlementId: 'sett-1', buildingDefinitionId: 'mosque' }],
        submittedAt: RESOLVED_AT,
      },
      {
        playerId: 'player-civ-b',
        civilizationId: 'civ-b',
        turnNumber: 1,
        orders: [],
        submittedAt: RESOLVED_AT,
      },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // civ-a built mosque → +3 own, +5 to different-religion neighbor civ-b
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBeGreaterThanOrEqual(3);
    expect(result.state.civilizations['civ-b'].tensionAxes['religious_fervor']).toBeGreaterThanOrEqual(5);
  });

  it('applies stability penalty for tension >70', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { tensionAxes: { religious_fervor: 75 }, stability: 80 }),
        'civ-b': makeCiv('civ-b'),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // High tension should cause stability penalty
    expect(result.state.civilizations['civ-a'].stability).toBeLessThan(80);
  });

  it('applies stability and culture bonus for tension <30', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { tensionAxes: { religious_fervor: 10 }, stability: 50, resources: { dinars: 100, grain: 50, faith: 0 } }),
        'civ-b': makeCiv('civ-b'),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    // Low tension should give stability bonus and culture (faith) bonus
    expect(result.state.civilizations['civ-a'].stability).toBeGreaterThanOrEqual(50);
    expect(result.state.civilizations['civ-a'].resources['faith'] ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('clamps tension values to 0-100', () => {
    const theme = makeTheme();
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { tensionAxes: { religious_fervor: 98 }, diplomaticRelations: { 'civ-b': 'peace' } }),
        'civ-b': makeCiv('civ-b', { tensionAxes: { religious_fervor: 98 }, diplomaticRelations: { 'civ-a': 'peace' } }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'declare_war', targetCivId: 'civ-b', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBeLessThanOrEqual(100);
    expect(result.state.civilizations['civ-b'].tensionAxes['religious_fervor']).toBeLessThanOrEqual(100);
  });

  it('does not apply tension when no tension axis is defined', () => {
    const theme = makeTheme({ mechanics: { tensionAxes: [], combatModifiers: {}, resourceInteractions: [], turnCycleLength: 0, turnCycleNames: [], turnCycleEffects: [] } });
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { diplomaticRelations: { 'civ-b': 'peace' } }),
        'civ-b': makeCiv('civ-b', { diplomaticRelations: { 'civ-a': 'peace' } }),
      },
    });

    const orders: PlayerOrders[] = [
      {
        playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1,
        orders: [{ kind: 'diplomatic', actionType: 'declare_war', targetCivId: 'civ-b', payload: {} }],
        submittedAt: RESOLVED_AT,
      },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    // Should not crash, no tension change (stays at initial value of 0)
    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor'] ?? 0).toBe(0);
  });
});

describe('Muwardi Invasion', () => {
  it('spawns Muwardi units when Asharite civ has fervor >90 for 2 turns', () => {
    const theme = makeTheme({
      civilizations: [
        { id: 'civ-a', name: 'Civ A', description: '', color: '#fff', religion: 'asharite', startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [], specialAbilities: [], flavor: '' },
        { id: 'civ-b', name: 'Civ B', description: '', color: '#000', religion: 'jaddite', startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [], specialAbilities: [], flavor: '' },
        { id: 'muwardi', name: 'Muwardis', description: '', color: '#800', religion: 'asharite', startingResources: {}, startingTechs: [], uniqueUnits: ['muwardi-warrior'], uniqueBuildings: [], specialAbilities: [], flavor: '' },
      ],
      units: [
        { id: 'levy', name: 'Levy', description: '', cost: 10, upkeep: 1, strength: 3, morale: 4, moves: 2, prerequisiteTech: null, canGarrison: true, flavor: '' },
        { id: 'muwardi-warrior', name: 'Muwardi Warrior', description: '', cost: 0, upkeep: 0, strength: 6, morale: 8, moves: 2, prerequisiteTech: null, canGarrison: false, flavor: '' },
      ],
    });

    // Build a 5x5 map with the last row non-sea
    const map: Hex[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: Hex[] = [];
      for (let c = 0; c < 5; c++) {
        row.push(makeHex(c, r));
      }
      map.push(row);
    }

    const state = makeState({
      map,
      civilizations: {
        'civ-a': makeCiv('civ-a', {
          tensionAxes: { religious_fervor: 95, muwardi_threat: 1 }, // already 1 consecutive turn
        }),
        'civ-b': makeCiv('civ-b'),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);

    // Should have Muwardi units on the map
    const muwardiUnits = result.state.map.flat().flatMap((h) => h.units.filter((u) => u.civilizationId === 'muwardi'));
    expect(muwardiUnits.length).toBeGreaterThanOrEqual(3);
    expect(result.state.muwardiInvasion?.active).toBe(true);

    // Muwardi should be at war with all civs
    expect(result.state.civilizations['civ-a'].diplomaticRelations['muwardi']).toBe('war');
    expect(result.state.civilizations['civ-b'].diplomaticRelations['muwardi']).toBe('war');
  });

  it('deactivates invasion when all Muwardi units are destroyed', () => {
    const theme = makeTheme({
      civilizations: [
        { id: 'civ-a', name: 'Civ A', description: '', color: '#fff', religion: 'asharite', startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [], specialAbilities: [], flavor: '' },
        { id: 'muwardi', name: 'Muwardis', description: '', color: '#800', religion: 'asharite', startingResources: {}, startingTechs: [], uniqueUnits: [], uniqueBuildings: [], specialAbilities: [], flavor: '' },
      ],
    });

    const state = makeState({
      muwardiInvasion: { active: true, spawnedOnTurn: 1 },
      civilizations: {
        'civ-a': makeCiv('civ-a', {
          tensionAxes: { religious_fervor: 50 },
          diplomaticRelations: { muwardi: 'war' },
        }),
        'muwardi': makeCiv('muwardi', {
          playerId: null,
          diplomaticRelations: { 'civ-a': 'war' },
        }),
      },
    });
    // No muwardi units on map → should deactivate

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    expect(result.state.muwardiInvasion?.active).toBe(false);
    // Tension should decrease by 20
    expect(result.state.civilizations['civ-a'].tensionAxes['religious_fervor']).toBeLessThanOrEqual(30);
  });

  it('does not spawn when no Muwardi civ defined in theme', () => {
    const theme = makeTheme(); // no muwardi civ
    const state = makeState({
      civilizations: {
        'civ-a': makeCiv('civ-a', { tensionAxes: { religious_fervor: 95, muwardi_threat: 5 } }),
        'civ-b': makeCiv('civ-b'),
      },
    });

    const orders: PlayerOrders[] = [
      { playerId: 'p1', civilizationId: 'civ-a', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
      { playerId: 'p2', civilizationId: 'civ-b', turnNumber: 1, orders: [], submittedAt: RESOLVED_AT },
    ];

    const result = resolveTurn(state, orders, theme, createPRNG(42), RESOLVED_AT);
    expect(result.state.muwardiInvasion).toBeUndefined();
  });
});
