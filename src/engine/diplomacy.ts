// Diplomacy resolution — processes diplomatic orders, updates relations symmetrically.
// War costs stability, peace/alliance require mutual proposal in the same turn.
// Pure function: no side effects, no async, no randomness.

import type {
  GameState,
  PlayerOrders,
  RelationshipState,
  CivilizationState,
  DiplomaticMessage,
} from '@/engine/types';
import type { DiplomaticActionType } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

// ---------------------------------------------------------------------------
// Tech gate check — unlock_diplomacy_action
// ---------------------------------------------------------------------------

function civHasDiplomacyActionUnlocked(
  civId: string,
  actionType: DiplomaticActionType,
  state: GameState,
  theme: ThemePackage,
): boolean {
  // Check if any tech has unlock_diplomacy_action for this action type
  const requiresTech = theme.techTree.some((t) =>
    t.effects.some(
      (e) => e.kind === 'custom' && e.key === 'unlock_diplomacy_action' && e.value === actionType,
    ),
  );
  if (!requiresTech) return true; // no tech gates this action

  // Check if the civ has completed a tech that unlocks it
  const civ = state.civilizations[civId];
  if (!civ) return false;
  for (const techId of civ.completedTechs) {
    const techDef = theme.techTree.find((t) => t.id === techId);
    if (!techDef) continue;
    for (const effect of techDef.effects) {
      if (effect.kind === 'custom' && effect.key === 'unlock_diplomacy_action' && effect.value === actionType) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setRelationSymmetric(
  civs: Record<string, CivilizationState>,
  civA: string,
  civB: string,
  relation: RelationshipState,
): Record<string, CivilizationState> {
  const civAState = civs[civA];
  const civBState = civs[civB];
  if (!civAState || !civBState) return civs;

  return {
    ...civs,
    [civA]: {
      ...civAState,
      diplomaticRelations: { ...civAState.diplomaticRelations, [civB]: relation },
    },
    [civB]: {
      ...civBState,
      diplomaticRelations: { ...civBState.diplomaticRelations, [civA]: relation },
    },
  };
}

function applyStabilityPenalty(
  civs: Record<string, CivilizationState>,
  civId: string,
  penalty: number,
): Record<string, CivilizationState> {
  const civ = civs[civId];
  if (!civ) return civs;
  return {
    ...civs,
    [civId]: {
      ...civ,
      stability: Math.max(0, Math.min(100, civ.stability + penalty)),
    },
  };
}

// ---------------------------------------------------------------------------
// Main diplomacy resolution
// ---------------------------------------------------------------------------

export interface DiplomacyResult {
  state: GameState;
  diplomaticMessages: DiplomaticMessage[];
}

export function resolveDiplomacy(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): DiplomacyResult {
  void theme;
  let civs = { ...state.civilizations };
  const diplomaticMessages: DiplomaticMessage[] = [];

  // Collect all proposals so we can check for mutual ones
  const proposals: Array<{
    source: string;
    target: string;
    actionType: DiplomaticActionType;
    payload: Record<string, unknown>;
  }> = [];

  for (const playerOrders of orders) {
    const sourceCivId = playerOrders.civilizationId;
    if (!civs[sourceCivId]) continue;

    for (const order of playerOrders.orders) {
      if (order.kind !== 'diplomatic') continue;
      proposals.push({
        source: sourceCivId,
        target: order.targetCivId,
        actionType: order.actionType,
        payload: order.payload,
      });
    }
  }

  // Process immediate actions (declare_war, break_alliance)
  for (const proposal of proposals) {
    const { source, target, actionType } = proposal;
    if (!civs[target]) continue;

    // Tech gate check: skip action if civ hasn't unlocked it
    if (!civHasDiplomacyActionUnlocked(source, actionType, state, theme)) continue;

    switch (actionType) {
      case 'declare_war': {
        civs = setRelationSymmetric(civs, source, target, 'war');
        // War declaration costs -10 stability to the declarer
        civs = applyStabilityPenalty(civs, source, -10);

        // War cascade: target's alliance partners also go to war
        const targetRelations = civs[target]?.diplomaticRelations ?? {};
        for (const [allyId, rel] of Object.entries(targetRelations)) {
          if (rel === 'alliance' && civs[allyId]) {
            civs = setRelationSymmetric(civs, source, allyId, 'war');
          }
        }
        break;
      }

      case 'break_alliance': {
        civs = setRelationSymmetric(civs, source, target, 'peace');
        // Breaking alliance costs -5 stability to the breaker
        civs = applyStabilityPenalty(civs, source, -5);
        break;
      }

      case 'propose_vassalage': {
        // Vassalage is immediate (one-sided declaration)
        civs = setRelationSymmetric(civs, source, target, 'vassal');
        break;
      }

      // send_message — collect message for delivery
      case 'send_message': {
        const msgText = typeof proposal.payload?.message === 'string'
          ? proposal.payload.message
          : '';
        if (msgText.length > 0) {
          diplomaticMessages.push({
            fromCivId: source,
            toCivId: target,
            message: msgText,
          });
        }
        break;
      }

      // offer_trade — no relation change
      case 'offer_trade':
        break;

      // propose_peace, propose_alliance, propose_truce — require mutual
      default:
        break;
    }
  }

  // Process mutual proposals (peace, alliance, truce)
  const mutualActions: Array<{
    actionType: 'propose_peace' | 'propose_alliance' | 'propose_truce';
    relation: RelationshipState;
  }> = [
    { actionType: 'propose_peace', relation: 'peace' },
    { actionType: 'propose_alliance', relation: 'alliance' },
    { actionType: 'propose_truce', relation: 'truce' },
  ];

  for (const { actionType, relation } of mutualActions) {
    const actionProposals = proposals.filter((p) => p.actionType === actionType);

    for (const proposal of actionProposals) {
      // Check if the other side also proposed the same action
      const mutual = actionProposals.some(
        (p) => p.source === proposal.target && p.target === proposal.source,
      );
      if (mutual) {
        civs = setRelationSymmetric(civs, proposal.source, proposal.target, relation);
      }
      // If not mutual, the proposal is logged but has no effect
    }
  }

  return { state: { ...state, civilizations: civs }, diplomaticMessages };
}
