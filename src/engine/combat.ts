// Combat resolution — Phase 2 implementation.
// Seeded dice rolls, unit strength/morale resolution, terrain bonuses, garrison defence.
// All functions are pure: no side effects, no async.

import type {
  GameState,
  Unit,
  HexCoord,
  CombatResultSummary,
  PRNG,
  TerrainType,
} from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Multiplier applied to garrisoned defenders' total strength. */
const GARRISON_DEFENSE_BONUS = 1.25;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CombatEncounter {
  coord: HexCoord;
  terrain: TerrainType;
  attackerCivId: string;
  defenderCivId: string;
  attackerUnits: Unit[];
  defenderUnits: Unit[];
}

export interface CombatOutcome {
  attackerUnitsAfter: Unit[];
  defenderUnitsAfter: Unit[];
  result: CombatResultSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the effective combat power for a group of units on a given terrain.
 *
 * Attackers are penalised by terrain difficulty (combatModifiers < 1 = harder).
 * Defenders receive the full garrison bonus when any unit is garrisoned.
 * Defenders are NOT penalised by terrain — they fight on home ground.
 */
export function calculateEffectivePower(
  units: Unit[],
  terrain: TerrainType,
  isDefending: boolean,
  theme: ThemePackage,
): number {
  if (units.length === 0) return 0;

  const totalStrength = units.reduce((sum, u) => sum + u.strength, 0);

  if (isDefending) {
    const hasGarrison = units.some((u) => u.isGarrisoned);
    return totalStrength * (hasGarrison ? GARRISON_DEFENSE_BONUS : 1.0);
  }

  // Terrain modifier is applied only to the attacker
  const terrainMod =
    (theme.mechanics.combatModifiers[terrain as string] as number | undefined) ?? 1.0;
  return totalStrength * terrainMod;
}

/**
 * Distribute `totalDamage` strength points across units, weakest first.
 * Each damaged unit also loses 1 morale.
 * Units reduced to strength ≤ 0 or morale ≤ 0 are destroyed (not returned).
 */
export function applyDamageToUnits(units: Unit[], totalDamage: number): Unit[] {
  // Sort ascending: weakest units absorb damage first
  const sorted = [...units].sort((a, b) => a.strength - b.strength);
  let remaining = totalDamage;
  const survivors: Unit[] = [];

  for (const unit of sorted) {
    if (remaining <= 0) {
      survivors.push(unit);
      continue;
    }
    const damage = Math.min(unit.strength, remaining);
    remaining -= damage;
    const newStrength = unit.strength - damage;
    // Each unit that takes any damage loses 1 morale (morale collapse)
    const newMorale = damage > 0 ? Math.max(0, unit.morale - 1) : unit.morale;

    if (newStrength > 0 && newMorale > 0) {
      survivors.push({ ...unit, strength: newStrength, morale: newMorale });
    }
    // Unit is destroyed if strength OR morale reaches 0
  }

  return survivors;
}

// ---------------------------------------------------------------------------
// Encounter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single combat encounter between an attacker and a defender.
 *
 * Both sides roll d6; the roll is multiplied by the side's effective power.
 * The winner takes minimal casualties; the loser is routed (full strength lost).
 * In a draw both sides take 50% casualties.
 *
 * Uses two PRNG values (one per side) so the result is deterministic given
 * the same PRNG state.
 */
export function resolveCombatEncounter(
  encounter: CombatEncounter,
  theme: ThemePackage,
  prng: PRNG,
): CombatOutcome {
  const attackerPower = calculateEffectivePower(
    encounter.attackerUnits,
    encounter.terrain,
    false,
    theme,
  );
  const defenderPower = calculateEffectivePower(
    encounter.defenderUnits,
    encounter.terrain,
    true,
    theme,
  );

  // Each side rolls 1d6
  const attackerRoll = prng.nextInt(1, 6);
  const defenderRoll = prng.nextInt(1, 6);

  const attackerScore = attackerPower * attackerRoll;
  const defenderScore = defenderPower * defenderRoll;

  const rawAttackerStrength = encounter.attackerUnits.reduce((s, u) => s + u.strength, 0);
  const rawDefenderStrength = encounter.defenderUnits.reduce((s, u) => s + u.strength, 0);

  let outcome: 'attacker_wins' | 'defender_wins' | 'draw';
  let attackerStrengthLost: number;
  let defenderStrengthLost: number;

  if (attackerScore > defenderScore) {
    // Attacker wins: loser is routed, winner takes token casualties
    outcome = 'attacker_wins';
    attackerStrengthLost = Math.max(1, Math.floor(rawAttackerStrength * 0.1));
    defenderStrengthLost = rawDefenderStrength;
  } else if (defenderScore > attackerScore) {
    // Defender wins: attacker is repulsed, defender takes token casualties
    outcome = 'defender_wins';
    attackerStrengthLost = rawAttackerStrength;
    defenderStrengthLost = Math.max(1, Math.floor(rawDefenderStrength * 0.1));
  } else {
    // Exact draw: both sides take 50% casualties
    outcome = 'draw';
    attackerStrengthLost = Math.max(1, Math.floor(rawAttackerStrength * 0.5));
    defenderStrengthLost = Math.max(1, Math.floor(rawDefenderStrength * 0.5));
  }

  const attackerUnitsAfter = applyDamageToUnits(encounter.attackerUnits, attackerStrengthLost);
  const defenderUnitsAfter = applyDamageToUnits(encounter.defenderUnits, defenderStrengthLost);

  return {
    attackerUnitsAfter,
    defenderUnitsAfter,
    result: {
      attackerCivId: encounter.attackerCivId,
      defenderCivId: encounter.defenderCivId,
      coord: encounter.coord,
      attackerStrengthLost,
      defenderStrengthLost,
      outcome,
    },
  };
}

// ---------------------------------------------------------------------------
// Main combat resolution
// ---------------------------------------------------------------------------

/**
 * Scan every hex in the map.  Where units from two or more civilizations
 * occupy the same hex and are at war, resolve a combat encounter.
 *
 * Attacker / defender determination:
 *   - If the hex has a `controlledBy` civ with units present, that civ defends.
 *   - Otherwise the first civ alphabetically defends.
 * Only one attacker is resolved per hex per turn (the first civ found at war
 * with the defender).  Subsequent attackers are left for the next turn.
 *
 * The map is scanned top-left → bottom-right, making resolution order
 * deterministic.  The same PRNG advances sequentially across all encounters.
 */
export function resolveCombat(
  state: GameState,
  theme: ThemePackage,
  prng: PRNG,
): { state: GameState; combatResults: CombatResultSummary[] } {
  // Shallow-copy the map rows and hex objects so we can update units immutably
  const newMap = state.map.map((row) =>
    row.map((hex) => ({ ...hex, units: [...hex.units] })),
  );

  const combatResults: CombatResultSummary[] = [];

  for (let row = 0; row < newMap.length; row++) {
    for (let col = 0; col < (newMap[row]?.length ?? 0); col++) {
      const hex = newMap[row][col];
      if (!hex || hex.units.length < 2) continue;

      // Group units by the civilization that owns them
      const civUnits: Record<string, Unit[]> = {};
      for (const unit of hex.units) {
        if (!civUnits[unit.civilizationId]) civUnits[unit.civilizationId] = [];
        civUnits[unit.civilizationId].push(unit);
      }

      const civIds = Object.keys(civUnits);
      if (civIds.length < 2) continue;

      // Determine defender (hex controller or first alphabetically)
      const defenderCivId: string =
        hex.controlledBy !== null && civUnits[hex.controlledBy]
          ? hex.controlledBy
          : [...civIds].sort()[0];

      // Find the first civ on this hex that is at war with the defender
      const defenderRelations =
        state.civilizations[defenderCivId]?.diplomaticRelations ?? {};

      const attackerCivId = civIds.find(
        (id) => id !== defenderCivId && defenderRelations[id] === 'war',
      );

      if (!attackerCivId) continue; // No active war on this hex

      const attackerUnits = civUnits[attackerCivId] ?? [];
      const defenderUnits = civUnits[defenderCivId] ?? [];

      if (attackerUnits.length === 0 || defenderUnits.length === 0) continue;

      const encounter: CombatEncounter = {
        coord: hex.coord,
        terrain: hex.terrain,
        attackerCivId,
        defenderCivId,
        attackerUnits,
        defenderUnits,
      };

      const outcome = resolveCombatEncounter(encounter, theme, prng);
      combatResults.push(outcome.result);

      // Rebuild the hex's unit list: keep unaffected civs, replace combatants
      const unaffected = hex.units.filter(
        (u) => u.civilizationId !== attackerCivId && u.civilizationId !== defenderCivId,
      );

      newMap[row][col] = {
        ...hex,
        units: [
          ...unaffected,
          ...outcome.attackerUnitsAfter,
          ...outcome.defenderUnitsAfter,
        ],
      };
    }
  }

  return { state: { ...state, map: newMap }, combatResults };
}
