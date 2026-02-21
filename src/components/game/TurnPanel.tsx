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
import { SubmitConfirmation } from './SubmitConfirmation';

interface SubmittedRow { player_id: string; civilization_id: string }
interface TurnOrderRow { orders: unknown }

interface TurnPanelProps {
  gameId: string; gameState: GameState; theme: ThemePackage;
  currentUserId: string; currentCivId: string; humanPlayerIds: string[];
  pendingOrders: AnyOrder[]; setPendingOrders?: (orders: AnyOrder[]) => void;
  onResolved: () => void;
}

export function TurnPanel({ gameId, gameState, theme, currentUserId, currentCivId,
  humanPlayerIds, pendingOrders, setPendingOrders, onResolved }: TurnPanelProps) {
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
    const ai = generateAIOrders(gameState, currentCivId, theme, prng, new Date().toISOString());
    setPendingOrders(ai.orders);
  }

  async function handleSubmit() {
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    const orders: PlayerOrders = {
      playerId: currentUserId, civilizationId: currentCivId,
      turnNumber: gameState.turn, orders: pendingOrders,
      submittedAt: new Date().toISOString(),
    };
    const { error: e } = await supabase.from('turn_orders').upsert(
      { game_id: gameId, player_id: currentUserId, civilization_id: currentCivId,
        turn_number: gameState.turn, orders },
      { onConflict: 'game_id,civilization_id,turn_number' }
    );
    if (e) setError(e.message);
    else await loadSubmissions();
    setSubmitting(false);
  }

  async function handleResolve() {
    setResolving(true);
    setError(null);
    try {
      const prng = createPRNGFromState(gameState.rngState);
      const { data: rows, error: fe } = await supabase
        .from('turn_orders').select('orders')
        .eq('game_id', gameId).eq('turn_number', gameState.turn);
      if (fe) throw new Error(fe.message);
      const so: PlayerOrders[] = ((rows as TurnOrderRow[]) ?? []).map(
        (r) => r.orders as unknown as PlayerOrders);
      const { state: ns } = resolveTurn(gameState, so, theme, prng, new Date().toISOString());
      const { data: ur, error: ue } = await supabase.from('games')
        .update({ game_state: ns as unknown as Record<string, unknown>, phase: ns.phase })
        .eq('id', gameId).eq('game_state->>turn', String(gameState.turn)).select('id');
      if (ue) throw new Error(ue.message);
      if (!ur || ur.length === 0) {
        setError('Turn already resolved. Reloading\u2026');
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
            Turn {gameState.turn} {'\u2014'}{' '}
            <span className="text-stone-400">{submitted.length}/{humanPlayerIds.length} submitted</span>
          </p>
          {pendingOrders.length > 0 && !alreadySubmitted && (
            <p className="text-xs text-indigo-400 mt-0.5">
              {pendingOrders.length} order{pendingOrders.length !== 1 ? 's' : ''} ready
            </p>
          )}
          {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!alreadySubmitted && setPendingOrders && (
            <button onClick={handleAutoFill}
              className="text-xs text-amber-400 hover:text-amber-300 underline"
              title="Auto-fill orders using AI Governor">AI Auto-fill</button>
          )}
          {allSubmitted ? (
            <Button onClick={handleResolve} disabled={resolving}>
              {resolving ? <span className="flex items-center gap-2"><Spinner size={14} /> Resolving{'\u2026'}</span> : 'Resolve Turn'}
            </Button>
          ) : alreadySubmitted ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">Waiting{'\u2026'}</span>
              <button onClick={() => setSubmitted((p) => p.filter((r) => r.player_id !== currentUserId))}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline">Revise</button>
            </div>
          ) : (
            <Button onClick={() => pendingOrders.length > 0 ? setConfirming(true) : handleSubmit()} disabled={submitting}>
              {submitting ? <span className="flex items-center gap-2"><Spinner size={14} /> Submitting{'\u2026'}</span> : 'Submit Orders'}
            </Button>
          )}
        </div>
      </div>
      {confirming && (
        <SubmitConfirmation orderCount={pendingOrders.length}
          onConfirm={handleSubmit} onCancel={() => setConfirming(false)} />
      )}
    </div>
  );
}
