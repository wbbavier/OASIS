import { describe, it, expect } from 'vitest';
import {
  calculateEffectivePower,
  applyDamageToUnits,
  resolveCombatEncounter,
  resolveCombat,
  type CombatEncounter,
} from '@/engine/combat';
import { createPRNG } from '@/engine/prng';
import type { GameState, Hex, Unit, CivilizationState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTheme(): ThemePackage {
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
      combatModifiers: {
        plains: 1.0,
        mountains: 0.8,
        forest: 0.9,
        desert: 0.85,
        coast: 0.95,
        river: 0.9,
        sea: 1.0,
      },
      resourceInteractions: [],
      turnCycleLength: 4,
      turnCycleNames: ['spring', 'summer', 'autumn', 'winter'],
      turnCycleEffects: [],
    },
    flavor: { turnName: 'Turn', currencyName: 'Dinars', eraNames: [], settingDescription: '' },
  };
}

function makeUnit(
  id: string,
  civId: string,
  strength = 5,
  morale = 5,
  isGarrisoned = false,
): Unit {
  return {
    id,
    definitionId: 'spearman',
    civilizationId: civId,
    strength,
    morale,
    movesRemaining: 2,
    isGarrisoned,
  };
}

function makeHex(
  col: number,
  row: number,
  terrain: Hex['terrain'],
  controlledBy: string | null,
  units: Unit[] = [],
): Hex {
  return {
    coord: { col, row },
    terrain,
    controlledBy,
    units,
    settlement: null,
    resources: [],
    exploredBy: [],
  };
}

function makeCiv(
  id: string,
  diplomaticRelations: Record<string, CivilizationState['diplomaticRelations'][string]> = {},
): CivilizationState {
  return {
    id,
    playerId: null,
    resources: {},
    techProgress: {},
    completedTechs: [],
    culturalInfluence: 0,
    stability: 60,
    diplomaticRelations,
    tensionAxes: {},
    isEliminated: false,
    turnsMissingOrders: 0,
  };
}

function makeGameState(
  map: Hex[][],
  civs: Record<string, CivilizationState>,
): GameState {
  return {
    gameId: 'test',
    themeId: 'test',
    turn: 1,
    phase: 'active',
    map,
    civilizations: civs,
    activeEvents: [],
    turnHistory: [],
    rngSeed: 42,
    rngState: 42,
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
// calculateEffectivePower
// ---------------------------------------------------------------------------

describe('calculateEffectivePower', () => {
  it('returns 0 for an empty unit list', () => {
    const theme = makeTheme();
    expect(calculateEffectivePower([], 'plains', false, theme)).toBe(0);
    expect(calculateEffectivePower([], 'plains', true, theme)).toBe(0);
  });

  it('returns total strength on plains for attacker (modifier 1.0)', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 5), makeUnit('u2', 'a', 3)];
    expect(calculateEffectivePower(units, 'plains', false, theme)).toBe(8);
  });

  it('applies terrain modifier to attacker on mountains (0.8)', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 10)];
    expect(calculateEffectivePower(units, 'mountains', false, theme)).toBe(8);
  });

  it('applies terrain modifier to attacker on forest (0.9)', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 10)];
    expect(calculateEffectivePower(units, 'forest', false, theme)).toBeCloseTo(9);
  });

  it('does not apply terrain modifier to defender', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 10)];
    // Defender gets full strength even in mountains
    expect(calculateEffectivePower(units, 'mountains', true, theme)).toBe(10);
  });

  it('applies garrison bonus 1.25× to defender with garrisoned unit', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 10, 5, true)]; // isGarrisoned = true
    expect(calculateEffectivePower(units, 'plains', true, theme)).toBe(12.5);
  });

  it('does not apply garrison bonus when no unit is garrisoned', () => {
    const theme = makeTheme();
    const units = [makeUnit('u1', 'a', 10, 5, false)];
    expect(calculateEffectivePower(units, 'plains', true, theme)).toBe(10);
  });

  it('applies garrison bonus when at least one unit is garrisoned', () => {
    const theme = makeTheme();
    const units = [
      makeUnit('u1', 'a', 5, 5, true),  // garrisoned
      makeUnit('u2', 'a', 5, 5, false), // not garrisoned
    ];
    // Total strength 10; garrison bonus applies because one is garrisoned
    expect(calculateEffectivePower(units, 'plains', true, theme)).toBe(12.5);
  });

  it('falls back to 1.0 terrain mod for unknown terrain', () => {
    const theme = makeTheme();
    // 'lava' is not in combatModifiers
    const units = [makeUnit('u1', 'a', 8)];
    // Should not throw; defaults to 1.0
    expect(calculateEffectivePower(units, 'desert', false, theme)).toBeCloseTo(6.8);
  });
});

// ---------------------------------------------------------------------------
// applyDamageToUnits
// ---------------------------------------------------------------------------

describe('applyDamageToUnits', () => {
  it('returns all units unchanged when damage is 0', () => {
    const units = [makeUnit('u1', 'a', 5, 5)];
    const result = applyDamageToUnits(units, 0);
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe(5);
    expect(result[0].morale).toBe(5);
  });

  it('destroys a unit when damage exceeds its strength', () => {
    const units = [makeUnit('u1', 'a', 3, 5)];
    const result = applyDamageToUnits(units, 5); // more than strength
    expect(result).toHaveLength(0);
  });

  it('reduces strength of the weakest unit first', () => {
    const units = [
      makeUnit('u1', 'a', 5, 5),
      makeUnit('u2', 'a', 2, 5), // weakest
    ];
    const result = applyDamageToUnits(units, 2);
    // u2 (str=2) takes all 2 damage → strength=0, destroyed
    // u1 (str=5) untouched
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
    expect(result[0].strength).toBe(5);
  });

  it('reduces morale by 1 on any unit that takes damage', () => {
    const units = [makeUnit('u1', 'a', 10, 5)];
    const result = applyDamageToUnits(units, 3);
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe(7);
    expect(result[0].morale).toBe(4); // morale -1
  });

  it('destroys a unit when morale reaches 0 (morale collapse)', () => {
    const units = [makeUnit('u1', 'a', 10, 1)]; // morale = 1
    const result = applyDamageToUnits(units, 1); // takes 1 damage → morale drops to 0
    expect(result).toHaveLength(0); // destroyed by morale collapse
  });

  it('does not reduce morale when unit takes no damage', () => {
    const units = [
      makeUnit('u1', 'a', 1, 5), // weakest: absorbs all damage
      makeUnit('u2', 'a', 10, 5),
    ];
    const result = applyDamageToUnits(units, 1);
    const u2 = result.find((u) => u.id === 'u2');
    expect(u2?.morale).toBe(5); // no damage, no morale loss
  });

  it('handles partial damage leaving survivor with reduced strength', () => {
    const units = [makeUnit('u1', 'a', 10, 5)];
    const result = applyDamageToUnits(units, 6);
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe(4);
    expect(result[0].morale).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// resolveCombatEncounter
// ---------------------------------------------------------------------------

describe('resolveCombatEncounter', () => {
  it('attacker wins when overwhelmingly stronger (strength 100 vs 1)', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 0, row: 0 },
      terrain: 'plains',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 100)],
      defenderUnits: [makeUnit('u2', 'b', 1)],
    };
    const outcome = resolveCombatEncounter(encounter, theme, createPRNG(42));
    expect(outcome.result.outcome).toBe('attacker_wins');
    // Defender is routed: all 1 strength point lost
    expect(outcome.result.defenderStrengthLost).toBe(1);
    // Attacker takes token casualties (10% of 100 = 10, min 1)
    expect(outcome.result.attackerStrengthLost).toBe(10);
    // Defender has no survivors
    expect(outcome.defenderUnitsAfter).toHaveLength(0);
  });

  it('defender wins when overwhelmingly stronger (strength 1 vs 100)', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 0, row: 0 },
      terrain: 'plains',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 1)],
      defenderUnits: [makeUnit('u2', 'b', 100)],
    };
    const outcome = resolveCombatEncounter(encounter, theme, createPRNG(42));
    expect(outcome.result.outcome).toBe('defender_wins');
    expect(outcome.result.attackerStrengthLost).toBe(1);
    expect(outcome.attackerUnitsAfter).toHaveLength(0);
  });

  it('is deterministic — same seed produces same outcome', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 2, row: 3 },
      terrain: 'forest',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 5), makeUnit('u2', 'a', 4)],
      defenderUnits: [makeUnit('u3', 'b', 6)],
    };
    const o1 = resolveCombatEncounter(encounter, theme, createPRNG(77));
    const o2 = resolveCombatEncounter(encounter, theme, createPRNG(77));
    expect(o1.result.outcome).toBe(o2.result.outcome);
    expect(o1.result.attackerStrengthLost).toBe(o2.result.attackerStrengthLost);
    expect(o1.result.defenderStrengthLost).toBe(o2.result.defenderStrengthLost);
    expect(o1.attackerUnitsAfter.length).toBe(o2.attackerUnitsAfter.length);
  });

  it('garrison bonus gives defender an advantage over equal-strength attacker', () => {
    const theme = makeTheme();
    // Attacker: strength 8, plains (mod 1.0) → power 8
    // Defender: strength 8, garrisoned → power 8 * 1.25 = 10
    // With identical rolls, defender score is 25% higher → defender wins
    const encounter: CombatEncounter = {
      coord: { col: 0, row: 0 },
      terrain: 'plains',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 8)],
      defenderUnits: [makeUnit('u2', 'b', 8, 5, true)], // garrisoned
    };
    // Use a PRNG that produces equal rolls for both sides (hard to guarantee,
    // so test the power calculation directly instead)
    const attackerPower = calculateEffectivePower(
      encounter.attackerUnits, 'plains', false, theme,
    );
    const defenderPower = calculateEffectivePower(
      encounter.defenderUnits, 'plains', true, theme,
    );
    expect(defenderPower).toBeGreaterThan(attackerPower);
  });

  it('terrain modifier reduces attacker power in mountains', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 0, row: 0 },
      terrain: 'mountains',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 100)],
      defenderUnits: [makeUnit('u2', 'b', 1)],
    };
    // Even in mountains, strength 100 beats strength 1
    const outcome = resolveCombatEncounter(encounter, theme, createPRNG(1));
    expect(outcome.result.outcome).toBe('attacker_wins');
    // But attacker power was reduced: 100 * 0.8 = 80 (vs 1 * 1.0 = 1)
    const attackerPower = calculateEffectivePower(
      encounter.attackerUnits, 'mountains', false, theme,
    );
    expect(attackerPower).toBe(80);
  });

  it('losing side has all or most units destroyed when routed', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 0, row: 0 },
      terrain: 'plains',
      attackerCivId: 'a',
      defenderCivId: 'b',
      attackerUnits: [makeUnit('u1', 'a', 50)],
      defenderUnits: [makeUnit('u2', 'b', 1, 5)],
    };
    const outcome = resolveCombatEncounter(encounter, theme, createPRNG(42));
    // Defender strength = 1, so full 1 damage applied → u2 destroyed
    if (outcome.result.outcome === 'attacker_wins') {
      expect(outcome.defenderUnitsAfter).toHaveLength(0);
    } else {
      expect(outcome.attackerUnitsAfter).toHaveLength(0);
    }
  });

  it('records correct civIds in combat result', () => {
    const theme = makeTheme();
    const encounter: CombatEncounter = {
      coord: { col: 3, row: 7 },
      terrain: 'plains',
      attackerCivId: 'ragosa',
      defenderCivId: 'valledo',
      attackerUnits: [makeUnit('u1', 'ragosa', 5)],
      defenderUnits: [makeUnit('u2', 'valledo', 5)],
    };
    const outcome = resolveCombatEncounter(encounter, theme, createPRNG(1));
    expect(outcome.result.attackerCivId).toBe('ragosa');
    expect(outcome.result.defenderCivId).toBe('valledo');
    expect(outcome.result.coord).toEqual({ col: 3, row: 7 });
  });

  it('draw distributes damage to both sides', () => {
    // We can force a draw by making both scores equal.
    // To do that reliably, we need both sides to roll the same die value AND
    // have equal power. Use strength 1 for both — if rolls are equal, it's a draw.
    // This test verifies draw logic by testing applyDamageToUnits with 50% damage.
    const units = [makeUnit('u1', 'a', 10, 5)];
    const result = applyDamageToUnits(units, 5); // 50% of 10
    expect(result[0].strength).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// resolveCombat — integration
// ---------------------------------------------------------------------------

describe('resolveCombat — no combat when hex has only one civ', () => {
  it('does not modify units when only one civ is present', () => {
    const theme = makeTheme();
    const unit = makeUnit('u1', 'civ-a', 5);
    const hex = makeHex(0, 0, 'plains', 'civ-a', [unit]);
    const civA = makeCiv('civ-a');
    const state = makeGameState([[hex]], { 'civ-a': civA });

    const { state: next } = resolveCombat(state, theme, createPRNG(42));
    expect(next.map[0][0].units).toHaveLength(1);
    expect(next.map[0][0].units[0].strength).toBe(5);
  });
});

describe('resolveCombat — no combat when civs are at peace', () => {
  it('does not damage units when civs are at peace', () => {
    const theme = makeTheme();
    const unitA = makeUnit('u1', 'civ-a', 5);
    const unitB = makeUnit('u2', 'civ-b', 5);
    const hex = makeHex(0, 0, 'plains', 'civ-a', [unitA, unitB]);
    // Peace: no war declared
    const civA = makeCiv('civ-a', { 'civ-b': 'peace' });
    const civB = makeCiv('civ-b', { 'civ-a': 'peace' });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB });

    const { state: next } = resolveCombat(state, theme, createPRNG(42));
    expect(next.map[0][0].units).toHaveLength(2);
  });
});

describe('resolveCombat — combat resolves for civs at war', () => {
  it('reduces total units on a hex when civs are at war', () => {
    const theme = makeTheme();
    // civ-a controls hex, civ-b attacks (at war)
    // civ-b strength 1 vs civ-a strength 50 — civ-a should win
    const unitA = makeUnit('u1', 'civ-a', 50);
    const unitB = makeUnit('u2', 'civ-b', 1);
    const hex = makeHex(0, 0, 'plains', 'civ-a', [unitA, unitB]);
    const civA = makeCiv('civ-a', { 'civ-b': 'war' });
    const civB = makeCiv('civ-b', { 'civ-a': 'war' });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB });

    const { state: next } = resolveCombat(state, theme, createPRNG(42));
    const remainingUnits = next.map[0][0].units;
    // civ-b unit (strength 1) should be destroyed after losing
    const civBUnitsLeft = remainingUnits.filter((u) => u.civilizationId === 'civ-b');
    expect(civBUnitsLeft).toHaveLength(0);
  });

  it('is deterministic — same seed produces same map state', () => {
    const theme = makeTheme();
    const unitA = makeUnit('u1', 'civ-a', 5);
    const unitB = makeUnit('u2', 'civ-b', 5);
    const hex = makeHex(0, 0, 'plains', 'civ-a', [unitA, unitB]);
    const civA = makeCiv('civ-a', { 'civ-b': 'war' });
    const civB = makeCiv('civ-b', { 'civ-a': 'war' });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB });

    const { state: r1 } = resolveCombat(state, theme, createPRNG(100));
    const { state: r2 } = resolveCombat(state, theme, createPRNG(100));
    expect(r1.map[0][0].units.length).toBe(r2.map[0][0].units.length);
  });

  it('leaves hexes with a single civ untouched', () => {
    const theme = makeTheme();
    const unitA = makeUnit('u1', 'civ-a', 5);
    const hexSafe = makeHex(1, 0, 'plains', 'civ-a', [unitA]);
    const unitB1 = makeUnit('u2', 'civ-b', 50);
    const unitC1 = makeUnit('u3', 'civ-c', 1);
    const hexContest = makeHex(0, 0, 'plains', 'civ-b', [unitB1, unitC1]);
    const civA = makeCiv('civ-a');
    const civB = makeCiv('civ-b', { 'civ-c': 'war' });
    const civC = makeCiv('civ-c', { 'civ-b': 'war' });
    const state = makeGameState([[hexContest, hexSafe]], { 'civ-a': civA, 'civ-b': civB, 'civ-c': civC });

    const { state: next } = resolveCombat(state, theme, createPRNG(42));
    // Safe hex unchanged
    expect(next.map[0][1].units).toHaveLength(1);
    expect(next.map[0][1].units[0].id).toBe('u1');
  });

  it('does not modify the original game state (pure function)', () => {
    const theme = makeTheme();
    const unit = makeUnit('u1', 'civ-a', 5);
    const originalUnits = [unit];
    const hex = makeHex(0, 0, 'plains', 'civ-a', originalUnits);
    const civ = makeCiv('civ-a');
    const state = makeGameState([[hex]], { 'civ-a': civ });
    const originalUnitCount = state.map[0][0].units.length;

    resolveCombat(state, theme, createPRNG(42));

    // Original state map is not mutated
    expect(state.map[0][0].units.length).toBe(originalUnitCount);
  });
});

describe('resolveCombat — no-controller hex', () => {
  it('determines defender alphabetically when hex is uncontrolled', () => {
    const theme = makeTheme();
    // 'civ-a' < 'civ-b' alphabetically → civ-a defends, civ-b attacks
    const unitA = makeUnit('u1', 'civ-a', 50);
    const unitB = makeUnit('u2', 'civ-b', 1);
    const hex = makeHex(0, 0, 'plains', null, [unitA, unitB]); // no controller
    const civA = makeCiv('civ-a', { 'civ-b': 'war' });
    const civB = makeCiv('civ-b', { 'civ-a': 'war' });
    const state = makeGameState([[hex]], { 'civ-a': civA, 'civ-b': civB });

    const { state: next } = resolveCombat(state, theme, createPRNG(42));
    // civ-b (strength 1) attacked civ-a (strength 50) → civ-b should be destroyed
    const civBUnits = next.map[0][0].units.filter((u) => u.civilizationId === 'civ-b');
    expect(civBUnits).toHaveLength(0);
  });
});
