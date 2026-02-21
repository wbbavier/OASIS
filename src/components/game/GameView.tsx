// Turn deadline enforcement: client-side auto-resolve.
// When lastResolvedAt + turnDeadlineDays has elapsed, the client auto-fills
// missing orders via AI governor and resolves the turn. This approach was
// chosen over server-side enforcement because the game runs entirely on
// free-tier Supabase with no server functions.

'use client';
import { useState, useEffect, useRef } from 'react';
import type { AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { HexMap } from '@/components/map/HexMap';
import { TerrainLegend } from '@/components/map/TerrainLegend';
import { CivDashboard } from '@/components/game/CivDashboard';
import { TurnPanel } from '@/components/game/TurnPanel';
import { TurnBanner } from '@/components/game/TurnBanner';
import { TurnSummaryPanel } from '@/components/game/TurnSummaryPanel';
import { OrdersPanel } from '@/components/game/OrdersPanel';
import { GameHeader } from '@/components/game/GameHeader';
import { Spinner } from '@/components/ui/Spinner';
import { useGameState } from '@/lib/hooks/useGameState';
import { useHexSelection } from '@/lib/hooks/useHexSelection';
import { supabase } from '@/lib/supabase';
import { resolveTurn } from '@/engine/turn-resolver';
import { createPRNGFromState } from '@/engine/prng';

interface GameViewProps {
  gameId: string;
  gameName: string;
  theme: ThemePackage;
  currentUserId: string;
  currentCivId: string;
  humanPlayers: Array<{ playerId: string; civilizationId: string }>;
}

export function GameView({
  gameId, gameName, theme, currentUserId, currentCivId, humanPlayers,
}: GameViewProps) {
  const { gameState, loading, error, refresh } = useGameState(gameId);
  const [pendingOrders, setPendingOrders] = useState<AnyOrder[]>([]);

  const { selectedCoord, reachableCoords, handleHexClick } =
    useHexSelection(gameState, currentCivId, pendingOrders, setPendingOrders);

  useEffect(() => {
    setPendingOrders([]);
  }, [gameState?.turn]);

  // Turn deadline enforcement: auto-resolve if deadline has passed
  const deadlineResolved = useRef(false);
  useEffect(() => {
    if (!gameState || gameState.phase !== 'active' || deadlineResolved.current) return;
    const deadlineDays = gameState.config.turnDeadlineDays;
    if (deadlineDays <= 0) return;

    const baseTime = gameState.lastResolvedAt ?? gameState.createdAt;
    const deadlineMs = new Date(baseTime).getTime() + deadlineDays * 24 * 60 * 60 * 1000;
    if (Date.now() < deadlineMs) return;

    deadlineResolved.current = true;
    (async () => {
      try {
        const prng = createPRNGFromState(gameState.rngState);
        const now = new Date().toISOString();
        // Fetch submitted orders
        const { data: rows } = await supabase
          .from('turn_orders').select('orders')
          .eq('game_id', gameId).eq('turn_number', gameState.turn);
        const submittedOrders = (rows ?? []).map(
          (r: { orders: unknown }) => r.orders as unknown as import('@/engine/types').PlayerOrders,
        );
        const { state: ns } = resolveTurn(gameState, submittedOrders, theme, prng, now);
        await supabase.from('games')
          .update({ game_state: ns as unknown as Record<string, unknown>, phase: ns.phase })
          .eq('id', gameId).eq('game_state->>turn', String(gameState.turn));
        refresh();
      } catch {
        // Silently fail — another client may have already resolved
      }
    })();
  }, [gameState, gameId, theme, refresh]);

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
  const civColors = Object.fromEntries(theme.civilizations.map((c) => [c.id, c.color]));
  const civNames = Object.fromEntries(theme.civilizations.map((c) => [c.id, c.name]));
  const lastSummary = gameState.turnHistory.at(-1) ?? null;
  const humanPlayerIds = humanPlayers.map((p) => p.playerId);
  const isGameOver = gameState.phase === 'completed';
  const resourceDeltas = lastSummary?.entries.find((e) => e.civId === currentCivId)?.resourceDeltas ?? {};

  return (
    <div className="flex flex-col gap-3">
      <GameHeader gameName={gameName} isGameOver={isGameOver} onRefresh={refresh} />

      {civ && civDef && (
        <TurnBanner gameState={gameState} theme={theme}
          civId={currentCivId} civColor={civDef.color} civName={civDef.name} />
      )}

      {isGameOver && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-900/30 px-6 py-4 text-center">
          <h2 className="text-2xl font-bold text-amber-300 mb-1">Game Over</h2>
          <p className="text-stone-300">The game has ended.</p>
        </div>
      )}

      {lastSummary && civ && (
        <TurnSummaryPanel summary={lastSummary} civId={currentCivId}
          theme={theme} allSummaries={gameState.turnHistory} />
      )}

      <div className="flex flex-col lg:flex-row gap-3 items-start">
        <div className="flex-1 min-w-0">
          {selectedCoord && (
            <p className="mb-1 text-xs text-emerald-400">
              Unit selected {'\u2014'} click a highlighted hex to move, or click elsewhere to cancel.
            </p>
          )}
          <HexMap map={gameState.map} currentCivId={currentCivId}
            civColors={civColors} civNames={civNames}
            onHexClick={handleHexClick} selectedCoord={selectedCoord}
            reachableCoords={reachableCoords} fogOfWar={gameState.config.fogOfWar} />
          <TerrainLegend />
        </div>
        <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-3 max-h-[40vh] md:max-h-none overflow-y-auto">
          {civ && civDef && (
            <CivDashboard civ={civ} civDef={civDef} allCivDefs={theme.civilizations}
              resources={theme.resources} turn={gameState.turn} resourceDeltas={resourceDeltas} />
          )}
        </div>
      </div>

      {civ && !isGameOver && (
        <OrdersPanel gameState={gameState} theme={theme} currentCivId={currentCivId}
          pendingOrders={pendingOrders} setPendingOrders={setPendingOrders} />
      )}

      {civ && !isGameOver && (
        <TurnPanel gameId={gameId} gameState={gameState} theme={theme}
          currentUserId={currentUserId} currentCivId={currentCivId}
          humanPlayerIds={humanPlayerIds} pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders} onResolved={refresh} />
      )}
    </div>
  );
}
