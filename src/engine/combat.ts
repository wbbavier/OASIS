// Combat resolution — reworked with softer casualties, tech/seasonal/civ modifiers,
// retreat mechanics, and random defender selection on neutral hexes.
// All functions are pure: no side effects, no async.

import type {
  GameState,
  Unit,
  Hex,
  HexCoord,
  CombatResultSummary,
  PRNG,
  TerrainType,
} from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { getNeighbors } from '@/engine/map-generator';
import { getCustomTechEffectValue } from '@/engine/economy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Multiplier applied to garrisoned defenders' total strength. */
const GARRISON_DEFENSE_BONUS = 1.25;

/** Casualty rates by outcome */
const LOSER_CASUALTY_RATE = 0.6;
const WINNER_CASUALTY_RATE = 0.15;
const DRAW_CASUALTY_RATE = 0.4;

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
  loserCivId: string | null; // null on draw
  result: CombatResultSummary;
}

// ---------------------------------------------------------------------------
// Tech combat bonus
// ---------------------------------------------------------------------------

/**
 * Sum all combat_modifier effects from completed techs for a civ.
 */
export function getTechCombatBonus(
  state: GameState,
  civId: string,
  theme: ThemePackage,
): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;
  let bonus = 0;
  for (const techId of civ.completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'combat_modifier') {
        bonus += effect.value;
      }
    }
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Seasonal combat modifier
// ---------------------------------------------------------------------------

/**
 * Read the combatModifier for the current season from the theme's turn cycle.
 */
export function getSeasonCombatModifier(
  state: GameState,
  theme: ThemePackage,
): number {
  const { turnCycleLength, turnCycleEffects, turnCycleNames } = theme.mechanics;
  if (turnCycleLength <= 0 || turnCycleEffects.length === 0) return 0;
  const phaseIndex = (state.turn - 1) % turnCycleLength;
  const phaseName = turnCycleNames[phaseIndex];
  const effect = phaseName
    ? turnCycleEffects.find((e) => e.phase === phaseName) ?? turnCycleEffects[phaseIndex]
    : turnCycleEffects[phaseIndex];
  return effect?.combatModifier ?? 0;
}

// ---------------------------------------------------------------------------
// Civ special ability parsing
// ---------------------------------------------------------------------------

/**
 * Parse known combat-related special ability patterns.
 * Returns { attackBonus, defendBonus(terrain) }.
 */
function parseCivCombatAbilities(
  specialAbilities: string[],
  isAttacking: boolean,
  terrain: TerrainType,
): number {
  let bonus = 0;
  for (const ability of specialAbilities) {
    // "Units gain +N combat strength when attacking"
    const attackMatch = ability.match(/Units gain \+(\d+) combat strength when attacking/i);
    if (attackMatch && isAttacking) {
      bonus += parseInt(attackMatch[1], 10);
    }
    // "Units defending in <terrain> gain +N combat strength"
    const defendMatch = ability.match(/Units defending in (\w+) gain \+(\d+) combat strength/i);
    if (defendMatch && !isAttacking) {
      const abilityTerrain = defendMatch[1].toLowerCase();
      if (abilityTerrain === terrain) {
        bonus += parseInt(defendMatch[2], 10);
      }
    }
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Effective power
// ---------------------------------------------------------------------------

/**
 * Calculate the effective combat power for a group of units on a given terrain.
 * Now includes tech bonus, seasonal modifier, and civ special abilities.
 */
export function calculateEffectivePower(
  units: Unit[],
  terrain: TerrainType,
  isDefending: boolean,
  theme: ThemePackage,
  techBonus: number,
  seasonalMod: number,
  civAbilityBonus: number,
): number {
  if (units.length === 0) return 0;

  const totalStrength = units.reduce((sum, u) => sum + u.strength, 0);
  let power: number;

  if (isDefending) {
    const hasGarrison = units.some((u) => u.isGarrisoned);
    power = totalStrength * (hasGarrison ? GARRISON_DEFENSE_BONUS : 1.0);
  } else {
    // Terrain modifier is applied only to the attacker
    const terrainMod =
      (theme.mechanics.combatModifiers[terrain as string] as number | undefined) ?? 1.0;
    power = totalStrength * terrainMod;
  }

  // Additive bonuses
  power += techBonus + seasonalMod + civAbilityBonus;

  return Math.max(0, power);
}

/**
 * Distribute `totalDamage` strength points across units, weakest first.
 * Each damaged unit also loses 1 morale.
 * Units reduced to strength <= 0 or morale <= 0 are destroyed (not returned).
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
// Retreat
// ---------------------------------------------------------------------------

/**
 * Find the best retreat hex: one step toward the civ's capital via BFS.
 * Returns null if no retreat path exists.
 */
export function findRetreatHex(
  map: Hex[][],
  from: HexCoord,
  capitalCoord: HexCoord | null,
  cols: number,
  rows: number,
): HexCoord | null {
  if (!capitalCoord) return null;

  const hexLookup = new Map<string, Hex>();
  for (const row of map) {
    for (const hex of row) {
      hexLookup.set(`${hex.coord.col},${hex.coord.row}`, hex);
    }
  }

  const fromKey = `${from.col},${from.row}`;
  const targetKey = `${capitalCoord.col},${capitalCoord.row}`;
  if (fromKey === targetKey) return null;

  // BFS from `from` toward capital
  const visited = new Set<string>([fromKey]);
  const parent = new Map<string, string>();
  const queue: HexCoord[] = [from];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.col},${current.row}`;
    const neighbors = getNeighbors(current, cols, rows);

    for (const neighbor of neighbors) {
      const nKey = `${neighbor.col},${neighbor.row}`;
      if (visited.has(nKey)) continue;
      visited.add(nKey);

      const hex = hexLookup.get(nKey);
      if (!hex || hex.terrain === 'sea') continue;

      parent.set(nKey, currentKey);

      if (nKey === targetKey) {
        // Trace back to first step from `from`
        let stepKey = nKey;
        while (parent.get(stepKey) !== fromKey) {
          stepKey = parent.get(stepKey)!;
        }
        const [sc, sr] = stepKey.split(',').map(Number);
        return { col: sc, row: sr };
      }

      queue.push(neighbor);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Encounter resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a single combat encounter between an attacker and a defender.
 * Softer casualty rates, tech/seasonal/civ modifiers applied.
 */
export function resolveCombatEncounter(
  encounter: CombatEncounter,
  state: GameState,
  theme: ThemePackage,
  prng: PRNG,
): CombatOutcome {
  // Tech bonuses
  let attackerTechBonus = getTechCombatBonus(state, encounter.attackerCivId, theme);
  let defenderTechBonus = getTechCombatBonus(state, encounter.defenderCivId, theme);

  // Custom tech effect: siege_combat_bonus — attacker bonus when battle hex has a settlement
  const hexHasSettlement = state.map.flat().some(
    (h) => h.coord.col === encounter.coord.col && h.coord.row === encounter.coord.row && h.settlement !== null,
  );
  if (hexHasSettlement) {
    attackerTechBonus += getCustomTechEffectValue(state, encounter.attackerCivId, 'siege_combat_bonus', theme);
  }

  // Custom tech effect: cavalry_combat_bonus — bonus when force has cavalry units
  const cavalryPattern = /cavalry|horseman|knight|rider/i;
  const attackerHasCavalry = encounter.attackerUnits.some((u) => {
    const unitDef = theme.units.find((d) => d.id === u.definitionId);
    return unitDef && cavalryPattern.test(unitDef.name);
  });
  if (attackerHasCavalry) {
    attackerTechBonus += getCustomTechEffectValue(state, encounter.attackerCivId, 'cavalry_combat_bonus', theme);
  }
  const defenderHasCavalry = encounter.defenderUnits.some((u) => {
    const unitDef = theme.units.find((d) => d.id === u.definitionId);
    return unitDef && cavalryPattern.test(unitDef.name);
  });
  if (defenderHasCavalry) {
    defenderTechBonus += getCustomTechEffectValue(state, encounter.defenderCivId, 'cavalry_combat_bonus', theme);
  }

  // Custom tech effect: capital_defense_combat_bonus — defender bonus when defending on capital hex
  const defenderCapitalCoord = findCapitalCoord(state.map, encounter.defenderCivId);
  if (
    defenderCapitalCoord &&
    defenderCapitalCoord.col === encounter.coord.col &&
    defenderCapitalCoord.row === encounter.coord.row
  ) {
    defenderTechBonus += getCustomTechEffectValue(state, encounter.defenderCivId, 'capital_defense_combat_bonus', theme);
  }

  // Seasonal modifier (additive, same for both sides)
  const seasonalMod = getSeasonCombatModifier(state, theme);

  // Custom tech effect: settlement_defense_bonus — defender bonus on settlement hexes
  if (hexHasSettlement) {
    defenderTechBonus += getCustomTechEffectValue(state, encounter.defenderCivId, 'settlement_defense_bonus', theme);
  }

  // Civ special abilities
  const attackerCivDef = theme.civilizations.find((c) => c.id === encounter.attackerCivId);
  const defenderCivDef = theme.civilizations.find((c) => c.id === encounter.defenderCivId);
  const attackerAbilityBonus = parseCivCombatAbilities(
    attackerCivDef?.specialAbilities ?? [], true, encounter.terrain,
  );
  const defenderAbilityBonus = parseCivCombatAbilities(
    defenderCivDef?.specialAbilities ?? [], false, encounter.terrain,
  );

  // Civ ability: Reconquista Drive — attack bonus vs different religion
  if (attackerCivDef && defenderCivDef) {
    for (const ability of attackerCivDef.specialAbilities) {
      const reconquistaMatch = ability.match(/Units get \+(\d+) combat strength when attacking.*different.religion/i);
      // Also match "Gain +N faith when capturing Asharite settlements" pattern as combat boost
      if (reconquistaMatch) {
        if (attackerCivDef.religion && defenderCivDef.religion && attackerCivDef.religion !== defenderCivDef.religion) {
          attackerTechBonus += parseInt(reconquistaMatch[1], 10);
        }
      }
    }
  }

  const attackerPower = calculateEffectivePower(
    encounter.attackerUnits, encounter.terrain, false, theme,
    attackerTechBonus, seasonalMod, attackerAbilityBonus,
  );
  const defenderPower = calculateEffectivePower(
    encounter.defenderUnits, encounter.terrain, true, theme,
    defenderTechBonus, seasonalMod, defenderAbilityBonus,
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
  let loserCivId: string | null;

  if (attackerScore > defenderScore) {
    outcome = 'attacker_wins';
    attackerStrengthLost = Math.max(1, Math.floor(rawAttackerStrength * WINNER_CASUALTY_RATE));
    defenderStrengthLost = Math.max(1, Math.floor(rawDefenderStrength * LOSER_CASUALTY_RATE));
    loserCivId = encounter.defenderCivId;
  } else if (defenderScore > attackerScore) {
    outcome = 'defender_wins';
    attackerStrengthLost = Math.max(1, Math.floor(rawAttackerStrength * LOSER_CASUALTY_RATE));
    defenderStrengthLost = Math.max(1, Math.floor(rawDefenderStrength * WINNER_CASUALTY_RATE));
    loserCivId = encounter.attackerCivId;
  } else {
    outcome = 'draw';
    attackerStrengthLost = Math.max(1, Math.floor(rawAttackerStrength * DRAW_CASUALTY_RATE));
    defenderStrengthLost = Math.max(1, Math.floor(rawDefenderStrength * DRAW_CASUALTY_RATE));
    loserCivId = null;
  }

  const attackerUnitsAfter = applyDamageToUnits(encounter.attackerUnits, attackerStrengthLost);
  const defenderUnitsAfter = applyDamageToUnits(encounter.defenderUnits, defenderStrengthLost);

  return {
    attackerUnitsAfter,
    defenderUnitsAfter,
    loserCivId,
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
// Capital lookup helper
// ---------------------------------------------------------------------------

function findCapitalCoord(map: Hex[][], civId: string): HexCoord | null {
  for (const row of map) {
    for (const hex of row) {
      if (hex.controlledBy === civId && hex.settlement?.isCapital) {
        return hex.coord;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main combat resolution
// ---------------------------------------------------------------------------

/**
 * Scan every hex in the map. Where units from two or more civilizations
 * occupy the same hex and are at war, resolve a combat encounter.
 *
 * Attacker / defender determination:
 *   - If the hex has a `controlledBy` civ with units present, that civ defends.
 *   - Otherwise a random civ defends (PRNG-based, no alphabetical bias).
 */
export function resolveCombat(
  state: GameState,
  theme: ThemePackage,
  prng: PRNG,
): { state: GameState; combatResults: CombatResultSummary[] } {
  const newMap = state.map.map((row) =>
    row.map((hex) => ({ ...hex, units: [...hex.units] })),
  );

  const mapRows = newMap.length;
  const mapCols = mapRows > 0 ? (newMap[0]?.length ?? 0) : 0;
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

      // Determine defender: hex controller with units, or random pick
      let defenderCivId: string;
      if (hex.controlledBy !== null && civUnits[hex.controlledBy]) {
        defenderCivId = hex.controlledBy;
      } else {
        // Random defender selection instead of alphabetical
        const idx = prng.nextInt(0, civIds.length - 1);
        defenderCivId = civIds[idx];
      }

      // Find the first civ on this hex that is at war with the defender
      const defenderRelations =
        state.civilizations[defenderCivId]?.diplomaticRelations ?? {};

      const attackerCivId = civIds.find(
        (id) => id !== defenderCivId && defenderRelations[id] === 'war',
      );

      if (!attackerCivId) continue;

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

      const outcome = resolveCombatEncounter(encounter, state, theme, prng);
      combatResults.push(outcome.result);

      // Rebuild the hex's unit list: keep unaffected civs, replace combatants
      const unaffected = hex.units.filter(
        (u) => u.civilizationId !== attackerCivId && u.civilizationId !== defenderCivId,
      );

      // Retreat: surviving losing units move 1 hex toward their capital
      let winnerUnits: Unit[];
      let loserUnits: Unit[];
      if (outcome.loserCivId === attackerCivId) {
        winnerUnits = outcome.defenderUnitsAfter;
        loserUnits = outcome.attackerUnitsAfter;
      } else if (outcome.loserCivId === defenderCivId) {
        winnerUnits = outcome.attackerUnitsAfter;
        loserUnits = outcome.defenderUnitsAfter;
      } else {
        // Draw — both stay
        winnerUnits = [...outcome.attackerUnitsAfter, ...outcome.defenderUnitsAfter];
        loserUnits = [];
      }

      // Place winners on the battle hex
      newMap[row][col] = {
        ...hex,
        units: [...unaffected, ...winnerUnits, ...(outcome.loserCivId === null ? [] : [])],
      };

      // Retreat losing survivors
      if (outcome.loserCivId && loserUnits.length > 0) {
        const capitalCoord = findCapitalCoord(newMap, outcome.loserCivId);
        const retreatHex = findRetreatHex(newMap, hex.coord, capitalCoord, mapCols, mapRows);
        if (retreatHex) {
          // Place retreating units on the retreat hex
          const rRow = retreatHex.row;
          const rCol = retreatHex.col;
          if (newMap[rRow]?.[rCol]) {
            newMap[rRow][rCol] = {
              ...newMap[rRow][rCol],
              units: [...newMap[rRow][rCol].units, ...loserUnits],
            };
          } else {
            // Fallback: stay on battle hex
            newMap[row][col] = {
              ...newMap[row][col],
              units: [...newMap[row][col].units, ...loserUnits],
            };
          }
        } else {
          // No retreat path — stay on battle hex
          newMap[row][col] = {
            ...newMap[row][col],
            units: [...newMap[row][col].units, ...loserUnits],
          };
        }
      }
    }
  }

  return { state: { ...state, map: newMap }, combatResults };
}
