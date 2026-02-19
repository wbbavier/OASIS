// Event resolution — Phase 2c implementation.
// Handles player event responses, auto-resolution of stale events, and new event activation.
// Pure function: no side effects, no async.

import type {
  GameState,
  PlayerOrders,
  ActiveEvent,
  CivilizationState,
  Unit,
  PRNG,
} from '@/engine/types';
import type {
  ThemePackage,
  EventTrigger,
  EventEffect,
  EventDefinition,
} from '@/themes/schema';
import { weightedChoice } from '@/engine/prng';

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

export function evaluateTrigger(
  trigger: EventTrigger,
  civ: CivilizationState,
  state: GameState,
): boolean {
  switch (trigger.kind) {
    case 'turn_number':
      return state.turn === trigger.turn;
    case 'turn_range':
      return state.turn >= trigger.minTurn && state.turn <= trigger.maxTurn;
    case 'resource_below':
      return (civ.resources[trigger.resourceId] ?? 0) < trigger.threshold;
    case 'stability_below':
      return civ.stability < trigger.threshold;
    case 'tension_above':
      return (civ.tensionAxes[trigger.axis] ?? 0) > trigger.threshold;
    case 'tech_completed':
      return civ.completedTechs.includes(trigger.techId);
    case 'war_declared':
      return Object.values(civ.diplomaticRelations).includes('war');
    case 'always':
      return true;
  }
}

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

function applyEffectToCiv(
  effect: EventEffect,
  civId: string,
  state: GameState,
  theme: ThemePackage,
  instanceId: string,
  defId: string,
  narrativeLog: string[],
): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;

  switch (effect.kind) {
    case 'resource_delta': {
      const current = civ.resources[effect.resourceId] ?? 0;
      const newVal = Math.max(0, current + effect.delta);
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: { ...civ, resources: { ...civ.resources, [effect.resourceId]: newVal } },
        },
      };
    }

    case 'stability_delta': {
      const newStability = Math.max(0, Math.min(100, civ.stability + effect.delta));
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: { ...civ, stability: newStability },
        },
      };
    }

    case 'tension_delta': {
      const axis = theme.mechanics.tensionAxes.find((a) => a.id === effect.axis);
      const min = axis?.minValue ?? 0;
      const max = axis?.maxValue ?? 100;
      const current = civ.tensionAxes[effect.axis] ?? 0;
      const newVal = Math.max(min, Math.min(max, current + effect.delta));
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: { ...civ, tensionAxes: { ...civ.tensionAxes, [effect.axis]: newVal } },
        },
      };
    }

    case 'spawn_unit': {
      const { coord, unitDefinitionId } = effect;
      const unitDef = theme.units.find((u) => u.id === unitDefinitionId);
      if (!unitDef) return state;

      const newUnit: Unit = {
        id: `unit-event-${defId}-${instanceId}`,
        definitionId: unitDefinitionId,
        civilizationId: civId,
        strength: unitDef.strength,
        morale: unitDef.morale,
        movesRemaining: unitDef.moves,
        isGarrisoned: false,
      };

      const newMap = state.map.map((row) =>
        row.map((hex) => {
          if (hex.coord.col === coord.col && hex.coord.row === coord.row) {
            return { ...hex, units: [...hex.units, newUnit] };
          }
          return hex;
        }),
      );
      return { ...state, map: newMap };
    }

    case 'destroy_settlement': {
      const newMap = state.map.map((row) =>
        row.map((hex) => {
          if (hex.settlement !== null && hex.settlement.id === effect.settlementId) {
            return { ...hex, settlement: null };
          }
          return hex;
        }),
      );
      return { ...state, map: newMap };
    }

    case 'force_war': {
      const { civId1, civId2 } = effect;
      const civs = { ...state.civilizations };
      const c1 = civs[civId1];
      const c2 = civs[civId2];
      if (c1 && c2) {
        civs[civId1] = {
          ...c1,
          diplomaticRelations: { ...c1.diplomaticRelations, [civId2]: 'war' },
        };
        civs[civId2] = {
          ...c2,
          diplomaticRelations: { ...c2.diplomaticRelations, [civId1]: 'war' },
        };
      }
      return { ...state, civilizations: civs };
    }

    case 'narrative': {
      narrativeLog.push(effect.text);
      return state; // no state change
    }

    case 'custom':
      return state;
  }
}

function applyChoiceEffects(
  choiceId: string,
  eventDef: EventDefinition,
  civId: string,
  state: GameState,
  theme: ThemePackage,
  instanceId: string,
  narrativeLog: string[],
): GameState {
  const choice = eventDef.choices.find((c) => c.id === choiceId);
  if (!choice) return state;

  let s = state;
  for (const effect of choice.effects) {
    s = applyEffectToCiv(effect, civId, s, theme, instanceId, eventDef.id, narrativeLog);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Main event resolution
// ---------------------------------------------------------------------------

export function resolveEvents(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
  prng: PRNG,
): GameState {
  let s = state;
  const narrativeLog: string[] = [];

  // Working copy of active events (will be updated below)
  const updatedActiveEvents: ActiveEvent[] = [...s.activeEvents];

  // Step 1 — Resolve pending EventResponse orders
  for (const playerOrders of orders) {
    const civId = playerOrders.civilizationId;
    for (const order of playerOrders.orders) {
      if (order.kind !== 'event_response') continue;

      const { eventInstanceId, choiceId } = order;
      const eventIdx = updatedActiveEvents.findIndex(
        (e) => e.instanceId === eventInstanceId && !e.resolved,
      );
      if (eventIdx === -1) continue;

      const activeEvent = updatedActiveEvents[eventIdx];
      const eventDef = theme.events.find((e) => e.id === activeEvent.definitionId);
      if (!eventDef) continue;

      s = applyChoiceEffects(choiceId, eventDef, civId, s, theme, activeEvent.instanceId, narrativeLog);
      updatedActiveEvents[eventIdx] = { ...activeEvent, resolved: true };
    }
  }

  // Step 2 — Auto-resolve stale active events (activated on prior turns)
  for (let i = 0; i < updatedActiveEvents.length; i++) {
    const activeEvent = updatedActiveEvents[i];
    if (activeEvent.resolved || activeEvent.activatedOnTurn >= s.turn) continue;

    const eventDef = theme.events.find((e) => e.id === activeEvent.definitionId);
    if (!eventDef) {
      updatedActiveEvents[i] = { ...activeEvent, resolved: true };
      continue;
    }

    for (const civId of activeEvent.targetCivilizationIds) {
      s = applyChoiceEffects(
        eventDef.defaultChoiceId,
        eventDef,
        civId,
        s,
        theme,
        activeEvent.instanceId,
        narrativeLog,
      );
    }
    updatedActiveEvents[i] = { ...activeEvent, resolved: true };
  }

  // Flush the updated events list into state
  s = { ...s, activeEvents: updatedActiveEvents };

  // Step 3 — Activate new events
  const nonEliminatedCivIds = Object.keys(s.civilizations).filter(
    (id) => !s.civilizations[id].isEliminated,
  );

  let instanceCounter = s.activeEvents.length;

  for (const eventDef of theme.events) {
    // Determine target civilization IDs
    let targetCivIds: string[];
    if (eventDef.targetCivs === 'all') {
      targetCivIds = nonEliminatedCivIds;
    } else if (eventDef.targetCivs === 'random_one') {
      if (nonEliminatedCivIds.length === 0) continue;
      const picked = weightedChoice(
        nonEliminatedCivIds.map((id) => ({ value: id, weight: 1 })),
        prng,
      );
      targetCivIds = [picked];
    } else {
      // specific array of civ IDs
      targetCivIds = (eventDef.targetCivs as string[]).filter(
        (id) => s.civilizations[id] !== undefined && !s.civilizations[id].isEliminated,
      );
    }

    for (const civId of targetCivIds) {
      const civ = s.civilizations[civId];
      if (!civ) continue;

      // Non-repeatable events: skip if already in active events list
      if (!eventDef.isRepeatable) {
        const alreadyActive = s.activeEvents.some((e) => e.definitionId === eventDef.id);
        if (alreadyActive) continue;
      }

      // Check trigger condition for this civ
      if (!evaluateTrigger(eventDef.trigger, civ, s)) continue;

      // Activate and immediately auto-resolve with default choice
      instanceCounter += 1;
      const instanceId = `${eventDef.id}-${civId}-${s.turn}-${instanceCounter}`;

      s = applyChoiceEffects(
        eventDef.defaultChoiceId,
        eventDef,
        civId,
        s,
        theme,
        instanceId,
        narrativeLog,
      );

      const newActiveEvent: ActiveEvent = {
        instanceId,
        definitionId: eventDef.id,
        targetCivilizationIds: [civId],
        activatedOnTurn: s.turn,
        expiresOnTurn: null,
        responses: {},
        resolved: true,
      };

      s = { ...s, activeEvents: [...s.activeEvents, newActiveEvent] };
    }
  }

  return s;
}
