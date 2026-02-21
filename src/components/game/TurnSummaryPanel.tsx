'use client';
import { useState } from 'react';
import type { TurnSummary, TurnSummaryEntry, CombatResultSummary } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { Card } from '@/components/ui/Card';

interface TurnSummaryPanelProps {
  summary: TurnSummary;
  civId: string;
  theme?: ThemePackage;
  allSummaries?: TurnSummary[];
}

function classifyHeadline(line: string): 'good' | 'bad' | 'neutral' {
  const lower = line.toLowerCase();
  if (lower.includes('victory') || lower.includes('completed') || lower.includes('alliance'))
    return 'good';
  if (lower.includes('defeated') || lower.includes('eliminated') || lower.includes('lost') || lower.includes('war'))
    return 'bad';
  return 'neutral';
}

function headlineColor(type: 'good' | 'bad' | 'neutral'): string {
  if (type === 'good') return 'text-emerald-300 bg-emerald-950/50 border-emerald-800';
  if (type === 'bad') return 'text-red-300 bg-red-950/50 border-red-800';
  return 'text-amber-300 bg-amber-950/50 border-amber-800';
}

/** Extract 2-3 headline entries from the summary. */
function getHeadlines(entry: TurnSummaryEntry, theme?: ThemePackage): string[] {
  const headlines: string[] = [];

  // Combat results
  for (const cr of entry.combatResults) {
    const atkName = theme?.civilizations.find((c) => c.id === cr.attackerCivId)?.name ?? cr.attackerCivId;
    const defName = theme?.civilizations.find((c) => c.id === cr.defenderCivId)?.name ?? cr.defenderCivId;
    const outcome = cr.outcome === 'attacker_wins' ? 'Victory' : cr.outcome === 'defender_wins' ? 'Defeat' : 'Draw';
    headlines.push(`Battle at (${cr.coord.col},${cr.coord.row}): ${atkName} vs ${defName} \u2014 ${outcome}`);
  }

  // Events
  for (const defId of entry.eventsActivated) {
    const eventDef = theme?.events.find((e) => e.id === defId);
    headlines.push(eventDef?.name ?? defId);
  }

  // Tech completion
  if (entry.techCompleted) {
    const tech = theme?.techTree.find((t) => t.id === entry.techCompleted);
    headlines.push(`Research complete: ${tech?.name ?? entry.techCompleted}`);
  }

  // Elimination
  if (entry.eliminated) {
    headlines.push('Your civilization has been eliminated.');
  }

  return headlines.slice(0, 3);
}

function HighlightReel({ headlines }: { headlines: string[] }) {
  if (headlines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 mb-3">
      {headlines.map((hl, i) => {
        const type = classifyHeadline(hl);
        return (
          <div key={i} className={`rounded border px-3 py-1.5 text-sm font-medium ${headlineColor(type)}`}>
            {hl}
          </div>
        );
      })}
    </div>
  );
}

function ResourceDeltas({ deltas, theme }: { deltas: Record<string, number>; theme?: ThemePackage }) {
  const entries = Object.entries(deltas).filter(([, v]) => v !== 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {entries.map(([id, delta]) => {
        const resDef = theme?.resources.find((r) => r.id === id);
        return (
          <span
            key={id}
            className={`rounded px-2 py-0.5 text-xs font-mono ${
              delta > 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'
            }`}
          >
            {resDef?.name ?? id}: {delta > 0 ? '+' : ''}{delta}
          </span>
        );
      })}
    </div>
  );
}

function CombatSection({ combats, theme }: { combats: CombatResultSummary[]; theme?: ThemePackage }) {
  if (combats.length === 0) return null;
  return (
    <SummarySection title="Combat">
      {combats.map((cr, i) => {
        const atkName = theme?.civilizations.find((c) => c.id === cr.attackerCivId)?.name ?? cr.attackerCivId;
        const defName = theme?.civilizations.find((c) => c.id === cr.defenderCivId)?.name ?? cr.defenderCivId;
        const outcomeLabel = cr.outcome === 'attacker_wins' ? 'Victory' : cr.outcome === 'defender_wins' ? 'Defeat' : 'Draw';
        const outcomeColor = cr.outcome === 'attacker_wins' ? 'text-emerald-400' : cr.outcome === 'defender_wins' ? 'text-red-400' : 'text-amber-400';
        return (
          <p key={i} className="text-sm text-stone-300">
            {atkName} vs {defName} at ({cr.coord.col},{cr.coord.row}) \u2014{' '}
            <span className={`font-medium ${outcomeColor}`}>{outcomeLabel}</span>.
            Lost {cr.attackerStrengthLost} atk / {cr.defenderStrengthLost} def strength.
          </p>
        );
      })}
    </SummarySection>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">{title}</h4>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NarrativeSection({ lines, phase }: { lines: string[]; phase: string }) {
  if (lines.length === 0) return null;
  return (
    <SummarySection title={phase}>
      {lines.map((line, i) => (
        <p key={i} className="text-sm text-stone-300">{line}</p>
      ))}
    </SummarySection>
  );
}

function categorizeNarrative(lines: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    let cat = 'Other';
    if (lower.includes('move') || lower.includes('march')) cat = 'Movement';
    else if (lower.includes('recruit') || lower.includes('spawn')) cat = 'Recruitment';
    else if (lower.includes('built') || lower.includes('construct')) cat = 'Construction';
    else if (lower.includes('research') || lower.includes('tech')) cat = 'Research';
    else if (lower.includes('grain') || lower.includes('dinar') || lower.includes('income') || lower.includes('upkeep')) cat = 'Economy';
    else if (lower.includes('stability') || lower.includes('morale') || lower.includes('revolt')) cat = 'Stability';
    else if (lower.includes('message') || lower.includes('peace') || lower.includes('war') || lower.includes('alliance') || lower.includes('diplo')) cat = 'Diplomacy';
    else if (lower.includes('event') || lower.includes('plague') || lower.includes('festival')) cat = 'Events';

    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(line);
  }
  return categories;
}

function WorldNews({ summary, civId, theme }: { summary: TurnSummary; civId: string; theme?: ThemePackage }) {
  const worldNews: string[] = [];
  for (const otherEntry of summary.entries) {
    if (otherEntry.civId === civId) continue;
    for (const cr of otherEntry.combatResults) {
      const atkName = theme?.civilizations.find((c) => c.id === cr.attackerCivId)?.name ?? cr.attackerCivId;
      const defName = theme?.civilizations.find((c) => c.id === cr.defenderCivId)?.name ?? cr.defenderCivId;
      worldNews.push(`${atkName} attacked ${defName} \u2014 ${cr.outcome.replace(/_/g, ' ')}`);
    }
    if (otherEntry.eliminated) {
      const civName = theme?.civilizations.find((c) => c.id === otherEntry.civId)?.name ?? otherEntry.civId;
      worldNews.push(`${civName} has been eliminated.`);
    }
  }
  const unique = [...new Set(worldNews)];
  if (unique.length === 0) return null;
  return (
    <SummarySection title="World News">
      {unique.map((news, i) => (
        <p key={i} className="text-sm text-stone-400">{news}</p>
      ))}
    </SummarySection>
  );
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
  const sectionOrder = ['Diplomacy', 'Movement', 'Economy', 'Construction', 'Research', 'Recruitment', 'Events', 'Stability', 'Other'];

  return (
    <Card className="p-4">
      {/* History nav */}
      {summaries.length > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setViewIdx((i) => Math.max(0, i - 1))}
            disabled={viewIdx === 0}
            className="text-xs text-stone-400 hover:text-stone-200 disabled:text-stone-600"
          >
            \u2190
          </button>
          <span className="text-xs text-stone-400">
            Turn {currentSummary.turnNumber}
          </span>
          <button
            onClick={() => setViewIdx((i) => Math.min(summaries.length - 1, i + 1))}
            disabled={viewIdx === summaries.length - 1}
            className="text-xs text-stone-400 hover:text-stone-200 disabled:text-stone-600"
          >
            \u2192
          </button>
        </div>
      )}

      <h3 className="font-semibold text-stone-200 mb-3">Turn {currentSummary.turnNumber} Summary</h3>

      {/* Highlight reel */}
      <HighlightReel headlines={headlines} />

      {/* Resource deltas */}
      <ResourceDeltas deltas={entry.resourceDeltas} theme={theme} />

      {/* Combat section */}
      <CombatSection combats={entry.combatResults} theme={theme} />

      {/* Categorized narrative sections */}
      {sectionOrder.map((section) => {
        const lines = categorized[section];
        if (!lines || lines.length === 0) return null;
        return <NarrativeSection key={section} lines={lines} phase={section} />;
      })}

      {/* World news */}
      <WorldNews summary={currentSummary} civId={civId} theme={theme} />
    </Card>
  );
}
