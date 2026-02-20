'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AnyOrder, Hex, HexCoord, MoveOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { HexMap } from '@/components/map/HexMap';
import { TerrainLegend } from '@/components/map/TerrainLegend';
import { CivDashboard } from '@/components/game/CivDashboard';
import { TurnPanel } from '@/components/game/TurnPanel';
import { TurnSummaryPanel } from '@/components/game/TurnSummaryPanel';
import { OrdersPanel } from '@/components/game/OrdersPanel';
import { Spinner } from '@/components/ui/Spinner';
import { useGameState } from '@/lib/hooks/useGameState';
import { getReachableCoords } from '@/engine/pathfinding';

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
  const [pendingOrders, setPendingOrders] = useState<AnyOrder[]>([]);
  const [selectedCoord, setSelectedCoord] = useState<HexCoord | null>(null);
  const [reachableCoords, setReachableCoords] = useState<HexCoord[]>([]);

  // Reset pending orders and selection when the turn number changes
  useEffect(() => {
    setPendingOrders([]);
    setSelectedCoord(null);
    setReachableCoords([]);
  }, [gameState?.turn]);

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
  const civNames = Object.fromEntries(
    theme.civilizations.map((c) => [c.id, c.name])
  );
  const lastSummary =
    gameState.turnHistory.length > 0
      ? gameState.turnHistory[gameState.turnHistory.length - 1]
      : null;
  const humanPlayerIds = humanPlayers.map((p) => p.playerId);
  const isGameOver = gameState.phase === 'completed';

  // Resource deltas from last turn summary
  const resourceDeltas = lastSummary?.entries.find((e) => e.civId === currentCivId)?.resourceDeltas ?? {};

  // Extract victory message from last summary's victory_defeat log messages
  const victoryMessage = lastSummary?.entries
    .flatMap((e) => e.narrativeLines)
    .find((line) => line.includes('victory') || line.includes('Victory')) ?? null;

  function handleHexClick(hex: Hex) {
    if (!gameState) return;
    const playerUnitsOnHex = hex.units.filter(
      (u) => u.civilizationId === currentCivId,
    );

    // Case 1: a unit stack is selected and this is a reachable destination
    if (
      selectedCoord &&
      reachableCoords.some(
        (c) => c.col === hex.coord.col && c.row === hex.coord.row,
      )
    ) {
      const sourceHex = gameState.map
        .flat()
        .find(
          (h) =>
            h.coord.col === selectedCoord.col && h.coord.row === selectedCoord.row,
        );
      const unitsToMove =
        sourceHex?.units.filter((u) => u.civilizationId === currentCivId) ?? [];
      const path: HexCoord[] = [hex.coord];
      const newMoveOrders: MoveOrder[] = unitsToMove.map((u) => ({
        kind: 'move' as const,
        unitId: u.id,
        path,
      }));
      // Replace any existing move orders for these units
      const unitIds = new Set(unitsToMove.map((u) => u.id));
      setPendingOrders([
        ...pendingOrders.filter(
          (o) => !(o.kind === 'move' && unitIds.has(o.unitId)),
        ),
        ...newMoveOrders,
      ]);
      setSelectedCoord(null);
      setReachableCoords([]);
      return;
    }

    // Case 2: click a hex that has player units → select it
    if (playerUnitsOnHex.length > 0) {
      const maxMoves = Math.min(...playerUnitsOnHex.map((u) => u.movesRemaining));
      const reachable =
        maxMoves > 0
          ? getReachableCoords(gameState.map, hex.coord, maxMoves)
          : [];
      setSelectedCoord(hex.coord);
      setReachableCoords(reachable);
      return;
    }

    // Case 3: click elsewhere → deselect
    setSelectedCoord(null);
    setReachableCoords([]);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-stone-400 hover:text-stone-200">← Home</Link>
          <h1 className="text-xl font-bold text-stone-100">{gameName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            isGameOver
              ? 'bg-amber-800 text-amber-200'
              : 'bg-emerald-800 text-emerald-200'
          }`}>
            {isGameOver ? 'Completed' : 'Active'}
          </span>
          <button
            onClick={refresh}
            className="text-xs text-stone-500 hover:text-stone-300 underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Game over banner */}
      {isGameOver && (
        <div className="rounded-xl border-2 border-amber-500 bg-amber-900/30 px-6 py-4 text-center">
          <h2 className="text-2xl font-bold text-amber-300 mb-1">Game Over</h2>
          {victoryMessage ? (
            <p className="text-stone-200">{victoryMessage}</p>
          ) : (
            <p className="text-stone-300">The game has ended.</p>
          )}
        </div>
      )}

      {/* Last turn summary */}
      {lastSummary && civ && (
        <TurnSummaryPanel summary={lastSummary} civId={currentCivId} theme={theme} />
      )}

      {/* Map + Dashboard */}
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0">
          {selectedCoord && (
            <p className="mb-1 text-xs text-emerald-400">
              Unit selected — click a highlighted hex to move, or click elsewhere to cancel.
            </p>
          )}
          <HexMap
            map={gameState.map}
            currentCivId={currentCivId}
            civColors={civColors}
            civNames={civNames}
            onHexClick={handleHexClick}
            selectedCoord={selectedCoord}
            reachableCoords={reachableCoords}
            fogOfWar={gameState.config.fogOfWar}
          />
          <TerrainLegend />
        </div>

        {civ && civDef && (
          <CivDashboard
            civ={civ}
            civDef={civDef}
            allCivDefs={theme.civilizations}
            resources={theme.resources}
            turn={gameState.turn}
            resourceDeltas={resourceDeltas}
          />
        )}
      </div>

      {/* Orders panel (hidden when game is over) */}
      {civ && !isGameOver && (
        <OrdersPanel
          gameState={gameState}
          theme={theme}
          currentCivId={currentCivId}
          pendingOrders={pendingOrders}
          setPendingOrders={setPendingOrders}
        />
      )}

      {/* Turn panel (hidden when game is over) */}
      {civ && !isGameOver && (
        <TurnPanel
          gameId={gameId}
          gameState={gameState}
          theme={theme}
          currentUserId={currentUserId}
          currentCivId={currentCivId}
          humanPlayerIds={humanPlayerIds}
          pendingOrders={pendingOrders}
          onResolved={refresh}
        />
      )}
    </div>
  );
}
