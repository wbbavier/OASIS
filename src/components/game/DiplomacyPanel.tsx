'use client';
import { useState } from 'react';
import type { GameState, AnyOrder, DiplomaticAction, DiplomaticActionType, RelationshipState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { DiplomacyCivCard } from './DiplomacyCivCard';

interface DiplomacyPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

const RELATION_LABELS: Record<RelationshipState, string> = {
  peace: 'Peace', alliance: 'Alliance', war: 'War', truce: 'Truce', vassal: 'Vassal',
};

const RELATION_COLORS: Record<RelationshipState, string> = {
  peace: 'text-stone-400 bg-stone-700',
  alliance: 'text-emerald-300 bg-emerald-900',
  war: 'text-red-300 bg-red-900',
  truce: 'text-yellow-300 bg-yellow-900',
  vassal: 'text-purple-300 bg-purple-900',
};

export function DiplomacyPanel({
  gameState, theme, currentCivId, pendingOrders, setPendingOrders,
}: DiplomacyPanelProps) {
  const [messageText, setMessageText] = useState<Record<string, string>>({});
  const civ = gameState.civilizations[currentCivId];
  if (!civ) return null;

  const otherCivDefs = theme.civilizations.filter((c) => c.id !== currentCivId);

  // Extract received messages from last turn
  const lastSummary = gameState.turnHistory.at(-1) ?? null;
  const receivedMessages: Array<{ fromCivId: string; message: string }> = [];
  if (lastSummary) {
    const myCivEntry = lastSummary.entries.find((e) => e.civId === currentCivId);
    if (myCivEntry) {
      for (const line of myCivEntry.narrativeLines) {
        const match = line.match(/^Message from ([^:]+): (.+)$/);
        if (match) receivedMessages.push({ fromCivId: match[1], message: match[2] });
      }
    }
  }

  function handleAction(targetCivId: string, actionType: DiplomaticActionType) {
    const existing = pendingOrders.find(
      (o): o is DiplomaticAction => o.kind === 'diplomatic' && o.targetCivId === targetCivId
    );
    if (existing?.actionType === actionType) {
      setPendingOrders(pendingOrders.filter(
        (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
      ));
      return;
    }
    const payload: Record<string, unknown> =
      actionType === 'send_message' ? { message: messageText[targetCivId] ?? '' } : {};
    setPendingOrders([
      ...pendingOrders.filter(
        (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
      ),
      { kind: 'diplomatic', actionType, targetCivId, payload },
    ]);
  }

  function handleMessageChange(targetCivId: string, text: string) {
    setMessageText((prev) => ({ ...prev, [targetCivId]: text }));
    const existing = pendingOrders.find(
      (o): o is DiplomaticAction => o.kind === 'diplomatic' && o.targetCivId === targetCivId
    );
    if (existing?.actionType === 'send_message') {
      setPendingOrders([
        ...pendingOrders.filter(
          (o) => !(o.kind === 'diplomatic' && (o as DiplomaticAction).targetCivId === targetCivId)
        ),
        { ...existing, payload: { message: text } },
      ]);
    }
  }

  if (otherCivDefs.length === 0) {
    return <p className="text-sm text-stone-500 italic">No other civilizations.</p>;
  }

  return (
    <div className="space-y-4">
      {receivedMessages.length > 0 && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Messages Received</p>
          {receivedMessages.map((msg, i) => {
            const senderDef = theme.civilizations.find((c) => c.id === msg.fromCivId);
            return (
              <div key={i} className="text-sm text-stone-200">
                <span className="font-medium text-amber-200">{senderDef?.name ?? msg.fromCivId}:</span>{' '}
                {msg.message}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-stone-500">Select a diplomatic action for each civilization.</p>
      {otherCivDefs.map((civDef) => {
        const relation = civ.diplomaticRelations[civDef.id] ?? 'peace';
        const pending = pendingOrders.find(
          (o): o is DiplomaticAction => o.kind === 'diplomatic' && o.targetCivId === civDef.id
        );
        const options = theme.diplomacyOptions.filter((opt) => opt.allowedStates.includes(relation));
        return (
          <DiplomacyCivCard key={civDef.id} civDef={civDef} relation={relation}
            relationLabel={RELATION_LABELS[relation]} relationColor={RELATION_COLORS[relation]}
            options={options} pending={pending}
            messageText={messageText[civDef.id] ?? ''}
            onAction={(at) => handleAction(civDef.id, at)}
            onMessageChange={(t) => handleMessageChange(civDef.id, t)} />
        );
      })}
    </div>
  );
}
