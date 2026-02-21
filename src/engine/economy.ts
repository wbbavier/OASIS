// Economy resolution — Phase 2 implementation.
// Computes terrain yields, building effects, seasonal modifiers, and upkeep.
// All functions are pure: no side effects, no async, no randomness.

import type { GameState, Hex, Unit, CivilizationState } from '@/engine/types';
import type { ThemePackage, TurnCycleEffect, ResourceDefinition, TechEffect } from '@/themes/schema';
import { getNeighbors } from '@/engine/map-generator';

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

/**
 * Same as applyResourceInteractions but caps each resource's interaction
 * bonus at 20 per turn to prevent runaway scaling.
 */
export function applyResourceInteractionsCapped(
  resources: Record<string, number>,
  theme: ThemePackage,
): Record<string, number> {
  const result = { ...resources };
  const bonusAccum: Record<string, number> = {};
  for (const interaction of theme.mechanics.resourceInteractions) {
    const sourceAmount = result[interaction.sourceId] ?? 0;
    const bonus = Math.floor(sourceAmount * interaction.multiplier);
    if (bonus > 0) {
      const currentBonus = bonusAccum[interaction.targetId] ?? 0;
      const cappedBonus = Math.min(bonus, 20 - currentBonus);
      if (cappedBonus > 0) {
        result[interaction.targetId] = (result[interaction.targetId] ?? 0) + cappedBonus;
        bonusAccum[interaction.targetId] = currentBonus + cappedBonus;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tech effects
// ---------------------------------------------------------------------------

/**
 * Collect resource multipliers from completed techs for a civ.
 * Multiple techs affecting the same resource multiply together.
 */
export function getTechResourceMultipliers(
  completedTechs: string[],
  theme: ThemePackage,
): Record<string, number> {
  const multipliers: Record<string, number> = {};
  for (const techId of completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'resource_modifier') {
        multipliers[effect.resourceId] =
          (multipliers[effect.resourceId] ?? 1.0) * effect.multiplier;
      }
    }
  }
  return multipliers;
}

/**
 * Sum stability modifiers from completed techs for a civ.
 */
export function getTechStabilityBonus(
  completedTechs: string[],
  theme: ThemePackage,
): number {
  let bonus = 0;
  for (const techId of completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'stability_modifier') {
        bonus += effect.value;
      }
    }
  }
  return bonus;
}

// ---------------------------------------------------------------------------
// Custom tech effect helper
// ---------------------------------------------------------------------------

/**
 * Scan a civ's completed techs for `kind: 'custom'` effects matching a given key.
 * Returns the sum of all matching effect values (cast to number, defaulting to 0).
 */
export function getCustomTechEffectValue(
  state: GameState,
  civId: string,
  key: string,
  theme: ThemePackage,
): number {
  const civ = state.civilizations[civId];
  if (!civ) return 0;
  let total = 0;
  for (const techId of civ.completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'custom' && effect.key === key) {
        total += typeof effect.value === 'number' ? effect.value : 0;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Main economy resolution
// ---------------------------------------------------------------------------

export function resolveEconomy(
  state: GameState,
  theme: ThemePackage,
  allocationOrders?: Record<string, Record<string, number>>,
): GameState {
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

    // Tech modifiers for this civ
    const techMultipliers = getTechResourceMultipliers(civ.completedTechs, theme);
    const techStabilityBonus = getTechStabilityBonus(civ.completedTechs, theme);

    for (const hex of allHexes) {
      if (hex.controlledBy !== civId) continue;

      // Terrain yields for every resource defined in the theme
      for (const resource of theme.resources) {
        let y = calculateTerrainYieldForHex(hex, resource, seasonEffect);
        // Apply tech resource multipliers (after seasonal, before building effects)
        const techMul = techMultipliers[resource.id];
        if (techMul !== undefined) {
          y *= techMul;
        }
        if (y !== 0) {
          yieldAccum[resource.id] = (yieldAccum[resource.id] ?? 0) + y;
        }
      }

      // Building effects from this hex's settlement (if any)
      if (hex.settlement) {
        const { resourceDeltas, stabilityDelta: bStab, upkeepCost } =
          calculateBuildingEffects(hex.settlement.buildings, theme);

        // Civ ability: Cultural Patronage — culture buildings produce +X% culture (faith)
        const civDefForBuildings = theme.civilizations.find((c) => c.id === civId);
        if (civDefForBuildings) {
          for (const ability of civDefForBuildings.specialAbilities) {
            const patronageMatch = ability.match(/Culture buildings produce \+(\d+)% culture/i);
            const faithGainMatch = ability.match(/Gain \+(\d+)% faith when constructing cultural buildings/i);
            const match = patronageMatch ?? faithGainMatch;
            if (match) {
              const multiplier = 1 + parseInt(match[1], 10) / 100;
              // Check if any buildings in this settlement are "cultural" (library, observatory, mosque, cathedral)
              const culturalPattern = /library|observatory|mosque|cathedral/i;
              for (const buildingId of hex.settlement.buildings) {
                const bDef = theme.buildings.find((b) => b.id === buildingId);
                if (bDef && culturalPattern.test(bDef.name)) {
                  // Multiply faith delta from this building
                  for (const effect of bDef.effects) {
                    if (effect.resourceId === 'faith') {
                      const bonus = Math.floor(effect.delta * (multiplier - 1));
                      if (bonus > 0) {
                        resourceDeltas['faith'] = (resourceDeltas['faith'] ?? 0) + bonus;
                      }
                    }
                  }
                }
              }
            }
          }
        }

        for (const [resId, delta] of Object.entries(resourceDeltas)) {
          yieldAccum[resId] = (yieldAccum[resId] ?? 0) + delta;
        }
        stabilityDelta += bStab;
        totalBuildingUpkeep += upkeepCost;

        // Civ ability: "Sea Traders: Ports generate +N extra trade_goods per turn"
        const civDef = theme.civilizations.find((c) => c.id === civId);
        if (civDef && hex.settlement.buildings.includes('port')) {
          for (const ability of civDef.specialAbilities) {
            const seaMatch = ability.match(/Ports generate \+(\d+) extra trade_goods/i);
            if (seaMatch) {
              yieldAccum['trade_goods'] = (yieldAccum['trade_goods'] ?? 0) + parseInt(seaMatch[1], 10);
            }
          }
        }

        // Civ ability: Merchant Cavalry — cavalry units in settlements with a market generate +N dinars
        if (civDef) {
          for (const ability of civDef.specialAbilities) {
            const cavMatch = ability.match(/Cavalry units generate \+(\d+) dinars.*market/i);
            if (cavMatch && hex.settlement.buildings.includes('market')) {
              const bonusPerUnit = parseInt(cavMatch[1], 10);
              const cavalryPattern = /cavalry|horseman|knight|rider/i;
              const cavalryUnitsOnHex = hex.units.filter((u) => {
                if (u.civilizationId !== civId) return false;
                const uDef = theme.units.find((ud) => ud.id === u.definitionId);
                return uDef && cavalryPattern.test(uDef.name);
              });
              if (cavalryUnitsOnHex.length > 0) {
                yieldAccum['dinars'] = (yieldAccum['dinars'] ?? 0) + (bonusPerUnit * cavalryUnitsOnHex.length);
              }
            }
          }
        }
      }
    }

    // Civ ability: "Diaspora Network: Generate +N dinars from every friendly settlement on the map"
    const civDef = theme.civilizations.find((c) => c.id === civId);
    if (civDef) {
      for (const ability of civDef.specialAbilities) {
        const diasporaMatch = ability.match(/Generate \+(\d+) dinars? from every friendly settlement/i);
        if (diasporaMatch) {
          const bonus = parseInt(diasporaMatch[1], 10);
          const friendlyRelations = civ.diplomaticRelations;
          let friendlySettlementCount = 0;
          for (const hex of allHexes) {
            if (
              hex.settlement &&
              hex.controlledBy !== null &&
              hex.controlledBy !== civId
            ) {
              const rel = friendlyRelations[hex.controlledBy];
              if (rel === 'peace' || rel === 'alliance') {
                friendlySettlementCount++;
              }
            }
          }
          yieldAccum['dinars'] = (yieldAccum['dinars'] ?? 0) + (bonus * friendlySettlementCount);
        }
      }
    }

    // Civ ability: Silver Road — settlements connected to capital via controlled hexes get +N trade_goods
    if (civDef) {
      for (const ability of civDef.specialAbilities) {
        const silverMatch = ability.match(/Settlements connected.*capital.*\+(\d+) trade_goods/i);
        if (silverMatch) {
          const bonus = parseInt(silverMatch[1], 10);
          // Find capital
          const capitalHex = allHexes.find(
            (h) => h.controlledBy === civId && h.settlement?.isCapital,
          );
          if (capitalHex) {
            // BFS from capital through controlled hexes
            const mapRows = state.map.length;
            const mapCols = mapRows > 0 ? (state.map[0]?.length ?? 0) : 0;
            const visited = new Set<string>();
            const queue = [capitalHex.coord];
            visited.add(`${capitalHex.coord.col},${capitalHex.coord.row}`);
            while (queue.length > 0) {
              const current = queue.shift()!;
              const neighbors = getNeighbors(current, mapCols, mapRows);
              for (const n of neighbors) {
                const nKey = `${n.col},${n.row}`;
                if (visited.has(nKey)) continue;
                const nHex = state.map[n.row]?.[n.col];
                if (!nHex || nHex.controlledBy !== civId) continue;
                visited.add(nKey);
                queue.push(n);
              }
            }
            // Connected settlements (excluding capital) get the bonus
            let connectedCount = 0;
            for (const hex of allHexes) {
              if (
                hex.controlledBy === civId &&
                hex.settlement &&
                !hex.settlement.isCapital &&
                visited.has(`${hex.coord.col},${hex.coord.row}`)
              ) {
                connectedCount++;
              }
            }
            yieldAccum['trade_goods'] = (yieldAccum['trade_goods'] ?? 0) + (bonus * connectedCount);
          }
        }
      }
    }

    // Seasonal stability modifier
    if (seasonEffect) {
      stabilityDelta += seasonEffect.stabilityModifier;
    }

    // Tech stability bonus
    stabilityDelta += techStabilityBonus;

    // Custom tech effect: stability_bonus_winter
    if (seasonEffect) {
      const winterBonus = getCustomTechEffectValue(state, civId, 'stability_bonus_winter', theme);
      if (winterBonus !== 0 && seasonEffect.phase === 'winter') {
        stabilityDelta += winterBonus;
      }
    }

    // Custom tech effect: resource_conversion — convert resources per turn
    for (const techId of civ.completedTechs) {
      const techDef = theme.techTree.find((t) => t.id === techId);
      if (!techDef) continue;
      for (const effect of techDef.effects) {
        if (effect.kind === 'custom' && effect.key === 'resource_conversion' && typeof effect.value === 'object' && effect.value !== null) {
          const conv = effect.value as { from: string; fromAmount: number; to: string; toAmount: number };
          if (conv.from && conv.to && typeof conv.fromAmount === 'number' && typeof conv.toAmount === 'number') {
            const available = (civ.resources[conv.from] ?? 0) + Math.floor(yieldAccum[conv.from] ?? 0);
            if (available >= conv.fromAmount) {
              yieldAccum[conv.from] = (yieldAccum[conv.from] ?? 0) - conv.fromAmount;
              yieldAccum[conv.to] = (yieldAccum[conv.to] ?? 0) + conv.toAmount;
            }
          }
        }
      }
    }

    // Resource allocation: weight settlement yields by allocation percentages
    const allocations = allocationOrders?.[civId];
    if (allocations) {
      const resourceCount = theme.resources.length;
      const defaultPct = resourceCount > 0 ? 100 / resourceCount : 100;
      for (const resource of theme.resources) {
        const pct = allocations[resource.id] ?? defaultPct;
        const ratio = pct / defaultPct;
        if (ratio !== 1 && yieldAccum[resource.id] !== undefined) {
          yieldAccum[resource.id] = yieldAccum[resource.id] * ratio;
        }
      }
    }

    // Deduct all upkeep from the dinars yield accumulator
    const totalUpkeep = totalBuildingUpkeep + (unitUpkeepByCiv[civId] ?? 0);
    yieldAccum['dinars'] = (yieldAccum['dinars'] ?? 0) - totalUpkeep;

    // Grain consumption: each settlement consumes grain proportional to population
    const civSettlements = allHexes.filter(
      (h) => h.controlledBy === civId && h.settlement !== null,
    );
    let grainConsumption = 0;
    for (const hex of civSettlements) {
      grainConsumption += Math.max(1, Math.floor(hex.settlement!.population / 2));
    }
    if (grainConsumption > 0) {
      yieldAccum['grain'] = (yieldAccum['grain'] ?? 0) - grainConsumption;
    }

    // Apply floored yields to current resources (floored at 0)
    const newResources: Record<string, number> = { ...civ.resources };
    for (const [resId, delta] of Object.entries(yieldAccum)) {
      const current = newResources[resId] ?? 0;
      newResources[resId] = Math.max(0, current + Math.floor(delta));
    }

    // Apply resource interactions (bonus fractions of source → target)
    // Cap interaction bonuses at 20 per resource per turn
    const finalResources = applyResourceInteractionsCapped(newResources, theme);

    // Bankruptcy penalty: if dinars income is negative and stored dinars is 0
    const dinarsYield = Math.floor(yieldAccum['dinars'] ?? 0);
    if (dinarsYield < 0 && (finalResources['dinars'] ?? 0) === 0) {
      stabilityDelta -= 5;
    }

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
