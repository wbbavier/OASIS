import { describe, it, expect } from 'vitest';
import { evaluateTrigger, resolveEvents } from '@/engine/events';
import { createPRNG } from '@/engine/prng';
import type { GameState, CivilizationState, PlayerOrders, Hex, ActiveEvent } from '@/engine/types';
import type { ThemePackage, EventDefinition, EventTrigger } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCiv(id: string, overrides: Partial<CivilizationState> = {}): CivilizationState {
  return {
    id,
    playerId: null,
    resources: { grain: 10, dinars: 50 },
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

function makeHex(col: number, row: number): Hex {
  return {
    coord: { col, row },
    terrain: 'plains',
    settlement: null,
    controlledBy: null,
    units: [],
    resources: [],
    exploredBy: [],
  };
}

function makeState(civs: Record<string, CivilizationState>, turn = 1): GameState {
  return {
    gameId: 'g1',
    themeId: 'test',
    turn,
    phase: 'active',
    map: [[makeHex(0, 0)]],
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

function makeEventDef(overrides: Partial<EventDefinition> = {}): EventDefinition {
  return {
    id: 'test-event',
    name: 'Test Event',
    description: 'A test event',
    flavourText: 'Something happened.',
    trigger: { kind: 'always' },
    targetCivs: 'all',
    choices: [
      {
        id: 'default',
        label: 'Accept',
        effects: [],
      },
    ],
    defaultChoiceId: 'default',
    isRepeatable: false,
    weight: 1,
    ...overrides,
  };
}

function makeTheme(events: EventDefinition[] = []): ThemePackage {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    source: '',
    civilizations: [],
    map: { cols: 1, rows: 1, seaEdge: false, defaultTerrainWeights: {}, zones: [], settlementAnchors: [] },
    resources: [],
    techTree: [],
    buildings: [],
    units: [],
    events,
    diplomacyOptions: [],
    victoryConditions: [],
    defeatConditions: [],
    mechanics: {
      tensionAxes: [{ id: 'religious_fervor', name: 'Religious Fervor', description: '', minValue: 0, maxValue: 100 }],
      combatModifiers: {},
      resourceInteractions: [],
      turnCycleLength: 0,
      turnCycleNames: [],
      turnCycleEffects: [],
    },
    flavor: { turnName: 'Turn', currencyName: 'Gold', eraNames: [], settingDescription: '' },
  };
}

const NO_ORDERS: PlayerOrders[] = [];
const PRNG = createPRNG(42);

// ---------------------------------------------------------------------------
// evaluateTrigger tests
// ---------------------------------------------------------------------------

describe('evaluateTrigger — turn_number', () => {
  it('returns true when turn matches', () => {
    const civ = makeCiv('a');
    const state = makeState({ a: civ }, 5);
    const trigger: EventTrigger = { kind: 'turn_number', turn: 5 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(true);
  });

  it('returns false when turn does not match', () => {
    const civ = makeCiv('a');
    const state = makeState({ a: civ }, 4);
    const trigger: EventTrigger = { kind: 'turn_number', turn: 5 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — turn_range', () => {
  it('returns true when turn is within range', () => {
    const civ = makeCiv('a');
    const state = makeState({ a: civ }, 5);
    const trigger: EventTrigger = { kind: 'turn_range', minTurn: 3, maxTurn: 7 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(true);
  });

  it('returns false when turn is outside range', () => {
    const civ = makeCiv('a');
    const state = makeState({ a: civ }, 10);
    const trigger: EventTrigger = { kind: 'turn_range', minTurn: 3, maxTurn: 7 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — resource_below', () => {
  it('returns true when resource is below threshold', () => {
    const civ = makeCiv('a', { resources: { grain: 5 } });
    const state = makeState({ a: civ });
    const trigger: EventTrigger = { kind: 'resource_below', resourceId: 'grain', threshold: 10 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(true);
  });

  it('returns false when resource is at or above threshold', () => {
    const civ = makeCiv('a', { resources: { grain: 15 } });
    const state = makeState({ a: civ });
    const trigger: EventTrigger = { kind: 'resource_below', resourceId: 'grain', threshold: 10 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(false);
  });

  it('treats missing resource as 0', () => {
    const civ = makeCiv('a', { resources: {} });
    const state = makeState({ a: civ });
    const trigger: EventTrigger = { kind: 'resource_below', resourceId: 'grain', threshold: 5 };
    expect(evaluateTrigger(trigger, civ, state)).toBe(true);
  });
});

describe('evaluateTrigger — stability_below', () => {
  it('returns true when stability is below threshold', () => {
    const civ = makeCiv('a', { stability: 20 });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'stability_below', threshold: 30 }, civ, state)).toBe(true);
  });

  it('returns false when stability is at or above threshold', () => {
    const civ = makeCiv('a', { stability: 50 });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'stability_below', threshold: 30 }, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — tension_above', () => {
  it('returns true when tension axis exceeds threshold', () => {
    const civ = makeCiv('a', { tensionAxes: { religious_fervor: 80 } });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'tension_above', axis: 'religious_fervor', threshold: 60 }, civ, state)).toBe(true);
  });

  it('returns false when tension is at or below threshold', () => {
    const civ = makeCiv('a', { tensionAxes: { religious_fervor: 40 } });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'tension_above', axis: 'religious_fervor', threshold: 60 }, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — tech_completed', () => {
  it('returns true when tech is in completedTechs', () => {
    const civ = makeCiv('a', { completedTechs: ['crop-rotation'] });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'tech_completed', techId: 'crop-rotation' }, civ, state)).toBe(true);
  });

  it('returns false when tech is not completed', () => {
    const civ = makeCiv('a', { completedTechs: [] });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'tech_completed', techId: 'crop-rotation' }, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — war_declared', () => {
  it('returns true when civ is at war with anyone', () => {
    const civ = makeCiv('a', { diplomaticRelations: { 'civ-b': 'war' } });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'war_declared' }, civ, state)).toBe(true);
  });

  it('returns false when civ is not at war', () => {
    const civ = makeCiv('a', { diplomaticRelations: { 'civ-b': 'peace' } });
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'war_declared' }, civ, state)).toBe(false);
  });
});

describe('evaluateTrigger — always', () => {
  it('always returns true', () => {
    const civ = makeCiv('a');
    const state = makeState({ a: civ });
    expect(evaluateTrigger({ kind: 'always' }, civ, state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEvents — effect application
// ---------------------------------------------------------------------------

// Helper: make a pre-existing unresolved event (activatedOnTurn: 0 so Step 2 processes it at turn 1)
function makeStaleEvent(overrides: Partial<ActiveEvent> = {}): ActiveEvent {
  return {
    instanceId: 'stale-pre-existing',
    definitionId: 'test-event',
    targetCivilizationIds: ['civ-a'],
    activatedOnTurn: 0,
    expiresOnTurn: null,
    responses: {},
    resolved: false,
    ...overrides,
  };
}

describe('resolveEvents — resource_delta effect', () => {
  it('adds delta to resource', () => {
    const eventDef = makeEventDef({
      trigger: { kind: 'always' },
      targetCivs: 'all',
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'resource_delta', resourceId: 'grain', delta: 5 }] }],
    });
    // Pre-existing unresolved event; Step 2 auto-resolves it this turn
    const state = makeState({ 'civ-a': makeCiv('civ-a', { resources: { grain: 10 } }) }, 1);
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].resources['grain']).toBe(15);
  });

  it('clamps resource delta at 0 (never negative)', () => {
    const eventDef = makeEventDef({
      trigger: { kind: 'always' },
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'resource_delta', resourceId: 'grain', delta: -100 }] }],
    });
    const state = makeState({ 'civ-a': makeCiv('civ-a', { resources: { grain: 10 } }) }, 1);
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].resources['grain']).toBe(0);
  });
});

describe('resolveEvents — stability_delta effect', () => {
  it('clamps stability to [0, 100]', () => {
    const eventDef = makeEventDef({
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'stability_delta', delta: 50 }] }],
    });
    const state = makeState({ 'civ-a': makeCiv('civ-a', { stability: 90 }) }, 1);
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].stability).toBe(100);
  });
});

describe('resolveEvents — tension_delta effect', () => {
  it('clamps tension to axis maxValue', () => {
    const eventDef = makeEventDef({
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'tension_delta', axis: 'religious_fervor', delta: 50 }] }],
    });
    const state = makeState({ 'civ-a': makeCiv('civ-a', { tensionAxes: { religious_fervor: 80 } }) }, 1);
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].tensionAxes['religious_fervor']).toBe(100);
  });

  it('uses default [0, 100] range when axis not in theme', () => {
    const eventDef = makeEventDef({
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'tension_delta', axis: 'unknown_axis', delta: -200 }] }],
    });
    const state = makeState({ 'civ-a': makeCiv('civ-a', { tensionAxes: { unknown_axis: 50 } }) }, 1);
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].tensionAxes['unknown_axis']).toBe(0);
  });
});

describe('resolveEvents — force_war effect', () => {
  it('sets both civ relations to war', () => {
    const eventDef = makeEventDef({
      choices: [
        {
          id: 'default',
          label: 'Ok',
          effects: [{ kind: 'force_war', civId1: 'civ-a', civId2: 'civ-b' }],
        },
      ],
    });
    const state = makeState(
      {
        'civ-a': makeCiv('civ-a', { diplomaticRelations: { 'civ-b': 'peace' } }),
        'civ-b': makeCiv('civ-b', { diplomaticRelations: { 'civ-a': 'peace' } }),
      },
      1,
    );
    const stateWithEvent = { ...state, activeEvents: [makeStaleEvent()] };
    const result = resolveEvents(stateWithEvent, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('war');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('war');
  });
});

describe('resolveEvents — narrative effect', () => {
  it('does not change any state (no-op besides log)', () => {
    const eventDef = makeEventDef({
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'narrative', text: 'Something happened.' }] }],
    });
    const state = makeState({ 'civ-a': makeCiv('civ-a') });
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].resources).toEqual(state.civilizations['civ-a'].resources);
    expect(result.civilizations['civ-a'].stability).toBe(state.civilizations['civ-a'].stability);
  });
});

describe('resolveEvents — non-repeatable events', () => {
  it('does not re-activate a non-repeatable event that is already active', () => {
    const eventDef = makeEventDef({
      isRepeatable: false,
      choices: [{ id: 'default', label: 'Ok', effects: [{ kind: 'stability_delta', delta: -5 }] }],
    });
    const existingActive: ActiveEvent = {
      instanceId: 'test-event-civ-a-1-1',
      definitionId: 'test-event',
      targetCivilizationIds: ['civ-a'],
      activatedOnTurn: 1,
      expiresOnTurn: null,
      responses: {},
      resolved: true,
    };
    const state = makeState({ 'civ-a': makeCiv('civ-a', { stability: 80 }) });
    const stateWithActive = { ...state, activeEvents: [existingActive] };
    const result = resolveEvents(stateWithActive, NO_ORDERS, makeTheme([eventDef]), PRNG);
    // Should NOT have applied the effect again
    expect(result.civilizations['civ-a'].stability).toBe(80);
  });
});

describe('resolveEvents — event activation', () => {
  it('activates event and adds to activeEvents', () => {
    const eventDef = makeEventDef({ trigger: { kind: 'turn_number', turn: 1 } });
    const state = makeState({ 'civ-a': makeCiv('civ-a') }, 1);
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.activeEvents.length).toBeGreaterThan(0);
    expect(result.activeEvents[0].definitionId).toBe('test-event');
    expect(result.activeEvents[0].resolved).toBe(false);
  });

  it('does not activate event when trigger is false', () => {
    const eventDef = makeEventDef({ trigger: { kind: 'turn_number', turn: 5 } });
    const state = makeState({ 'civ-a': makeCiv('civ-a') }, 1);
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.activeEvents.length).toBe(0);
  });
});

describe('resolveEvents — targeting modes', () => {
  it('all: activates for all non-eliminated civs', () => {
    const eventDef = makeEventDef({ targetCivs: 'all', isRepeatable: true });
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    });
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.activeEvents.length).toBe(2);
  });

  it('all: skips eliminated civs', () => {
    const eventDef = makeEventDef({ targetCivs: 'all', isRepeatable: true });
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b', { isEliminated: true }),
    });
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.activeEvents.length).toBe(1);
  });

  it('random_one: activates for exactly one civ', () => {
    const eventDef = makeEventDef({ targetCivs: 'random_one' });
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
      'civ-c': makeCiv('civ-c'),
    });
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), createPRNG(1));
    expect(result.activeEvents.length).toBe(1);
  });

  it('specific civIds: only targets listed civs', () => {
    const eventDef = makeEventDef({ targetCivs: ['civ-b'], isRepeatable: true });
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    });
    const result = resolveEvents(state, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.activeEvents.length).toBe(1);
    expect(result.activeEvents[0].targetCivilizationIds).toContain('civ-b');
    expect(result.activeEvents[0].targetCivilizationIds).not.toContain('civ-a');
  });
});

describe('resolveEvents — event response (Step 1)', () => {
  it('applies player choice effects instead of default', () => {
    const eventDef = makeEventDef({
      choices: [
        { id: 'default', label: 'Default', effects: [{ kind: 'stability_delta', delta: -10 }] },
        { id: 'choice-b', label: 'Better', effects: [{ kind: 'stability_delta', delta: 5 }] },
      ],
      isRepeatable: false,
    });
    const activeEvent: ActiveEvent = {
      instanceId: 'evt-1',
      definitionId: 'test-event',
      targetCivilizationIds: ['civ-a'],
      activatedOnTurn: 1,
      expiresOnTurn: null,
      responses: {},
      resolved: false,
    };
    const state = makeState({ 'civ-a': makeCiv('civ-a', { stability: 80 }) });
    const stateWithEvent = { ...state, activeEvents: [activeEvent] };
    const orders: PlayerOrders[] = [
      {
        playerId: 'p1',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'event_response', eventInstanceId: 'evt-1', choiceId: 'choice-b' }],
        submittedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const result = resolveEvents(stateWithEvent, orders, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].stability).toBe(85);
  });
});

describe('resolveEvents — stale event auto-resolution (Step 2)', () => {
  it('auto-resolves events from prior turns with default choice', () => {
    const eventDef = makeEventDef({
      choices: [
        { id: 'default', label: 'Default', effects: [{ kind: 'stability_delta', delta: -5 }] },
      ],
    });
    const staleEvent: ActiveEvent = {
      instanceId: 'stale-1',
      definitionId: 'test-event',
      targetCivilizationIds: ['civ-a'],
      activatedOnTurn: 1, // activated on turn 1, but current turn is 2
      expiresOnTurn: null,
      responses: {},
      resolved: false,
    };
    const state = makeState({ 'civ-a': makeCiv('civ-a', { stability: 80 }) }, 2);
    const stateWithStale = { ...state, activeEvents: [staleEvent] };
    const result = resolveEvents(stateWithStale, NO_ORDERS, makeTheme([eventDef]), PRNG);
    expect(result.civilizations['civ-a'].stability).toBe(75);
    expect(result.activeEvents[0].resolved).toBe(true);
  });
});
