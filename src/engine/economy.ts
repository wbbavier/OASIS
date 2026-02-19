// Economy resolution — Phase 2 implementation.
// Computes terrain yields, building effects, seasonal modifiers, and upkeep.
// All functions are pure: no side effects, no async, no randomness.

import type { GameState, Hex, Unit, CivilizationState } from '@/engine/types';
import type { ThemePackage, TurnCycleEffect, ResourceDefinition } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Seasonal cycle
// ---------------------------------------------------------------------------

/**
 * Return the TurnCycleEffect for the current turn, or null if the theme has
 * no turn cycle defined.  Turn 1 = first phase, turn 5 = first phase again, etc.
 */
export function getCurrentSeasonEffect(
  turn: number,
  theme: ThemePackage,
): TurnCycleEffect | null {
  const { turnCycleLength, turnCycleEffects, turnCycleNames } = theme.mechanics;
  if (turnCycleLength <= 0 || turnCycleEffects.length === 0) return null;

  const phaseIndex = (turn - 1) % turnCycleLength;

  // First try to match by the phase name string (robust across theme variations)
  const phaseName = turnCycleNames[phaseIndex];
  if (phaseName) {
    const byName = turnCycleEffects.find((e) => e.phase === phaseName);
    if (byName) return byName;
  }

  // Fallback: positional lookup
  return turnCycleEffects[phaseIndex] ?? null;
}

// ---------------------------------------------------------------------------
// Terrain yields
// ---------------------------------------------------------------------------

/**
 * Calculate the resource yield from a single hex for one resource.
 * Returns a float — callers should accumulate and floor the total.
 */
export function calculateTerrainYieldForHex(
  hex: Hex,
  resource: ResourceDefinition,
  seasonEffect: TurnCycleEffect | null,
): number {
  const terrainYield = resource.terrainYields[hex.terrain] ?? 0;
  const base = resource.baseYield + terrainYield;
  if (base === 0) return 0;

  const seasonMod = seasonEffect?.resourceModifiers[resource.id] ?? 1.0;
  return base * seasonMod;
}

// ---------------------------------------------------------------------------
// Building effects
// ---------------------------------------------------------------------------

export interface BuildingEffectResult {
  /** Resource deltas from building output (excludes stability). */
  resourceDeltas: Record<string, number>;
  /** Net stability change from all buildings (from the 'stability' pseudo-resource). */
  stabilityDelta: number;
  /** Total upkeep cost in dinars for all buildings. */
  upkeepCost: number;
}

/**
 * Accumulate effects and upkeep for a list of building IDs.
 * Unknown building IDs are silently skipped.
 * Building effects with resourceId 'stability' are treated as stability modifiers,
 * not resource modifiers, and returned separately.
 */
export function calculateBuildingEffects(
  buildingIds: string[],
  theme: ThemePackage,
): BuildingEffectResult {
  const resourceDeltas: Record<string, number> = {};
  let stabilityDelta = 0;
  let upkeepCost = 0;

  for (const buildingId of buildingIds) {
    const def = theme.buildings.find((b) => b.id === buildingId);
    if (!def) continue;

    upkeepCost += def.upkeep;

    for (const effect of def.effects) {
      if (effect.resourceId === 'stability') {
        stabilityDelta += effect.delta;
      } else {
        resourceDeltas[effect.resourceId] =
          (resourceDeltas[effect.resourceId] ?? 0) + effect.delta;
      }
    }
  }

  return { resourceDeltas, stabilityDelta, upkeepCost };
}

// ---------------------------------------------------------------------------
// Unit upkeep
// ---------------------------------------------------------------------------

/**
 * Sum the upkeep cost for a list of units.
 * Units whose definitionId is not found in the theme are skipped.
 */
export function calculateUnitUpkeepCost(units: Unit[], theme: ThemePackage): number {
  let total = 0;
  for (const unit of units) {
    const def = theme.units.find((u) => u.id === unit.definitionId);
    if (def) total += def.upkeep;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Resource interactions
// ---------------------------------------------------------------------------

/**
 * Apply resource interaction bonuses: a fraction of the source resource
 * is added to the target resource.  Applied after all other yields so the
 * bonus is based on the fully-updated resource totals.
 */
export function applyResourceInteractions(
  resources: Record<string, number>,
  theme: ThemePackage,
): Record<string, number> {
  const result = { ...resources };
  for (const interaction of theme.mechanics.resourceInteractions) {
    const sourceAmount = result[interaction.sourceId] ?? 0;
    const bonus = Math.floor(sourceAmount * interaction.multiplier);
    if (bonus > 0) {
      result[interaction.targetId] = (result[interaction.targetId] ?? 0) + bonus;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main economy resolution
// ---------------------------------------------------------------------------

export function resolveEconomy(state: GameState, theme: ThemePackage): GameState {
  const seasonEffect = getCurrentSeasonEffect(state.turn, theme);
  const allHexes: Hex[] = state.map.flat();

  // Pre-compute unit upkeep per civilization from every unit on the map.
  // Unit upkeep is owed by the owning civ regardless of hex control.
  const unitUpkeepByCiv: Record<string, number> = {};
  for (const hex of allHexes) {
    for (const unit of hex.units) {
      const def = theme.units.find((u) => u.id === unit.definitionId);
      const cost = def ? def.upkeep : 0;
      unitUpkeepByCiv[unit.civilizationId] =
        (unitUpkeepByCiv[unit.civilizationId] ?? 0) + cost;
    }
  }

  const updatedCivs: Record<string, CivilizationState> = {};

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];

    if (civ.isEliminated) {
      updatedCivs[civId] = civ;
      continue;
    }

    // Accumulate all yield deltas as floats; floor on application.
    const yieldAccum: Record<string, number> = {};
    let stabilityDelta = 0;
    let totalBuildingUpkeep = 0;

    for (const hex of allHexes) {
      if (hex.controlledBy !== civId) continue;

      // Terrain yields for every resource defined in the theme
      for (const resource of theme.resources) {
        const y = calculateTerrainYieldForHex(hex, resource, seasonEffect);
        if (y !== 0) {
          yieldAccum[resource.id] = (yieldAccum[resource.id] ?? 0) + y;
        }
      }

      // Building effects from this hex's settlement (if any)
      if (hex.settlement) {
        const { resourceDeltas, stabilityDelta: bStab, upkeepCost } =
          calculateBuildingEffects(hex.settlement.buildings, theme);

        for (const [resId, delta] of Object.entries(resourceDeltas)) {
          yieldAccum[resId] = (yieldAccum[resId] ?? 0) + delta;
        }
        stabilityDelta += bStab;
        totalBuildingUpkeep += upkeepCost;
      }
    }

    // Seasonal stability modifier
    if (seasonEffect) {
      stabilityDelta += seasonEffect.stabilityModifier;
    }

    // Deduct all upkeep from the dinars yield accumulator
    const totalUpkeep = totalBuildingUpkeep + (unitUpkeepByCiv[civId] ?? 0);
    yieldAccum['dinars'] = (yieldAccum['dinars'] ?? 0) - totalUpkeep;

    // Apply floored yields to current resources (floored at 0)
    const newResources: Record<string, number> = { ...civ.resources };
    for (const [resId, delta] of Object.entries(yieldAccum)) {
      const current = newResources[resId] ?? 0;
      newResources[resId] = Math.max(0, current + Math.floor(delta));
    }

    // Apply resource interactions (bonus fractions of source → target)
    const finalResources = applyResourceInteractions(newResources, theme);

    // Apply stability change, clamped to [0, 100]
    const newStability = Math.max(
      0,
      Math.min(100, civ.stability + Math.floor(stabilityDelta)),
    );

    updatedCivs[civId] = {
      ...civ,
      resources: finalResources,
      stability: newStability,
    };
  }

  return { ...state, civilizations: updatedCivs };
}
