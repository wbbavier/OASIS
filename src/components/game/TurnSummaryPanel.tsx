'use client';
import { useState } from 'react';
import type { TurnSummary } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { Card } from '@/components/ui/Card';
import {
  getHeadlines, HighlightReel, ResourceDeltas, CombatSection,
  NarrativeSection, categorizeNarrative, WorldNews, SECTION_ORDER,
} from './SummarySections';

interface TurnSummaryPanelProps {
  summary: TurnSummary;
  civId: string;
  theme?: ThemePackage;
  allSummaries?: TurnSummary[];
}

export function TurnSummaryPanel({ summary, civId, theme, allSummaries }: TurnSummaryPanelProps) {
  const summaries = allSummaries ?? [summary];
  const initialIdx = summaries.findIndex((s) => s.turnNumber === summary.turnNumber);
  const [viewIdx, setViewIdx] = useState(initialIdx >= 0 ? initialIdx : summaries.length - 1);

  const currentSummary = summaries[viewIdx] ?? summary;
  const entry = currentSummary.entries.find((e) => e.civId === civId);
  if (!entry) return null;

  const headlines = getHeadlines(entry, theme);
  const categorized = categorizeNarrative(entry.narrativeLines);

  return (
    <Card className="p-4">
      {summaries.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => setViewIdx((i) => Math.max(0, i - 1))}
            disabled={viewIdx === 0}
            className="text-xs text-stone-400 hover:text-stone-200 disabled:text-stone-600">
            {'\u2190'}
          </button>
          <span className="text-xs text-stone-400">Turn {currentSummary.turnNumber}</span>
          <button onClick={() => setViewIdx((i) => Math.min(summaries.length - 1, i + 1))}
            disabled={viewIdx === summaries.length - 1}
            className="text-xs text-stone-400 hover:text-stone-200 disabled:text-stone-600">
            {'\u2192'}
          </button>
        </div>
      )}

      <h3 className="font-semibold text-stone-200 mb-3">Turn {currentSummary.turnNumber} Summary</h3>
      <HighlightReel headlines={headlines} />
      <ResourceDeltas deltas={entry.resourceDeltas} theme={theme} />
      <CombatSection combats={entry.combatResults} theme={theme} />

      {SECTION_ORDER.map((section) => {
        const lines = categorized[section];
        if (!lines || lines.length === 0) return null;
        return <NarrativeSection key={section} lines={lines} phase={section} />;
      })}

      <WorldNews summary={currentSummary} civId={civId} theme={theme} />
    </Card>
  );
}
