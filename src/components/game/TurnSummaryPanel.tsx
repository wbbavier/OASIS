import type { TurnSummary } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { Card } from '@/components/ui/Card';

interface TurnSummaryPanelProps {
  summary: TurnSummary;
  civId: string;
  theme?: ThemePackage;
}

export function TurnSummaryPanel({ summary, civId, theme }: TurnSummaryPanelProps) {
  const entry = summary.entries.find((e) => e.civId === civId);
  if (!entry) return null;

  const resourceDeltas = Object.entries(entry.resourceDeltas).filter(([, v]) => v !== 0);

  // Look up event names from theme
  const eventNames = entry.eventsActivated.map((defId) => {
    const eventDef = theme?.events.find((e) => e.id === defId);
    return eventDef?.name ?? defId;
  });

  // World news: collect public events from other civs
  const worldNews: string[] = [];
  for (const otherEntry of summary.entries) {
    if (otherEntry.civId === civId) continue;

    // Combat results are public knowledge
    for (const cr of otherEntry.combatResults) {
      worldNews.push(
        `${cr.attackerCivId} attacked ${cr.defenderCivId} at (${cr.coord.col},${cr.coord.row}) — ${cr.outcome.replace(/_/g, ' ')}`,
      );
    }

    // Eliminations
    if (otherEntry.eliminated) {
      worldNews.push(`${otherEntry.civId} has been eliminated.`);
    }
  }
  // Deduplicate (combat results appear for both sides)
  const uniqueWorldNews = [...new Set(worldNews)];

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-stone-200 mb-3">Turn {summary.turnNumber} summary</h3>

      {entry.narrativeLines.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {entry.narrativeLines.map((line, i) => (
            <li key={i} className="text-sm text-stone-300">{line}</li>
          ))}
        </ul>
      )}

      {resourceDeltas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {resourceDeltas.map(([id, delta]) => (
            <span
              key={id}
              className={`rounded px-2 py-0.5 text-xs font-mono ${
                delta > 0 ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
              }`}
            >
              {delta > 0 ? '+' : ''}{delta} {id}
            </span>
          ))}
        </div>
      )}

      {entry.combatResults.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {entry.combatResults.map((cr, i) => (
            <p key={i} className="text-xs text-stone-400">
              Combat: {cr.attackerCivId} vs {cr.defenderCivId} —{' '}
              <span className="text-stone-300">{cr.outcome.replace(/_/g, ' ')}</span>
            </p>
          ))}
        </div>
      )}

      {eventNames.length > 0 && (
        <div className="mt-3">
          <h4 className="text-xs font-medium text-stone-400 mb-1">Events</h4>
          <ul className="flex flex-col gap-0.5">
            {eventNames.map((name, i) => (
              <li key={i} className="text-xs text-amber-300">{name}</li>
            ))}
          </ul>
        </div>
      )}

      {uniqueWorldNews.length > 0 && (
        <div className="mt-3 border-t border-stone-700 pt-3">
          <h4 className="text-xs font-medium text-stone-400 mb-1">World News</h4>
          <ul className="flex flex-col gap-0.5">
            {uniqueWorldNews.map((news, i) => (
              <li key={i} className="text-xs text-stone-400">{news}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
