'use client';
import { useState } from 'react';
import type { GameState, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { ResearchPanel } from './ResearchPanel';
import { BuildPanel } from './BuildPanel';
import { RecruitPanel } from './RecruitPanel';
import { DiplomacyPanel } from './DiplomacyPanel';
import { EventsPanel } from './EventsPanel';
import { OrderQueue } from './OrderQueue';

interface OrdersPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

type Tab = 'Queue' | 'Move' | 'Research' | 'Build' | 'Recruit' | 'Diplomacy' | 'Events';
const TABS: Tab[] = ['Queue', 'Move', 'Research', 'Build', 'Recruit', 'Diplomacy', 'Events'];

function countOrdersByKind(orders: AnyOrder[], kind: string): number {
  return orders.filter((o) => o.kind === kind).length;
}

export function OrdersPanel({
  gameState, theme, currentCivId, pendingOrders, setPendingOrders,
}: OrdersPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Queue');

  const unrespondedEvents = gameState.activeEvents.filter(
    (e) =>
      !e.resolved &&
      e.targetCivilizationIds.includes(currentCivId) &&
      !pendingOrders.some(
        (o) => o.kind === 'event_response' && o.eventInstanceId === e.instanceId
      )
  );

  function tabCount(tab: Tab): number {
    switch (tab) {
      case 'Queue': return pendingOrders.length;
      case 'Move': return countOrdersByKind(pendingOrders, 'move');
      case 'Research': return countOrdersByKind(pendingOrders, 'research');
      case 'Build': return countOrdersByKind(pendingOrders, 'construction');
      case 'Recruit': return countOrdersByKind(pendingOrders, 'recruit');
      case 'Diplomacy': return countOrdersByKind(pendingOrders, 'diplomatic');
      case 'Events': return countOrdersByKind(pendingOrders, 'event_response');
    }
  }

  function handleRemoveOrder(index: number) {
    setPendingOrders(pendingOrders.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-xl border border-stone-700 bg-stone-900">
      {/* Tab bar */}
      <div className="flex border-b border-stone-700 overflow-x-auto">
        {TABS.map((tab) => {
          const count = tabCount(tab);
          const hasAlert = tab === 'Events' && unrespondedEvents.length > 0;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'text-stone-100 border-b-2 border-indigo-500 -mb-px'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {tab}
              {count > 0 && (
                <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white font-semibold leading-none">
                  {count}
                </span>
              )}
              {hasAlert && (
                <span className="absolute top-1.5 right-0.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-[50vh] overflow-y-auto">
        {activeTab === 'Queue' && (
          <OrderQueue orders={pendingOrders} theme={theme} onRemove={handleRemoveOrder} />
        )}
        {activeTab === 'Move' && (
          <div className="text-xs text-stone-400 py-2">
            Click a hex with your units on the map to select them, then click a highlighted destination to move.
            {countOrdersByKind(pendingOrders, 'move') > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {pendingOrders.filter((o) => o.kind === 'move').map((o, i) => (
                  <span key={i} className="rounded bg-stone-800 px-2 py-1 text-stone-300">
                    Move unit \u2192 ({o.kind === 'move' ? `${o.path[o.path.length - 1]?.col},${o.path[o.path.length - 1]?.row}` : ''})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {activeTab === 'Research' && (
          <ResearchPanel
            gameState={gameState} theme={theme} currentCivId={currentCivId}
            pendingOrders={pendingOrders} setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Build' && (
          <BuildPanel
            gameState={gameState} theme={theme} currentCivId={currentCivId}
            pendingOrders={pendingOrders} setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Recruit' && (
          <RecruitPanel
            gameState={gameState} theme={theme} currentCivId={currentCivId}
            pendingOrders={pendingOrders} setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Diplomacy' && (
          <DiplomacyPanel
            gameState={gameState} theme={theme} currentCivId={currentCivId}
            pendingOrders={pendingOrders} setPendingOrders={setPendingOrders}
          />
        )}
        {activeTab === 'Events' && (
          <EventsPanel
            gameState={gameState} theme={theme} currentCivId={currentCivId}
            pendingOrders={pendingOrders} setPendingOrders={setPendingOrders}
          />
        )}
      </div>
    </div>
  );
}
