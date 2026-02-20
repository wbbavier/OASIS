import { describe, it, expect } from 'vitest';
import { resolveDiplomacy } from '@/engine/diplomacy';
import type { GameState, PlayerOrders, CivilizationState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCiv(id: string, relations: Record<string, 'peace' | 'war' | 'alliance' | 'truce' | 'vassal'> = {}): CivilizationState {
  return {
    id,
    playerId: null,
    resources: {},
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability: 80,
    diplomaticRelations: relations,
    tensionAxes: {},
    isEliminated: false,
    turnsMissingOrders: 0,
  };
}

function makeState(civs: Record<string, CivilizationState>): GameState {
  return {
    gameId: 'g1',
    themeId: 'test',
    turn: 1,
    phase: 'active',
    map: [],
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

const MINIMAL_THEME = { events: [], buildings: [], units: [], resources: [], techTree: [] } as unknown as ThemePackage;

function makeOrders(
  civId: string,
  actionType: string,
  targetCivId: string,
): PlayerOrders {
  return {
    playerId: `player-${civId}`,
    civilizationId: civId,
    turnNumber: 1,
    orders: [
      {
        kind: 'diplomatic',
        actionType: actionType as Parameters<typeof resolveDiplomacy>[1][0]['orders'][0] extends { actionType: infer A } ? A : never,
        targetCivId,
        payload: {},
      },
    ],
    submittedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveDiplomacy — declare_war', () => {
  it('sets both civs to war (symmetric)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace' }),
    });
    const orders = [makeOrders('civ-a', 'declare_war', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('war');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('war');
  });

  it('war cascade: also sets target\'s alliance partner to war', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace', 'civ-c': 'alliance' }),
      'civ-c': makeCiv('civ-c', { 'civ-b': 'alliance' }),
    });
    const orders = [makeOrders('civ-a', 'declare_war', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // Alliance partner of target goes to war with attacker
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-c']).toBe('war');
    expect(result.civilizations['civ-c'].diplomaticRelations['civ-a']).toBe('war');
  });

  it('war cascade does not cascade to non-alliance partners', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b', { 'civ-c': 'peace' }),
      'civ-c': makeCiv('civ-c', { 'civ-b': 'peace' }),
    });
    const orders = [makeOrders('civ-a', 'declare_war', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // civ-c was at peace with civ-b, should remain unchanged toward civ-a
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-c']).toBeUndefined();
  });
});

describe('resolveDiplomacy — propose_peace', () => {
  it('sets both civs to peace when both propose (mutual)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'war' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'war' }),
    });
    const orders = [
      makeOrders('civ-a', 'propose_peace', 'civ-b'),
      makeOrders('civ-b', 'propose_peace', 'civ-a'),
    ];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('peace');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('peace');
  });

  it('does not change state when only one side proposes peace', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'war' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'war' }),
    });
    const orders = [makeOrders('civ-a', 'propose_peace', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('war');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('war');
  });
});

describe('resolveDiplomacy — propose_alliance', () => {
  it('sets both civs to alliance when both propose (mutual)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace' }),
    });
    const orders = [
      makeOrders('civ-a', 'propose_alliance', 'civ-b'),
      makeOrders('civ-b', 'propose_alliance', 'civ-a'),
    ];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('alliance');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('alliance');
  });

  it('does not change state when only one side proposes alliance', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace' }),
    });
    const orders = [makeOrders('civ-a', 'propose_alliance', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('peace');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('peace');
  });
});

describe('resolveDiplomacy — break_alliance', () => {
  it('sets both civs to peace (symmetric)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'alliance' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'alliance' }),
    });
    const orders = [makeOrders('civ-a', 'break_alliance', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('peace');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('peace');
  });
});

describe('resolveDiplomacy — propose_truce', () => {
  it('sets both civs to truce when both propose (mutual)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'war' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'war' }),
    });
    const orders = [
      makeOrders('civ-a', 'propose_truce', 'civ-b'),
      makeOrders('civ-b', 'propose_truce', 'civ-a'),
    ];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('truce');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('truce');
  });
});

describe('resolveDiplomacy — propose_vassalage', () => {
  it('sets both civs to vassal (symmetric)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    });
    const orders = [makeOrders('civ-a', 'propose_vassalage', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('vassal');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('vassal');
  });
});

describe('resolveDiplomacy — no-change actions', () => {
  it('send_message does not change diplomatic relation', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace' }),
    });
    const orders = [makeOrders('civ-a', 'send_message', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('peace');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('peace');
  });

  it('offer_trade does not change diplomatic relation', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'alliance' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'alliance' }),
    });
    const orders = [makeOrders('civ-a', 'offer_trade', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('alliance');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('alliance');
  });
});

describe('resolveDiplomacy — edge cases', () => {
  it('non-existent target civ does not crash', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
    });
    const orders = [makeOrders('civ-a', 'declare_war', 'nonexistent')];
    expect(() => resolveDiplomacy(state, orders, MINIMAL_THEME)).not.toThrow();
  });

  it('non-diplomatic orders are ignored', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'peace' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'peace' }),
    });
    const orders: PlayerOrders[] = [
      {
        playerId: 'player-a',
        civilizationId: 'civ-a',
        turnNumber: 1,
        orders: [{ kind: 'research', techId: 'foo', pointsAllocated: 10 }],
        submittedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('peace');
  });

  it('empty orders array returns unchanged state', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'war' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'war' }),
    });
    const result = resolveDiplomacy(state, [], MINIMAL_THEME);
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('war');
    expect(result.civilizations['civ-b'].diplomaticRelations['civ-a']).toBe('war');
  });

  it('war declarations process before mutual proposals', () => {
    // civ-a and civ-b already allied, civ-c declares war on civ-b
    const state = makeState({
      'civ-a': makeCiv('civ-a', { 'civ-b': 'alliance' }),
      'civ-b': makeCiv('civ-b', { 'civ-a': 'alliance', 'civ-c': 'peace' }),
      'civ-c': makeCiv('civ-c', { 'civ-b': 'peace' }),
    });
    const orders: PlayerOrders[] = [
      makeOrders('civ-c', 'declare_war', 'civ-b'),
    ];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);

    // civ-c declared war on civ-b
    expect(result.civilizations['civ-c'].diplomaticRelations['civ-b']).toBe('war');
    // cascade: civ-a is allied with civ-b, so civ-c is also at war with civ-a
    expect(result.civilizations['civ-c'].diplomaticRelations['civ-a']).toBe('war');
    // civ-a and civ-b remain allied
    expect(result.civilizations['civ-a'].diplomaticRelations['civ-b']).toBe('alliance');
  });

  it('returns a new state object (pure function)', () => {
    const state = makeState({
      'civ-a': makeCiv('civ-a'),
      'civ-b': makeCiv('civ-b'),
    });
    const orders = [makeOrders('civ-a', 'declare_war', 'civ-b')];
    const result = resolveDiplomacy(state, orders, MINIMAL_THEME);
    expect(result).not.toBe(state);
    expect(state.civilizations['civ-a'].diplomaticRelations['civ-b']).toBeUndefined();
  });
});
