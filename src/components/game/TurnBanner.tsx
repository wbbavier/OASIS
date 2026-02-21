// Turn phase indicator banner — always visible at top of game view.

import type { GameState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';

interface TurnBannerProps {
  gameState: GameState;
  theme: ThemePackage;
  civId: string;
  civColor: string;
  civName: string;
}

function getSeasonName(turn: number, theme: ThemePackage): string {
  const { turnCycleNames, turnCycleLength } = theme.mechanics;
  if (turnCycleNames.length === 0 || turnCycleLength === 0) return '';
  const idx = (turn - 1) % turnCycleLength;
  return turnCycleNames[idx] ?? '';
}

function getPhaseLabel(phase: string, hasSubmitted: boolean): string {
  if (phase === 'completed') return 'Game Over';
  if (phase === 'lobby') return 'Waiting for Players';
  if (phase === 'paused') return 'Paused';
  return hasSubmitted ? 'Waiting for Resolution' : 'Orders Phase';
}

export function TurnBanner({ gameState, theme, civId, civColor, civName }: TurnBannerProps) {
  const season = getSeasonName(gameState.turn, theme);
  const civ = gameState.civilizations[civId];
  const resources = theme.resources;

  // Compact resource display
  const resourceIcons: Record<string, string> = {
    dinars: '\ud83d\udcb0',
    grain: '\ud83c\udf3e',
    iron: '\u2694\ufe0f',
    trade_goods: '\ud83d\udce6',
    culture: '\ud83c\udfad',
    faith: '\u26ea',
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-700 bg-stone-900 px-4 py-2">
      {/* Civ identity */}
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: civColor }} />
        <span className="text-sm font-semibold text-stone-100">{civName}</span>
      </div>

      <div className="h-4 w-px bg-stone-700" />

      {/* Turn info */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-stone-200">
          Turn {gameState.turn}
        </span>
        {season && (
          <span className="rounded bg-stone-800 px-1.5 py-0.5 text-xs text-stone-400">
            {season}
          </span>
        )}
        <span className="text-xs text-stone-500">
          {getPhaseLabel(gameState.phase, false)}
        </span>
      </div>

      <div className="flex-1" />

      {/* Compact resources */}
      {civ && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {resources.slice(0, 4).map((r) => {
            const icon = resourceIcons[r.id] ?? '';
            const val = civ.resources[r.id] ?? 0;
            return (
              <span key={r.id} className="flex items-center gap-1 text-xs text-stone-300" title={r.name}>
                <span>{icon}</span>
                <span className="font-mono">{val}</span>
              </span>
            );
          })}
          <span className="text-xs text-stone-400" title="Stability">
            \ud83d\udcca {civ.stability}
          </span>
        </div>
      )}
    </div>
  );
}
