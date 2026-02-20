'use client';
import { useCallback, useEffect, useState } from 'react';
import type { GameState, PlayerOrders, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { supabase } from '@/lib/supabase';
import { resolveTurn } from '@/engine/turn-resolver';
import { createPRNGFromState } from '@/engine/prng';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface SubmittedRow {
  player_id: string;
  civilization_id: string;
}

interface TurnOrderRow {
  orders: unknown;
}

interface TurnPanelProps {
  gameId: string;
  gameState: GameState;
  theme: ThemePackage;
  currentUserId: string;
  currentCivId: string;
  humanPlayerIds: string[];     // all human player_ids in this game
  pendingOrders: AnyOrder[];    // accumulated orders from OrdersPanel
  onResolved: () => void;       // called after turn resolves so parent can refresh
}

export function TurnPanel({
  gameId,
  gameState,
  theme,
  currentUserId,
  currentCivId,
  humanPlayerIds,
  pendingOrders,
  onResolved,
}: TurnPanelProps) {
  const [submitted, setSubmitted] = useState<SubmittedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSubmissions = useCallback(async () => {
    const { data } = await supabase
      .from('turn_orders')
      .select('player_id, civilization_id')
      .eq('game_id', gameId)
      .eq('turn_number', gameState.turn);
    setSubmitted((data as SubmittedRow[]) ?? []);
  }, [gameId, gameState.turn]);

  useEffect(() => {
    loadSubmissions();
    const interval = setInterval(loadSubmissions, 15_000);
    return () => clearInterval(interval);
  }, [loadSubmissions]);

  const alreadySubmitted = submitted.some((r) => r.player_id === currentUserId);
  const allSubmitted = humanPlayerIds.every((pid) => submitted.some((r) => r.player_id === pid));

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const orders: PlayerOrders = {
      playerId: currentUserId,
      civilizationId: currentCivId,
      turnNumber: gameState.turn,
      orders: pendingOrders,
      submittedAt: new Date().toISOString(),
    };
    const { error: upsertError } = await supabase.from('turn_orders').upsert(
      {
        game_id: gameId,
        player_id: currentUserId,
        civilization_id: currentCivId,
        turn_number: gameState.turn,
        orders,
      },
      { onConflict: 'game_id,civilization_id,turn_number' }
    );
    if (upsertError) setError(upsertError.message);
    else await loadSubmissions();
    setSubmitting(false);
  }

  async function handleResolve() {
    setResolving(true);
    setError(null);
    try {
      const resolvedAt = new Date().toISOString();
      const prng = createPRNGFromState(gameState.rngState);

      // Load actual stored orders from DB instead of building empty ones
      const { data: orderRows, error: fetchError } = await supabase
        .from('turn_orders')
        .select('orders')
        .eq('game_id', gameId)
        .eq('turn_number', gameState.turn);
      if (fetchError) throw new Error(fetchError.message);

      const submittedOrders: PlayerOrders[] = ((orderRows as TurnOrderRow[]) ?? []).map(
        (r) => r.orders as unknown as PlayerOrders
      );

      const { state: newState } = resolveTurn(gameState, submittedOrders, theme, prng, resolvedAt);

      const { error: updateError } = await supabase
        .from('games')
        .update({ game_state: newState as unknown as Record<string, unknown> })
        .eq('id', gameId);
      if (updateError) throw new Error(updateError.message);

      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    }
    setResolving(false);
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-stone-700 bg-stone-900 px-5 py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-stone-300">
          Turn {gameState.turn} —{' '}
          <span className="text-stone-400">
            {submitted.length}/{humanPlayerIds.length} submitted
          </span>
        </p>
        {pendingOrders.length > 0 && !alreadySubmitted && (
          <p className="text-xs text-indigo-400 mt-0.5">
            {pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} ready to submit
          </p>
        )}
        {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
      </div>

      {allSubmitted ? (
        <Button onClick={handleResolve} disabled={resolving}>
          {resolving ? <span className="flex items-center gap-2"><Spinner size={14} /> Resolving…</span> : 'Resolve Turn'}
        </Button>
      ) : alreadySubmitted ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500">Waiting for others…</span>
          <button
            onClick={() => {
              // Allow order revision by removing this player's submission from the local state
              setSubmitted((prev) => prev.filter((r) => r.player_id !== currentUserId));
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Revise Orders
          </button>
        </div>
      ) : (
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? <span className="flex items-center gap-2"><Spinner size={14} /> Submitting…</span> : 'Submit Turn'}
        </Button>
      )}
    </div>
  );
}
