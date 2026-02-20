import type { TurnSummary } from '@/engine/types';
import { Card } from '@/components/ui/Card';

interface TurnSummaryPanelProps {
  summary: TurnSummary;
  civId: string;
}

export function TurnSummaryPanel({ summary, civId }: TurnSummaryPanelProps) {
  const entry = summary.entries.find((e) => e.civId === civId);
  if (!entry) return null;

  const resourceDeltas = Object.entries(entry.resourceDeltas).filter(([, v]) => v !== 0);

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-stone-200 mb-3">Turn {summary.turnNumber} summary</h3>

      {entry.narrativeLines.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {entry.narrativeLines.map((line, i) => (
            <li key={i} className="text-sm text-stone-300">• {line}</li>
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
              ⚔ {cr.attackerCivId} vs {cr.defenderCivId} —{' '}
              <span className="text-stone-300">{cr.outcome.replace('_', ' ')}</span>
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
