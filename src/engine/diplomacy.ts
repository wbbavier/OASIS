// Diplomacy resolution — processes diplomatic orders, updates relations symmetrically.
// War costs stability, peace/alliance require mutual proposal in the same turn.
// Pure function: no side effects, no async, no randomness.

import type {
  GameState,
  PlayerOrders,
  RelationshipState,
  CivilizationState,
} from '@/engine/types';
import type { DiplomaticActionType } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

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

export function resolveDiplomacy(
  state: GameState,
  orders: PlayerOrders[],
  theme: ThemePackage,
): GameState {
  void theme;
  let civs = { ...state.civilizations };

  // Collect all proposals so we can check for mutual ones
  const proposals: Array<{
    source: string;
    target: string;
    actionType: DiplomaticActionType;
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
      });
    }
  }

  // Process immediate actions (declare_war, break_alliance)
  for (const proposal of proposals) {
    const { source, target, actionType } = proposal;
    if (!civs[target]) continue;

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

      // send_message, offer_trade — no relation change
      case 'send_message':
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

  return { ...state, civilizations: civs };
}
