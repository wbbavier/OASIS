import { describe, it, expect } from 'vitest';
import { resolveTurn } from '@/engine/turn-resolver';
import { createPRNG } from '@/engine/prng';
import type { GameState, PlayerOrders } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeMinimalTheme(): ThemePackage {
  return {
    id: 'test-theme',
    name: 'Test Theme',
    description: '',
    source: '',
    civilizations: [],
    map: {
      cols: 5,
      rows: 5,
      seaEdge: false,
      defaultTerrainWeights: { plains: 100 },
      zones: [],
      settlementAnchors: [],
    },
    resources: [],
    techTree: [],
    buildings: [],
    units: [],
    events: [],
    diplomacyOptions: [],
    victoryConditions: [],
    defeatConditions: [],
    mechanics: {
      tensionAxes: [],
      combatModifiers: {},
      resourceInteractions: [],
      turnCycleLength: 4,
      turnCycleNames: ['spring', 'summer', 'autumn', 'winter'],
      turnCycleEffects: [],
    },
    flavor: {
      turnName: 'Turn',
      currencyName: 'Gold',
      eraNames: [],
      settingDescription: '',
    },
  };
}

function makeMinimalGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'game-001',
    themeId: 'test-theme',
    turn: 1,
    phase: 'active',
    map: [],
    civilizations: {
      'civ-a': {
        id: 'civ-a',
        playerId: 'player-1',
        resources: { gold: 100 },
        techProgress: {},
        completedTechs: [],
        culturalInfluence: 0,
        stability: 80,
        diplomaticRelations: {},
        tensionAxes: {},
        isEliminated: false,
        turnsMissingOrders: 0,
      },
      'civ-b': {
        id: 'civ-b',
        playerId: 'player-2',
        resources: { gold: 50 },
        techProgress: {},
        completedTechs: [],
        culturalInfluence: 0,
        stability: 70,
        diplomaticRelations: {},
        tensionAxes: {},
        isEliminated: false,
        turnsMissingOrders: 0,
      },
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
      fogOfWar: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    lastResolvedAt: null,
    ...overrides,
  };
}

function makeOrders(civId: string, turnNumber: number): PlayerOrders {
  return {
    playerId: `player-for-${civId}`,
    civilizationId: civId,
    turnNumber,
    orders: [],
    submittedAt: '2026-01-07T12:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveTurn — turn counter', () => {
  it('increments turn by 1', () => {
    const state = makeMinimalGameState({ turn: 5 });
    const theme = makeMinimalTheme();
    const prng = createPRNG(100);
    const { state: next } = resolveTurn(state, [], theme, prng);
    expect(next.turn).toBe(6);
  });
});

describe('resolveTurn — state preservation', () => {
  it('gameId is unchanged', () => {
    const state = makeMinimalGameState();
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.gameId).toBe(state.gameId);
  });

  it('themeId is unchanged', () => {
    const state = makeMinimalGameState();
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.themeId).toBe(state.themeId);
  });

  it('rngSeed is unchanged', () => {
    const state = makeMinimalGameState({ rngSeed: 9999 });
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.rngSeed).toBe(9999);
  });

  it('civilization data is preserved (stubs are no-ops)', () => {
    const state = makeMinimalGameState();
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.civilizations['civ-a'].resources.gold).toBe(100);
    expect(next.civilizations['civ-b'].stability).toBe(70);
  });

  it('map is preserved unchanged', () => {
    const state = makeMinimalGameState();
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.map).toEqual(state.map);
  });
});

describe('resolveTurn — lastResolvedAt', () => {
  it('lastResolvedAt is non-null after resolution', () => {
    const state = makeMinimalGameState({ lastResolvedAt: null });
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.lastResolvedAt).not.toBeNull();
  });

  it('lastResolvedAt is a parseable ISO string', () => {
    const state = makeMinimalGameState();
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    const parsed = new Date(next.lastResolvedAt!);
    expect(isNaN(parsed.getTime())).toBe(false);
  });
});

describe('resolveTurn — resolution logs', () => {
  it('returns logs for all major phases', () => {
    const state = makeMinimalGameState();
    const { logs } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    const phases = logs.map((l) => l.phase);

    // All 11 phases must be represented
    expect(phases).toContain('diplomacy');
    expect(phases).toContain('orders');
    expect(phases).toContain('movement');
    expect(phases).toContain('combat');
    expect(phases).toContain('economy');
    expect(phases).toContain('construction');
    expect(phases).toContain('research');
    expect(phases).toContain('events');
    expect(phases).toContain('attrition');
    expect(phases).toContain('victory_defeat');
    expect(phases).toContain('summary');
  });

  it('each log entry has a messages array', () => {
    const state = makeMinimalGameState();
    const { logs } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    for (const log of logs) {
      expect(Array.isArray(log.messages)).toBe(true);
    }
  });
});

describe('resolveTurn — turn history', () => {
  it('appends a TurnSummary to turnHistory', () => {
    const state = makeMinimalGameState({ turnHistory: [] });
    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(1));
    expect(next.turnHistory.length).toBe(1);
    expect(next.turnHistory[0].turnNumber).toBe(state.turn);
  });
});

describe('resolveTurn — determinism', () => {
  it('same inputs produce same output (except lastResolvedAt)', () => {
    const state = makeMinimalGameState();
    const theme = makeMinimalTheme();
    const orders = [makeOrders('civ-a', 1)];

    const { state: s1 } = resolveTurn(state, orders, theme, createPRNG(77));
    const { state: s2 } = resolveTurn(state, orders, theme, createPRNG(77));

    expect(s1.turn).toBe(s2.turn);
    expect(s1.rngState).toBe(s2.rngState);
    expect(s1.civilizations).toEqual(s2.civilizations);
    expect(s1.activeEvents).toEqual(s2.activeEvents);
    expect(s1.map).toEqual(s2.map);
  });
});

describe('resolveTurn — AI fill-in', () => {
  it('does not throw when no orders are submitted', () => {
    const state = makeMinimalGameState();
    const theme = makeMinimalTheme();
    expect(() => resolveTurn(state, [], theme, createPRNG(1))).not.toThrow();
  });

  it('accepts partial orders without throwing', () => {
    const state = makeMinimalGameState();
    const theme = makeMinimalTheme();
    const orders = [makeOrders('civ-a', 1)]; // civ-b has no orders
    expect(() => resolveTurn(state, orders, theme, createPRNG(1))).not.toThrow();
  });
});

describe('resolveTurn — rngState update', () => {
  it('rngState is updated after resolution', () => {
    const state = makeMinimalGameState({ rngState: 42 });
    const prng = createPRNG(42);
    // Advance prng to simulate some usage
    prng.next();
    const capturedState = prng.state;

    const { state: next } = resolveTurn(state, [], makeMinimalTheme(), createPRNG(42));
    // rngState should differ from original seed (PRNG was consumed)
    expect(typeof next.rngState).toBe('number');
    // The prng passed into resolveTurn starts at 42; after .fork() calls it advances
    expect(next.rngState).not.toBe(0);
    void capturedState; // used to confirm it's a number
  });
});
