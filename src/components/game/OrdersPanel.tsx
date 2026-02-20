'use client';
import { useState } from 'react';
import type { GameState, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { ResearchPanel } from './ResearchPanel';
import { BuildPanel } from './BuildPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { EventsPanel } from './EventsPanel';

interface OrdersPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

type Tab = 'Research' | 'Build' | 'Diplomacy' | 'Events';
const TABS: Tab[] = ['Research', 'Build', 'Diplomacy', 'Events'];

export function OrdersPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: OrdersPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Research');

  const unrespondedEvents = gameState.activeEvents.filter(
    (e) =>
      !e.resolved &&
      e.targetCivilizationIds.includes(currentCivId) &&
      !pendingOrders.some(
        (o) => o.kind === 'event_response' && o.eventInstanceId === e.instanceId
      )
  );
  const hasUnrespondedEvents = unrespondedEvents.length > 0;

  return (
    <div className="rounded-xl border border-stone-700 bg-stone-900">
      {/* Tab bar */}
      <div className="flex border-b border-stone-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-stone-100 border-b-2 border-indigo-500 -mb-px'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {tab}
            {tab === 'Events' && hasUnrespondedEvents && (
              <span className="absolute top-1.5 right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {activeTab === 'Research' && (
          <ResearchPanel
            gameState={gameState}
            theme={theme}
            currentCivId={currentCivId}
            pendingOrders={pendingOrders}
            setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Build' && (
          <BuildPanel
            gameState={gameState}
            theme={theme}
            currentCivId={currentCivId}
            pendingOrders={pendingOrders}
            setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Diplomacy' && (
          <DiplomacyPanel
            gameState={gameState}
            theme={theme}
            currentCivId={currentCivId}
            pendingOrders={pendingOrders}
            setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Events' && (
          <EventsPanel
            gameState={gameState}
            theme={theme}
            currentCivId={currentCivId}
            pendingOrders={pendingOrders}
            setPendingOrders={setPendingOrders}
          />
        )}
      </div>

      {/* Orders summary footer */}
      {pendingOrders.length > 0 && (
        <div className="border-t border-stone-700 px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-stone-500">Pending:</span>
          {pendingOrders.map((o, i) => {
            let label = '';
            if (o.kind === 'research') label = `Research: ${o.techId}`;
            else if (o.kind === 'construction') label = `Build: ${o.buildingDefinitionId} @ ${o.settlementId}`;
            else if (o.kind === 'diplomatic') label = `${o.actionType.replace(/_/g, ' ')} → ${o.targetCivId}`;
            else if (o.kind === 'event_response') label = `Event choice: ${o.choiceId}`;
            else if (o.kind === 'move') label = `Move unit`;
            else if (o.kind === 'resource_allocation') label = `Resource alloc`;
            return (
              <span
                key={i}
                className="rounded bg-stone-700 px-2 py-0.5 text-[10px] text-stone-300"
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
