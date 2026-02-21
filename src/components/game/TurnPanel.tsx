'use client';
import { useCallback, useEffect, useState } from 'react';
import type { GameState, PlayerOrders, AnyOrder } from '@/engine/types';
import type { ThemePackage } from '@/themes/schema';
import { supabase } from '@/lib/supabase';
import { resolveTurn } from '@/engine/turn-resolver';
import { createPRNGFromState } from '@/engine/prng';
import { generateAIOrders } from '@/engine/ai-governor';
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
  humanPlayerIds: string[];
  pendingOrders: AnyOrder[];
  setPendingOrders?: (orders: AnyOrder[]) => void;
  onResolved: () => void;
}

export function TurnPanel({
  gameId, gameState, theme, currentUserId, currentCivId,
  humanPlayerIds, pendingOrders, setPendingOrders, onResolved,
}: TurnPanelProps) {
  const [submitted, setSubmitted] = useState<SubmittedRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  function handleAutoFill() {
    if (!setPendingOrders) return;
    const prng = createPRNGFromState(gameState.rngState);
    const aiOrders = generateAIOrders(gameState, currentCivId, theme, prng, new Date().toISOString());
    setPendingOrders(aiOrders.orders);
  }

  function handleSubmitClick() {
    if (pendingOrders.length === 0) {
      handleSubmit();
    } else {
      setConfirming(true);
    }
  }

  async function handleSubmit() {
    setConfirming(false);
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
      const { data: updateRows, error: updateError } = await supabase
        .from('games')
        .update({
          game_state: newState as unknown as Record<string, unknown>,
          phase: newState.phase,
        })
        .eq('id', gameId)
        .eq('game_state->>turn', String(gameState.turn))
        .select('id');
      if (updateError) throw new Error(updateError.message);
      if (!updateRows || updateRows.length === 0) {
        setError('Turn already resolved by another player. Reloading\u2026');
        onResolved();
        return;
      }
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolution failed');
    }
    setResolving(false);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-700 bg-stone-900 px-5 py-3">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-stone-300">
            Turn {gameState.turn} \u2014{' '}
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

        <div className="flex items-center gap-2">
          {!alreadySubmitted && setPendingOrders && (
            <button
              onClick={handleAutoFill}
              className="text-xs text-amber-400 hover:text-amber-300 underline"
              title="Auto-fill orders using AI Governor heuristics"
            >
              AI Auto-fill
            </button>
          )}

          {allSubmitted ? (
            <Button onClick={handleResolve} disabled={resolving}>
              {resolving ? <span className="flex items-center gap-2"><Spinner size={14} /> Resolving\u2026</span> : 'Resolve Turn'}
            </Button>
          ) : alreadySubmitted ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">Waiting for others\u2026</span>
              <button
                onClick={() => {
                  setSubmitted((prev) => prev.filter((r) => r.player_id !== currentUserId));
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Revise Orders
              </button>
            </div>
          ) : (
            <Button onClick={handleSubmitClick} disabled={submitting}>
              {submitting ? <span className="flex items-center gap-2"><Spinner size={14} /> Submitting\u2026</span> : 'Submit Orders'}
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirming && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-2">
          <p className="text-sm text-amber-200 flex-1">
            Submit {pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''}?
          </p>
          <button
            onClick={handleSubmit}
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-stone-400 hover:text-stone-200"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
