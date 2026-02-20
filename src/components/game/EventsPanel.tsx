'use client';
import type { GameState, AnyOrder, EventResponse, ActiveEvent } from '@/engine/types';
import type { ThemePackage, EventDefinition } from '@/themes/schema';

interface EventsPanelProps {
  gameState: GameState;
  theme: ThemePackage;
  currentCivId: string;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

function getPendingResponse(
  pendingOrders: AnyOrder[],
  instanceId: string
): EventResponse | undefined {
  return pendingOrders.find(
    (o): o is EventResponse => o.kind === 'event_response' && o.eventInstanceId === instanceId
  );
}

interface EventCardProps {
  event: ActiveEvent;
  definition: EventDefinition;
  pendingOrders: AnyOrder[];
  setPendingOrders: (orders: AnyOrder[]) => void;
}

function EventCard({ event, definition, pendingOrders, setPendingOrders }: EventCardProps) {
  const pending = getPendingResponse(pendingOrders, event.instanceId);

  function selectChoice(choiceId: string) {
    if (pending?.choiceId === choiceId) {
      // deselect
      setPendingOrders(
        pendingOrders.filter(
          (o) => !(o.kind === 'event_response' && (o as EventResponse).eventInstanceId === event.instanceId)
        )
      );
      return;
    }
    const next: EventResponse = {
      kind: 'event_response',
      eventInstanceId: event.instanceId,
      choiceId,
    };
    setPendingOrders([
      ...pendingOrders.filter(
        (o) => !(o.kind === 'event_response' && (o as EventResponse).eventInstanceId === event.instanceId)
      ),
      next,
    ]);
  }

  return (
    <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3">
      <p className="text-sm font-semibold text-amber-200">{definition.name}</p>
      <p className="text-xs text-stone-400 mt-1 italic">{definition.flavourText}</p>
      <p className="text-xs text-stone-300 mt-1">{definition.description}</p>

      {definition.choices.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {definition.choices.map((choice) => {
            const isSelected = pending?.choiceId === choice.id;
            const isDefault = choice.id === definition.defaultChoiceId;
            return (
              <button
                key={choice.id}
                onClick={() => selectChoice(choice.id)}
                className={`w-full text-left rounded border px-2.5 py-1.5 transition-colors ${
                  isSelected
                    ? 'border-amber-500 bg-amber-900/50'
                    : 'border-stone-600 hover:border-stone-500 bg-stone-900/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-stone-100">{choice.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isDefault && (
                      <span className="text-[10px] text-stone-500">(default)</span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] text-amber-400">Chosen</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!pending && (
        <p className="text-[10px] text-stone-600 mt-2">
          No response selected — default choice will apply.
        </p>
      )}
    </div>
  );
}

export function EventsPanel({
  gameState,
  theme,
  currentCivId,
  pendingOrders,
  setPendingOrders,
}: EventsPanelProps) {
  const activeEvents = gameState.activeEvents.filter(
    (e) => !e.resolved && e.targetCivilizationIds.includes(currentCivId)
  );

  if (activeEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-stone-500">
        <p className="text-sm">No events this turn.</p>
      </div>
    );
  }

  const eventsWithDefs: Array<{ event: ActiveEvent; definition: EventDefinition }> = [];
  for (const event of activeEvents) {
    const definition = theme.events.find((d) => d.id === event.definitionId);
    if (definition) {
      eventsWithDefs.push({ event, definition });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        {activeEvents.length} active event{activeEvents.length !== 1 ? 's' : ''}. Responding is
        optional — unanswered events apply their default choice.
      </p>
      {eventsWithDefs.map(({ event, definition }) => (
        <EventCard
          key={event.instanceId}
          event={event}
          definition={definition}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
        />
      ))}
    </div>
  );
}
