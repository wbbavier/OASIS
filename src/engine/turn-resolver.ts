// Turn resolution pipeline — orchestrates all 11 phases in order.
// Phase 2c: stubs replaced with real implementations; accepts resolvedAt param.

import type {
  GameState,
  GamePhase,
  PlayerOrders,
  PRNG,
  ResolutionLog,
  ResolutionPhase,
  TurnSummary,
  CivilizationState,
  CombatResultSummary,
  Hex,
  Unit,
} from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { fillMissingOrdersWithAI } from '@/engine/ai-governor';
import { resolveDiplomacy } from '@/engine/diplomacy';
import { resolveCombat } from '@/engine/combat';
import { resolveEconomy } from '@/engine/economy';
import { resolveEvents } from '@/engine/events';
import { getNeighbors } from '@/engine/map-generator';

export interface TurnResolutionResult {
  state: GameState;
  logs: ResolutionLog[];
}

// ---------------------------------------------------------------------------
// Helper — build a log entry
// ---------------------------------------------------------------------------

function logPhase(phase: ResolutionPhase, messages: string[]): ResolutionLog {
  return { phase, messages };
}

// ---------------------------------------------------------------------------
// Order validation (structural check only — real validation in each phase)
// ---------------------------------------------------------------------------

function validateOrders(
  state: GameState,
  _orders: PlayerOrders[],
  _theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  return {
    state,
    log: { phase: 'orders', messages: ['Orders validated'] },
  };
}

// ---------------------------------------------------------------------------
// Map helper — find a unit's location by id
// ---------------------------------------------------------------------------

function findUnitOnMap(
  map: Hex[][],
  unitId: string,
): { row: number; col: number; unitIndex: number; unit: Unit } | null {
  for (let r = 0; r < map.length; r++) {
    const mapRow = map[r];
    if (!mapRow) continue;
    for (let c = 0; c < mapRow.length; c++) {
      const hex = mapRow[c];
      if (!hex) continue;
      const idx = hex.units.findIndex((u) => u.id === unitId);
      if (idx !== -1) {
        return { row: r, col: c, unitIndex: idx, unit: hex.units[idx] };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

function resolveMovement(
  state: GameState,
  orders: PlayerOrders[],
  _theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  // Shallow-copy the map so we can mutate hex references
  const newMap = state.map.map((row) =>
    row.map((hex) => ({ ...hex, units: [...hex.units] })),
  );

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'move') continue;
      const { unitId, path } = order;

      if (path.length === 0) {
        messages.push(`Unit ${unitId}: empty path, skipped`);
        continue;
      }

      const found = findUnitOnMap(newMap, unitId);
      if (!found) {
        messages.push(`Unit ${unitId}: not found on map, skipped`);
        continue;
      }

      const { row: srcRow, col: srcCol, unitIndex, unit } = found;

      if (unit.civilizationId !== civId) {
        messages.push(`Unit ${unitId}: owned by different civ, skipped`);
        continue;
      }

      if (path.length > unit.movesRemaining) {
        messages.push(`Unit ${unitId}: path length ${path.length} exceeds movesRemaining ${unit.movesRemaining}, skipped`);
        continue;
      }

      // Validate hex adjacency for each step (odd-r offset neighbors)
      const mapRows = newMap.length;
      const mapCols = mapRows > 0 ? (newMap[0]?.length ?? 0) : 0;
      let valid = true;
      let prev = newMap[srcRow][srcCol].coord;
      for (const step of path) {
        const neighbors = getNeighbors(prev, mapCols, mapRows);
        const isNeighbor = neighbors.some((n) => n.col === step.col && n.row === step.row);
        if (!isNeighbor) {
          messages.push(`Unit ${unitId}: non-adjacent step (${prev.col},${prev.row})→(${step.col},${step.row}), skipped`);
          valid = false;
          break;
        }
        prev = step;
      }
      if (!valid) continue;

      // Find destination hex
      const dest = path[path.length - 1];
      let destRow = -1;
      let destCol = -1;
      for (let r = 0; r < newMap.length && destRow === -1; r++) {
        const mapRow = newMap[r];
        if (!mapRow) continue;
        for (let c = 0; c < mapRow.length; c++) {
          if (mapRow[c].coord.col === dest.col && mapRow[c].coord.row === dest.row) {
            destRow = r;
            destCol = c;
            break;
          }
        }
      }

      if (destRow === -1) {
        messages.push(`Unit ${unitId}: destination (${dest.col},${dest.row}) not found, skipped`);
        continue;
      }

      const sourceCoord = { ...newMap[srcRow][srcCol].coord };

      // Remove from source
      const updatedUnit: Unit = { ...unit, movesRemaining: 0 };
      newMap[srcRow][srcCol] = {
        ...newMap[srcRow][srcCol],
        units: newMap[srcRow][srcCol].units.filter((_, i) => i !== unitIndex),
      };

      // Place at destination
      newMap[destRow][destCol] = {
        ...newMap[destRow][destCol],
        units: [...newMap[destRow][destCol].units, updatedUnit],
      };

      messages.push(
        `Unit ${unitId} moved from (${sourceCoord.col},${sourceCoord.row}) to (${dest.col},${dest.row})`,
      );
    }
  }

  return {
    state: { ...state, map: newMap },
    log: { phase: 'movement', messages: messages.length > 0 ? messages : ['Movement resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function resolveConstruction(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let s = state;

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'construction') continue;
      const { settlementId, buildingDefinitionId } = order;

      const civ = s.civilizations[civId];
      if (!civ || civ.isEliminated) continue;

      const buildingDef = theme.buildings.find((b) => b.id === buildingDefinitionId);
      if (!buildingDef) {
        messages.push(`Building ${buildingDefinitionId}: unknown, skipped`);
        continue;
      }

      const allHexes = s.map.flat();
      const settlementHex = allHexes.find(
        (h) => h.settlement !== null && h.settlement.id === settlementId,
      );
      if (!settlementHex) {
        messages.push(`Settlement ${settlementId}: not found, skipped`);
        continue;
      }

      if (settlementHex.controlledBy !== civId) {
        messages.push(`Settlement ${settlementId}: not controlled by civ ${civId}, skipped`);
        continue;
      }

      if (
        buildingDef.prerequisiteTech !== null &&
        !civ.completedTechs.includes(buildingDef.prerequisiteTech)
      ) {
        messages.push(`Building ${buildingDefinitionId}: prereq tech ${buildingDef.prerequisiteTech} not completed, skipped`);
        continue;
      }

      const settlement = settlementHex.settlement!;
      const existingCount = settlement.buildings.filter((b) => b === buildingDefinitionId).length;
      if (existingCount >= buildingDef.maxPerSettlement) {
        messages.push(`Building ${buildingDefinitionId}: max per settlement (${buildingDef.maxPerSettlement}) reached, skipped`);
        continue;
      }

      const currentDinars = civ.resources['dinars'] ?? 0;
      if (currentDinars < buildingDef.cost) {
        messages.push(`Building ${buildingDefinitionId}: insufficient dinars (${currentDinars} < ${buildingDef.cost}), skipped`);
        continue;
      }

      // Apply: add building to settlement, deduct cost
      const newMap = s.map.map((row) =>
        row.map((hex) => {
          if (hex.settlement !== null && hex.settlement.id === settlementId) {
            return {
              ...hex,
              settlement: {
                ...hex.settlement,
                buildings: [...hex.settlement.buildings, buildingDefinitionId],
              },
            };
          }
          return hex;
        }),
      );

      s = {
        ...s,
        map: newMap,
        civilizations: {
          ...s.civilizations,
          [civId]: {
            ...s.civilizations[civId],
            resources: {
              ...civ.resources,
              dinars: currentDinars - buildingDef.cost,
            },
          },
        },
      };

      messages.push(`Civ ${civId} built ${buildingDefinitionId} in settlement ${settlementId}`);
    }
  }

  return {
    state: s,
    log: { phase: 'construction', messages: messages.length > 0 ? messages : ['Construction resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

function resolveRecruitment(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let s = state;
  const recruitedSettlements = new Set<string>(); // one recruit per settlement per turn

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'recruit') continue;
      const { settlementId, unitDefinitionId } = order;

      const civ = s.civilizations[civId];
      if (!civ || civ.isEliminated) continue;

      // One recruit per settlement per turn
      if (recruitedSettlements.has(settlementId)) {
        messages.push(`Settlement ${settlementId}: already recruited this turn, skipped`);
        continue;
      }

      const unitDef = theme.units.find((u) => u.id === unitDefinitionId);
      if (!unitDef) {
        messages.push(`Unit ${unitDefinitionId}: unknown, skipped`);
        continue;
      }

      // Check tech prerequisite
      if (unitDef.prerequisiteTech !== null && !civ.completedTechs.includes(unitDef.prerequisiteTech)) {
        messages.push(`Unit ${unitDefinitionId}: prereq tech ${unitDef.prerequisiteTech} not completed, skipped`);
        continue;
      }

      // Find settlement hex
      const allHexes = s.map.flat();
      const settlementHex = allHexes.find(
        (h) => h.settlement !== null && h.settlement.id === settlementId,
      );
      if (!settlementHex) {
        messages.push(`Settlement ${settlementId}: not found, skipped`);
        continue;
      }
      if (settlementHex.controlledBy !== civId) {
        messages.push(`Settlement ${settlementId}: not controlled by ${civId}, skipped`);
        continue;
      }

      // Check cost
      const currentDinars = civ.resources['dinars'] ?? 0;
      if (currentDinars < unitDef.cost) {
        messages.push(`Unit ${unitDefinitionId}: insufficient dinars (${currentDinars} < ${unitDef.cost}), skipped`);
        continue;
      }

      // Spawn unit
      const unitId = `unit-recruit-${civId}-t${s.turn}-${settlementId}`;
      const newUnit: Unit = {
        id: unitId,
        definitionId: unitDef.id,
        civilizationId: civId,
        strength: unitDef.strength,
        morale: unitDef.morale,
        movesRemaining: unitDef.moves,
        isGarrisoned: true,
      };

      // Place on settlement hex and deduct cost
      const newMap = s.map.map((row) =>
        row.map((hex) => {
          if (hex.settlement !== null && hex.settlement.id === settlementId) {
            return { ...hex, units: [...hex.units, newUnit] };
          }
          return hex;
        }),
      );

      s = {
        ...s,
        map: newMap,
        civilizations: {
          ...s.civilizations,
          [civId]: {
            ...civ,
            resources: {
              ...civ.resources,
              dinars: currentDinars - unitDef.cost,
            },
          },
        },
      };

      recruitedSettlements.add(settlementId);
      messages.push(`Civ ${civId} recruited ${unitDef.name} at ${settlementHex.settlement!.name} for ${unitDef.cost} dinars`);
    }
  }

  return {
    state: s,
    log: { phase: 'construction', messages: messages.length > 0 ? messages : ['Recruitment resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

function resolveResearch(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  let civs = { ...state.civilizations };

  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'research') continue;
      const { techId, pointsAllocated } = order;

      const civ = civs[civId];
      if (!civ || civ.isEliminated) continue;

      const techDef = theme.techTree.find((t) => t.id === techId);
      if (!techDef) {
        messages.push(`Tech ${techId}: unknown, skipped`);
        continue;
      }

      if (civ.completedTechs.includes(techId)) {
        messages.push(`Tech ${techId}: already completed, skipped`);
        continue;
      }

      const missingPrereqs = techDef.prerequisites.filter(
        (p) => !civ.completedTechs.includes(p),
      );
      if (missingPrereqs.length > 0) {
        messages.push(`Tech ${techId}: missing prereqs [${missingPrereqs.join(', ')}], skipped`);
        continue;
      }

      const currentProgress = civ.techProgress[techId] ?? 0;
      const newProgress = currentProgress + pointsAllocated;

      let newCompletedTechs = [...civ.completedTechs];
      let newTechProgress: Record<string, number> = { ...civ.techProgress, [techId]: newProgress };

      if (newProgress >= techDef.cost) {
        // Tech completed — move to completedTechs, remove from progress
        newCompletedTechs = [...newCompletedTechs, techId];
        newTechProgress = Object.fromEntries(
          Object.entries(newTechProgress).filter(([k]) => k !== techId),
        );
        messages.push(`Civ ${civId} completed tech ${techId}`);
      } else {
        messages.push(`Civ ${civId}: tech ${techId} progress ${newProgress}/${techDef.cost}`);
      }

      civs = {
        ...civs,
        [civId]: {
          ...civ,
          techProgress: newTechProgress,
          completedTechs: newCompletedTechs,
        },
      };
    }
  }

  return {
    state: { ...state, civilizations: civs },
    log: { phase: 'research', messages: messages.length > 0 ? messages : ['Research resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Attrition & Stability
// ---------------------------------------------------------------------------

function resolveAttrition(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const hasGrainResource = theme.resources.some((r) => r.id === 'grain');
  const updatedCivs: Record<string, CivilizationState> = {};

  for (const civId of Object.keys(state.civilizations)) {
    const civ = state.civilizations[civId];
    if (civ.isEliminated) {
      updatedCivs[civId] = civ;
      continue;
    }

    let stabilityChange = 0;

    // Grain attrition: only if grain resource exists in theme and civ has none
    if (hasGrainResource && (civ.resources['grain'] ?? 0) <= 0) {
      stabilityChange -= 10;
      messages.push(`Civ ${civId}: grain shortage, stability -10`);
    }

    // War attrition: -2 stability if at war with anyone
    if (Object.values(civ.diplomaticRelations).includes('war')) {
      stabilityChange -= 2;
      messages.push(`Civ ${civId}: war attrition, stability -2`);
    }

    const newStability = Math.max(0, Math.min(100, civ.stability + stabilityChange));
    updatedCivs[civId] = { ...civ, stability: newStability };
  }

  return {
    state: { ...state, civilizations: updatedCivs },
    log: {
      phase: 'attrition',
      messages: messages.length > 0 ? messages : ['Attrition resolved'],
    },
  };
}

// ---------------------------------------------------------------------------
// Victory / Defeat
// ---------------------------------------------------------------------------

function checkVictoryDefeat(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const allHexes = state.map.flat();
  let updatedCivs = { ...state.civilizations };
  let gamePhase: GamePhase = state.phase;

  // Check defeat conditions for each non-eliminated civ
  for (const civId of Object.keys(updatedCivs)) {
    const civ = updatedCivs[civId];
    if (civ.isEliminated) continue;

    let eliminated = false;

    for (const condition of theme.defeatConditions) {
      if (eliminated) break;
      switch (condition.kind) {
        case 'capital_lost': {
          const hasCapital = allHexes.some(
            (h) => h.controlledBy === civId && h.settlement?.isCapital === true,
          );
          if (!hasCapital) {
            eliminated = true;
            messages.push(`Civ ${civId}: capital lost, eliminated`);
          }
          break;
        }
        case 'stability_zero': {
          if (civ.stability === 0) {
            eliminated = true;
            messages.push(`Civ ${civId}: stability at zero, eliminated`);
          }
          break;
        }
        case 'eliminated_by_combat': {
          const hasUnits = allHexes.some((h) =>
            h.units.some((u) => u.civilizationId === civId),
          );
          const hasSettlements = allHexes.some(
            (h) => h.controlledBy === civId && h.settlement !== null,
          );
          if (!hasUnits && !hasSettlements) {
            eliminated = true;
            messages.push(`Civ ${civId}: no units or settlements, eliminated by combat`);
          }
          break;
        }
        case 'custom':
          break;
      }
    }

    if (eliminated) {
      updatedCivs = {
        ...updatedCivs,
        [civId]: { ...civ, isEliminated: true },
      };
    }
  }

  // Check victory conditions for surviving civs
  const survivingCivIds = Object.keys(updatedCivs).filter(
    (id) => !updatedCivs[id].isEliminated,
  );

  for (const civId of survivingCivIds) {
    if (gamePhase === 'completed') break;
    const civ = updatedCivs[civId];

    for (const condition of theme.victoryConditions) {
      if (gamePhase === 'completed') break;
      switch (condition.kind) {
        case 'eliminate_all': {
          if (survivingCivIds.length === 1 && survivingCivIds[0] === civId) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: all others eliminated, victory`);
          }
          break;
        }
        case 'control_hexes': {
          const controlledCount = allHexes.filter((h) => h.controlledBy === civId).length;
          if (controlledCount >= condition.count) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: controls ${controlledCount} hexes (>= ${condition.count}), victory`);
          }
          break;
        }
        case 'resource_accumulate': {
          if ((civ.resources[condition.resourceId] ?? 0) >= condition.amount) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: accumulated ${condition.amount} ${condition.resourceId}, victory`);
          }
          break;
        }
        case 'tech_advance': {
          if (civ.completedTechs.includes(condition.techId)) {
            gamePhase = 'completed';
            messages.push(`Civ ${civId}: tech advance ${condition.techId}, victory`);
          }
          break;
        }
        case 'survive_turns': {
          if (state.turn >= condition.turns && (gamePhase as string) !== 'completed') {
            gamePhase = 'completed';
            // All surviving civs share the victory
            const winners = survivingCivIds.join(', ');
            messages.push(`Turn ${condition.turns} reached — surviving civilizations share victory: ${winners}`);
          }
          break;
        }
        case 'custom':
          break;
      }
    }
  }

  return {
    state: { ...state, civilizations: updatedCivs, phase: gamePhase },
    log: {
      phase: 'victory_defeat',
      messages: messages.length > 0 ? messages : ['Victory/defeat checked'],
    },
  };
}

// ---------------------------------------------------------------------------
// Healing — units on friendly hexes with settlements heal each turn
// ---------------------------------------------------------------------------

function resolveHealing(
  state: GameState,
  theme: ThemePackage,
): { state: GameState; log: ResolutionLog } {
  const messages: string[] = [];
  const newMap = state.map.map((row) =>
    row.map((hex) => {
      if (hex.units.length === 0) return hex;
      if (!hex.settlement || hex.controlledBy === null) return hex;

      const healedUnits = hex.units.map((unit) => {
        // Only heal units on a friendly settlement hex
        if (unit.civilizationId !== hex.controlledBy) return unit;

        const unitDef = theme.units.find((u) => u.id === unit.definitionId);
        if (!unitDef) return unit;

        const maxStrength = unitDef.strength;
        if (unit.strength >= maxStrength) return unit;

        const newStrength = Math.min(maxStrength, unit.strength + 1);
        messages.push(
          `Unit ${unit.id} healed +1 strength at ${hex.settlement!.name} (${newStrength}/${maxStrength})`,
        );
        return { ...unit, strength: newStrength };
      });

      return { ...hex, units: healedUnits };
    }),
  );

  return {
    state: { ...state, map: newMap },
    log: { phase: 'economy' as ResolutionPhase, messages: messages.length > 0 ? messages : ['Healing resolved'] },
  };
}

// ---------------------------------------------------------------------------
// Control transfer — after combat, sole occupant claims the hex
// ---------------------------------------------------------------------------

function resolveControlTransfer(state: GameState): GameState {
  const newMap = state.map.map((row) =>
    row.map((hex) => {
      if (hex.units.length === 0) return hex;
      const civIds = [...new Set(hex.units.map((u) => u.civilizationId))];
      if (civIds.length !== 1) return hex; // contested — no transfer
      const sole = civIds[0]!;
      if (sole === hex.controlledBy) return hex; // already controlled
      return { ...hex, controlledBy: sole };
    }),
  );
  return { ...state, map: newMap };
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

function generateSummary(
  state: GameState,
  _theme: ThemePackage,
  resolvedAt: string,
  resourcesBefore: Record<string, Record<string, number>>,
  completedTechsBefore: Record<string, string[]>,
  combatResults: CombatResultSummary[],
  movementMessages: string[],
): { state: GameState; log: ResolutionLog; summary: TurnSummary } {
  const summary: TurnSummary = {
    turnNumber: state.turn,
    resolvedAt,
    entries: Object.keys(state.civilizations).map((civId) => {
      const civ = state.civilizations[civId];
      const before = resourcesBefore[civId] ?? {};
      const techsBefore = completedTechsBefore[civId] ?? [];

      // Resource deltas
      const resourceDeltas: Record<string, number> = {};
      const allResourceIds = new Set([
        ...Object.keys(before),
        ...Object.keys(civ.resources),
      ]);
      for (const resId of allResourceIds) {
        const delta = (civ.resources[resId] ?? 0) - (before[resId] ?? 0);
        if (delta !== 0) resourceDeltas[resId] = delta;
      }

      // Tech completed this turn
      const newTechs = civ.completedTechs.filter((t) => !techsBefore.includes(t));
      const techCompleted = newTechs.length > 0 ? (newTechs[0] ?? null) : null;

      // Combat results involving this civ
      const civCombatResults = combatResults.filter(
        (r) => r.attackerCivId === civId || r.defenderCivId === civId,
      );

      // Events activated this turn for this civ
      const eventsActivated = state.activeEvents
        .filter(
          (e) =>
            e.targetCivilizationIds.includes(civId) &&
            e.activatedOnTurn === state.turn,
        )
        .map((e) => e.definitionId);

      // Narrative lines
      const narrativeLines: string[] = [];

      // Movement messages for this civ
      for (const msg of movementMessages) {
        if (msg.includes(civId) || msg.includes(`unit-start-${civId}`) || msg.includes(`unit-recruit-${civId}`)) {
          narrativeLines.push(msg);
        }
      }

      for (const [resId, delta] of Object.entries(resourceDeltas)) {
        narrativeLines.push(`${resId}: ${delta > 0 ? '+' : ''}${delta}`);
      }
      if (techCompleted) {
        narrativeLines.push(`Research complete: ${techCompleted}`);
      }
      for (const combat of civCombatResults) {
        const role = combat.attackerCivId === civId ? 'attacker' : 'defender';
        narrativeLines.push(
          `Combat at (${combat.coord.col},${combat.coord.row}): ${combat.outcome} (as ${role})`,
        );
      }
      if (narrativeLines.length === 0) {
        narrativeLines.push(`Turn ${state.turn} complete.`);
      }

      return {
        civId,
        narrativeLines,
        resourceDeltas,
        eventsActivated,
        combatResults: civCombatResults,
        techCompleted,
        eliminated: civ.isEliminated,
      };
    }),
  };

  return {
    state,
    log: { phase: 'summary', messages: ['Summary generated'] },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export function resolveTurn(
  state: GameState,
  submittedOrders: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG,
  resolvedAt: string,
): TurnResolutionResult {
  const logs: ResolutionLog[] = [];
  let s = state;

  // Reset movesRemaining for all units at the start of each turn
  const unitMovesLookup = new Map(theme.units.map((u) => [u.id, u.moves]));
  const resetMap = state.map.map((row) =>
    row.map((hex) => ({
      ...hex,
      units: hex.units.map((unit) => ({
        ...unit,
        movesRemaining: unitMovesLookup.get(unit.definitionId) ?? unit.movesRemaining,
      })),
    })),
  );
  s = { ...s, map: resetMap };

  // Snapshot resources and completedTechs before any phase (for delta calculation)
  const resourcesBefore: Record<string, Record<string, number>> = {};
  const completedTechsBefore: Record<string, string[]> = {};
  for (const [civId, civ] of Object.entries(s.civilizations)) {
    resourcesBefore[civId] = { ...civ.resources };
    completedTechsBefore[civId] = [...civ.completedTechs];
  }

  // Fill missing orders with AI (pass resolvedAt instead of new Date())
  const allOrders = fillMissingOrdersWithAI(s, submittedOrders, theme, prng.fork(), resolvedAt);
  logs.push(
    logPhase('orders', [
      `AI filled orders for ${allOrders.length - submittedOrders.length} civilization(s)`,
    ]),
  );

  // Diplomacy
  s = resolveDiplomacy(s, allOrders, theme);
  logs.push(logPhase('diplomacy', ['Diplomacy resolved']));

  // Validate orders
  const validationResult = validateOrders(s, allOrders, theme);
  s = validationResult.state;
  logs.push(validationResult.log);

  // Movement
  const movementResult = resolveMovement(s, allOrders, theme);
  s = movementResult.state;
  logs.push(movementResult.log);

  // Combat
  const { state: stateAfterCombat, combatResults } = resolveCombat(s, theme, prng.fork());
  s = stateAfterCombat;
  logs.push(logPhase('combat', ['Combat resolved']));

  // Control transfer — sole occupant claims the hex
  s = resolveControlTransfer(s);

  // Economy
  s = resolveEconomy(s, theme);
  logs.push(logPhase('economy', ['Economy resolved']));

  // Healing (units at friendly settlements recover strength)
  const healingResult = resolveHealing(s, theme);
  s = healingResult.state;
  logs.push(healingResult.log);

  // Construction
  const constructionResult = resolveConstruction(s, allOrders, theme);
  s = constructionResult.state;
  logs.push(constructionResult.log);

  // Recruitment
  const recruitmentResult = resolveRecruitment(s, allOrders, theme);
  s = recruitmentResult.state;
  logs.push(recruitmentResult.log);

  // Research
  const researchResult = resolveResearch(s, allOrders, theme);
  s = researchResult.state;
  logs.push(researchResult.log);

  // Events (pass allOrders so event responses can be processed)
  s = resolveEvents(s, allOrders, theme, prng.fork());
  logs.push(logPhase('events', ['Events resolved']));

  // Attrition & Stability
  const attritionResult = resolveAttrition(s, theme);
  s = attritionResult.state;
  logs.push(attritionResult.log);

  // Victory/Defeat
  const victoryResult = checkVictoryDefeat(s, theme);
  s = victoryResult.state;
  logs.push(victoryResult.log);

  // Summary (with real resource deltas, tech completion, combat results, and movement)
  const summaryResult = generateSummary(
    s,
    theme,
    resolvedAt,
    resourcesBefore,
    completedTechsBefore,
    combatResults,
    movementResult.log.messages,
  );
  s = summaryResult.state;
  logs.push(summaryResult.log);

  // Advance turn counter and persist RNG state
  const resolved: GameState = {
    ...s,
    turn: s.turn + 1,
    rngState: prng.state,
    lastResolvedAt: resolvedAt,
    turnHistory: [...s.turnHistory, summaryResult.summary],
  };

  return { state: resolved, logs };
}
