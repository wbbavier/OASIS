'use client';
import Link from 'next/link';
import type { GameState } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { HexMap } from '@/components/map/HexMap';
import { CivDashboard } from '@/components/game/CivDashboard';
import { TurnPanel } from '@/components/game/TurnPanel';
import { TurnSummaryPanel } from '@/components/game/TurnSummaryPanel';
import { Spinner } from '@/components/ui/Spinner';
import { useGameState } from '@/lib/hooks/useGameState';

interface GameViewProps {
  gameId: string;
  gameName: string;
  theme: ThemePackage;
  currentUserId: string;
  currentCivId: string;
  humanPlayers: Array<{ playerId: string; civilizationId: string }>;
}

export function GameView({
  gameId,
  gameName,
  theme,
  currentUserId,
  currentCivId,
  humanPlayers,
}: GameViewProps) {
  const { gameState, loading, error, refresh } = useGameState(gameId);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Spinner size={32} className="text-indigo-400" />
      </div>
    );
  }

  if (error || !gameState) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-red-400">{error ?? 'Game state unavailable'}</p>
      </div>
    );
  }

  const civDef = theme.civilizations.find((c) => c.id === currentCivId);
  const civ = gameState.civilizations[currentCivId];
  const civColors = Object.fromEntries(
    theme.civilizations.map((c) => [c.id, c.color])
  );
  const lastSummary =
    gameState.turnHistory.length > 0
      ? gameState.turnHistory[gameState.turnHistory.length - 1]
      : null;
  const humanPlayerIds = humanPlayers.map((p) => p.playerId);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-stone-400 hover:text-stone-200">← Home</Link>
          <h1 className="text-xl font-bold text-stone-100">{gameName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-800 px-2 py-0.5 text-xs font-medium text-emerald-200">
            Active
          </span>
          <button
            onClick={refresh}
            className="text-xs text-stone-500 hover:text-stone-300 underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Last turn summary */}
      {lastSummary && civ && (
        <TurnSummaryPanel summary={lastSummary} civId={currentCivId} />
      )}

      {/* Map + Dashboard */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <HexMap
            map={gameState.map}
            currentCivId={currentCivId}
            civColors={civColors}
          />
        </div>

        {civ && civDef && (
          <CivDashboard
            civ={civ}
            civDef={civDef}
            allCivDefs={theme.civilizations}
            resources={theme.resources}
            turn={gameState.turn}
          />
        )}
      </div>

      {/* Turn panel */}
      {civ && (
        <TurnPanel
          gameId={gameId}
          gameState={gameState}
          theme={theme}
          currentUserId={currentUserId}
          currentCivId={currentCivId}
          humanPlayerIds={humanPlayerIds}
          onResolved={refresh}
        />
      )}
    </div>
  );
}
