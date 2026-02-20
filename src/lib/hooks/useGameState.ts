'use client';
import { useCallback, useEffect, useState } from 'react';
import type { GameState } from '@/engine/types';
import { supabase } from '@/lib/supabase';

interface UseGameStateResult {
  gameState: GameState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGameState(gameId: string): UseGameStateResult {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('games')
      .select('game_state')
      .eq('id', gameId)
      .single();
    if (queryError) {
      setError(queryError.message);
    } else {
      setGameState((data?.game_state as unknown as GameState) ?? null);
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    load();
    // Poll every 30 s for updates from other players
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return { gameState, loading, error, refresh: load };
}
